import json
import re
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session, joinedload

import models
from dtos.movementsDTO import MovementCreateDTO
from dtos.retiroDTO import RetiroDTO
from dtos.trasladoDTO import TrasladoDTO
from dtos.turnBackDTO import DevolucionDTO
from historial import devolver_item, retirar_item, trasladar_item
from item_import import record_carga
from item_service import ItemServiceError, adjust_item_stock
from movements import execute_movement, validate_movement
from telegram.identity import find_user_by_telegram_id, normalize_telegram_id
from whatsapp.phone import find_user_by_phone, is_confirm_no, is_confirm_yes, normalize_phone
from whatsapp.resolve import (
    find_items,
    find_sheds,
    format_item_list,
    item_label,
    pending_outside_lines,
    resolve_from_location,
)
from whatsapp.sessions import clear_pending, load_pending, save_pending

JSON_TEMPLATE = """{
  "action": "retiro",
  "where": "C15",
  "from": "Galpon San Martin / Baño",
  "elemento": "Pala",
  "cantidad": 2,
  "quien": ""
}"""

ALLOWED_ACTIONS = {"consulta", "retiro", "devolucion", "ingreso", "traslado"}

HELP_EXAMPLES = """Ejemplos:
• stock pala
• dónde está pala
• stock todo
• inventario Oficina
• retirar 2 pala a Obra Norte
• devolver 1 pala
• ingresar 5 cemento
• trasladar 3 pala de Oficina a Galpón

Para confirmar un movimiento pendiente: sí / no
Escribí /ayuda cuando quieras ver esto de nuevo."""

COMMAND_HINTS = {
    "stock": (
        "Consultá stock así:\n"
        "• stock pala\n"
        "• dónde está pala\n"
        "• stock todo\n"
        "• inventario Oficina"
    ),
    "donde": (
        "Preguntá la ubicación así:\n"
        "• dónde está pala\n"
        "• stock pala"
    ),
    "retirar": (
        "Para retirar:\n"
        "• retirar 2 pala a C15\n"
        "• retirar 4 pala a TVS de Av. San Martin / Oficina"
    ),
    "devolver": (
        "Para devolver:\n"
        "• devolver 1 pala\n"
        "• devolver 2 pala de C15"
    ),
    "ingresar": (
        "Para ingresar stock:\n"
        "• ingresar 5 cemento\n"
        "• ingresar 10 pala a Oficina"
    ),
    "trasladar": (
        "Para trasladar:\n"
        "• trasladar 3 pala de Oficina a Galpón\n"
        "• trasladar 2 pala de C15 a TVS"
    ),
    "pendientes": (
        "Si el bot te pide confirmación, respondé sí o no.\n"
        "Los retiros sin devolver aparecen en Pendientes de la web "
        "y también cuando preguntás stock / dónde está."
    ),
}


def help_reply(user_name: str, channel: str) -> dict:
    return ok_reply(
        f"Hola {user_name}. Podés consultar o mover stock por {channel}.\n\n"
        f"{HELP_EXAMPLES}"
    )


def normalize_bot_text(text: str) -> str:
    """Strip Telegram /command@bot prefixes so ' /stock pala ' → 'stock pala'."""
    compact = " ".join((text or "").strip().split())
    if not compact.startswith("/"):
        return compact
    first, *rest = compact.split(maxsplit=1)
    cmd = first[1:].split("@", 1)[0].lower()
    if cmd in ("start", "help", "ayuda"):
        return f"/{cmd}"
    if rest:
        # /stock pala → stock pala  |  /retirar 2 pala a C15 → retirar 2 pala a C15
        return f"{cmd} {rest[0]}".strip()
    return cmd


class WhatsAppActionDTO(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    phone: Optional[str] = None
    telegram_id: Optional[str] = None
    text: Optional[str] = None
    action: Optional[str] = None
    where: Optional[str] = None
    from_: Optional[str] = Field(default=None, alias="from")
    elemento: Optional[str] = None
    cantidad: Optional[int] = None
    quien: Optional[str] = None
    confirm: Optional[bool] = None

    @field_validator("cantidad", mode="before")
    @classmethod
    def coerce_cantidad(cls, value):
        if value is None or value == "":
            return None
        return int(value)

    @field_validator("action", "where", "from_", "elemento", "quien", "text", "phone", "telegram_id", mode="before")
    @classmethod
    def strip_strings(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @model_validator(mode="after")
    def require_identity(self):
        if not self.phone and not self.telegram_id:
            raise ValueError("phone o telegram_id es obligatorio")
        return self


def unauthorized_reply(telegram_id: str | None = None) -> dict:
    if telegram_id:
        reply = (
            "Este Telegram no está vinculado a tu usuario.\n\n"
            "Pedile a un admin que en Usuarios toque Link Telegram "
            "y te mande el enlace (o tocá Telegram en el menú de la web).\n\n"
            f"Tu Telegram ID es {telegram_id}."
        )
    else:
        reply = (
            "Tu número no está autorizado. Pedile a un administrador "
            "que lo registre en el sistema."
        )
    return {
        "ok": False,
        "authorized": False,
        "needs_json": False,
        "needs_confirm": False,
        "reply": reply,
    }


def session_key_for(dto: WhatsAppActionDTO) -> str:
    telegram_id = normalize_telegram_id(dto.telegram_id) if dto.telegram_id else None
    if telegram_id:
        return f"tg:{telegram_id}"
    return normalize_phone(dto.phone) or (dto.phone or "")


def resolve_user(db: Session, dto: WhatsAppActionDTO):
    telegram_id = normalize_telegram_id(dto.telegram_id) if dto.telegram_id else None
    if telegram_id:
        return find_user_by_telegram_id(db, telegram_id), telegram_id
    return find_user_by_phone(db, dto.phone or ""), None


def json_help_reply(extra: str | None = None) -> dict:
    prefix = extra.strip() + "\n\n" if extra else ""
    return {
        "ok": False,
        "authorized": True,
        "needs_json": True,
        "needs_confirm": False,
        "reply": (
            f"{prefix}No entendí el mensaje.\n\n"
            f"{HELP_EXAMPLES}\n\n"
            "También podés mandar JSON:\n"
            f"{JSON_TEMPLATE}"
        ),
        "template": json.loads(JSON_TEMPLATE),
    }


def ok_reply(text: str, **extra) -> dict:
    payload = {
        "ok": True,
        "authorized": True,
        "needs_json": False,
        "needs_confirm": False,
        "reply": text,
    }
    payload.update(extra)
    return payload


def user_as_current(user: models.User) -> dict:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return {"username": user.email, "user_id": user.id, "role": role}


def extract_json_blob(text: str) -> dict | None:
    if not text:
        return None
    stripped = text.strip()
    candidates = [stripped]
    match = re.search(r"\{[\s\S]*\}", stripped)
    if match:
        candidates.append(match.group(0))
    for candidate in candidates:
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            return data
    return None


def merge_payload(dto: WhatsAppActionDTO) -> dict:
    data = {
        "action": (dto.action or "").strip().lower() or None,
        "where": dto.where,
        "from": dto.from_,
        "elemento": dto.elemento,
        "cantidad": dto.cantidad,
        "quien": dto.quien,
    }
    blob = extract_json_blob(dto.text or "")
    if blob:
        if blob.get("action"):
            data["action"] = str(blob.get("action")).strip().lower()
        for key in ("where", "from", "elemento", "quien"):
            if blob.get(key) not in (None, ""):
                data[key] = str(blob.get(key)).strip()
        alias_quien = blob.get("quien_retira") or blob.get("quien_devuelve") or blob.get("persona")
        if not data.get("quien") and alias_quien not in (None, ""):
            data["quien"] = str(alias_quien).strip()
        if blob.get("cantidad") not in (None, ""):
            try:
                data["cantidad"] = int(blob.get("cantidad"))
            except (TypeError, ValueError):
                pass
    if dto.text and not blob:
        inferred = parse_free_text(dto.text)
        for key, value in inferred.items():
            if value not in (None, "") and not data.get(key):
                data[key] = value
    if not data["action"]:
        data["action"] = infer_action(data)
    return data


def infer_action(data: dict) -> str | None:
    if data.get("cantidad") in (None, "") and data.get("elemento"):
        return "consulta"
    if data.get("cantidad") and data.get("elemento") and data.get("where"):
        return "retiro"
    return None


def _singularize(name: str) -> str:
    n = name.strip()
    if len(n) > 3 and n[-1].lower() == "s" and n[-2].lower() != "s":
        return n[:-1]
    return n


def _split_dest_origin(rest: str) -> tuple[str, str | None, str | None]:
    dest_parts = re.split(r"\s+(?:a|para)\s+", rest, maxsplit=1, flags=re.I)
    elemento = dest_parts[0].strip()
    where = from_ = None
    if len(dest_parts) > 1:
        origin_parts = re.split(r"\s+(?:de|desde|from)\s+", dest_parts[1], maxsplit=1, flags=re.I)
        where = origin_parts[0].strip() or None
        if len(origin_parts) > 1:
            from_ = origin_parts[1].strip() or None
    else:
        origin_parts = re.split(r"\s+(?:de|desde|from)\s+", rest, maxsplit=1, flags=re.I)
        if len(origin_parts) > 1:
            elemento = origin_parts[0].strip()
            from_ = origin_parts[1].strip() or None
    return _singularize(elemento), where, from_


def parse_free_text(text: str) -> dict:
    """Turn short Spanish WhatsApp phrases into the same fields as the JSON."""
    if not text:
        return {}
    compact = " ".join(text.strip().split())
    if not compact or compact.startswith("{"):
        return {}

    if re.match(
        r"^(?:stock|inventario|consulta(?:r)?)\s*(?:todo|completo|general)?$",
        compact,
        re.I,
    ):
        return {"action": "consulta"}

    inventario_lugar = re.match(
        r"^(?:stock|inventario|consulta(?:r)?)\s+(?:en\s+|de\s+)?(.+)$",
        compact,
        re.I,
    )
    if inventario_lugar:
        rest = inventario_lugar.group(1).strip(" .?!")
        if re.match(r"^(?:todo|completo|general)$", rest, re.I):
            return {"action": "consulta"}
        if re.match(r"^(?:de\s+)?todo(?:\s+el\s+inventario)?$", rest, re.I):
            return {"action": "consulta"}
        # "stock pala" = ítem; "inventario Oficina" = depósito
        if re.match(r"^(?:stock|consulta(?:r)?)\b", compact, re.I):
            elemento = _singularize(rest)
            return {"action": "consulta", "elemento": elemento} if elemento else {}
        return {"action": "consulta", "from": rest}

    donde = re.match(
        r"^(?:d[oó]nde\s+(?:est[aá]|hay)|ubicaci[oó]n\s+de)\s+(.+)$",
        compact,
        re.I,
    )
    if donde:
        elemento = _singularize(donde.group(1).strip(" .?!"))
        return {"action": "consulta", "elemento": elemento} if elemento else {}

    cuanto = re.match(
        r"^(?:cu[aá]nt[oa]s?|hay)\s+(?:hay\s+)?(?:de\s+)?(.+?)(?:\s+hay)?$",
        compact,
        re.I,
    )
    if cuanto:
        elemento = _singularize(cuanto.group(1).strip(" .?!"))
        if elemento and not re.match(r"^\d+$", elemento):
            return {"action": "consulta", "elemento": elemento}

    retiro = re.match(
        r"^(?:retir(?:ar|a|o|[áa])|sac(?:ar|[áa]|a))\s+(\d+)\s+(.+)$",
        compact,
        re.I,
    )
    if retiro:
        elemento, where, from_ = _split_dest_origin(retiro.group(2).strip())
        data = {"action": "retiro", "elemento": elemento, "cantidad": int(retiro.group(1))}
        if where:
            data["where"] = where
        if from_:
            data["from"] = from_
        return data

    devolucion = re.match(
        r"^(?:devol(?:ver|v[eé]|uci[oó]n)|devuelv[eo])\s+(?:(\d+)\s+)?(.+)$",
        compact,
        re.I,
    )
    if devolucion:
        elemento, where, from_ = _split_dest_origin(devolucion.group(2).strip())
        data = {"action": "devolucion", "elemento": elemento}
        if devolucion.group(1):
            data["cantidad"] = int(devolucion.group(1))
        if where:
            data["where"] = where
        if from_:
            data["from"] = from_
        return data

    ingreso = re.match(
        r"^(?:ingres(?:ar|o|[áa])|cargar|carga)\s+(\d+)\s+(.+)$",
        compact,
        re.I,
    )
    if ingreso:
        elemento, where, from_ = _split_dest_origin(ingreso.group(2).strip())
        data = {
            "action": "ingreso",
            "elemento": elemento,
            "cantidad": int(ingreso.group(1)),
        }
        if where or from_:
            data["from"] = from_ or where
        return data

    traslado = re.match(
        r"^(?:traslad(?:ar|o|[áa])|mover|pas[aá])\s+(\d+)\s+(.+)$",
        compact,
        re.I,
    )
    if traslado:
        elemento, where, from_ = _split_dest_origin(traslado.group(2).strip())
        data = {"action": "traslado", "elemento": elemento, "cantidad": int(traslado.group(1))}
        if where:
            data["where"] = where
        if from_:
            data["from"] = from_
        return data

    return {}


def handle_action(db: Session, dto: WhatsAppActionDTO) -> dict:
    user, telegram_id = resolve_user(db, dto)
    if not user:
        return unauthorized_reply(telegram_id)

    session_key = session_key_for(dto)
    current_user = user_as_current(user)
    pending = load_pending(db, session_key)
    text = normalize_bot_text(dto.text or "")
    channel = "Telegram" if telegram_id else "WhatsApp"

    if text.lower().startswith("/start") or text.lower() in ("/help", "/ayuda", "ayuda", "help"):
        return help_reply(user.name, channel)

    hint = COMMAND_HINTS.get(text.lower())
    if hint:
        return ok_reply(f"Hola {user.name}.\n\n{hint}")

    if dto.confirm is True or (text and is_confirm_yes(text)):
        if not pending:
            return ok_reply("No hay ninguna operación pendiente para confirmar.")
        return execute_pending(db, user, current_user, session_key, pending)

    if dto.confirm is False or (text and is_confirm_no(text)):
        if not pending:
            return ok_reply("No había nada para cancelar.")
        clear_pending(db, session_key)
        return ok_reply("Cancelado. No se tocó el inventario.")

    # Re-parse with normalized text (slash commands like /stock pala)
    dto = dto.model_copy(update={"text": text})
    data = merge_payload(dto)
    has_fields = any(data.get(key) for key in ("action", "elemento", "where", "from", "cantidad"))
    blob = extract_json_blob(text) if text else None
    if text and not blob and not has_fields:
        return json_help_reply()
    if not has_fields and not blob:
        return json_help_reply()

    action = data.get("action")
    if action not in ALLOWED_ACTIONS:
        return json_help_reply("Falta o no es válida la acción.")

    try:
        if action == "consulta":
            return handle_consulta(db, data)
        prepared = prepare_mutation(db, user, data)
        if prepared.get("error"):
            return prepared["error"]
        save_pending(db, session_key, prepared["pending"])
        return {
            "ok": True,
            "authorized": True,
            "needs_json": False,
            "needs_confirm": True,
            "reply": prepared["confirm_text"],
        }
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return ok_reply(f"No se pudo hacer: {detail}")
    except ItemServiceError as exc:
        return ok_reply(f"No se pudo hacer: {exc.message}")


def handle_consulta(db: Session, data: dict) -> dict:
    location = resolve_from_location(db, data.get("from"))
    elemento = data.get("elemento")
    query = (
        db.query(models.Item)
        .options(joinedload(models.Item.shed), joinedload(models.Item.zone))
        .filter(models.Item.status == 1)
    )
    if elemento:
        items = find_items(db, elemento, location.shed, location.zone)
    else:
        if location.zone:
            query = query.filter(models.Item.zone_id == location.zone.id)
        elif location.shed:
            query = query.filter(models.Item.shed_id == location.shed.id)
        items = query.order_by(models.Item.name.asc()).all()

    sections: list[str] = []
    if items:
        if elemento:
            header = f"Stock de {elemento}:"
        elif location.shed:
            header = f"Inventario en {location.shed.name}:"
        else:
            header = "Inventario:"
        sections.append(f"{header}\n{format_item_list(items)}")

    if elemento:
        pending = pending_outside_lines(db, items, elemento)
        if pending:
            sections.append(
                "Fuera del galpón (pendiente de devolución):\n" + "\n".join(pending)
            )

    if not sections:
        return ok_reply("No encontré stock con esos datos.")
    return ok_reply("\n\n".join(sections))


def prepare_mutation(db: Session, user: models.User, data: dict) -> dict:
    action = data["action"]
    cantidad = data.get("cantidad")
    elemento = data.get("elemento")
    if not elemento:
        return {"error": json_help_reply("Falta elemento.")}
    if not cantidad or cantidad <= 0:
        return {"error": json_help_reply("Falta cantidad (número mayor a 0).")}

    quien = data.get("quien") or f"{user.name} {user.surname}".strip()

    if action == "traslado":
        from_sheds = find_sheds(db, data.get("from") or "")
        to_sheds = find_sheds(db, data.get("where") or "")
        if len(from_sheds) == 1 and len(to_sheds) == 1:
            return prepare_warehouse_move(db, data, quien, from_sheds[0], to_sheds[0])
        return prepare_obra_traslado(db, data, quien)

    location = resolve_from_location(db, data.get("from"))
    items = find_items(db, elemento, location.shed, location.zone)
    if not items:
        return {"error": ok_reply(f"No encontré «{elemento}» en el inventario.")}
    if len(items) > 1:
        return {
            "error": json_help_reply(
                "Hay varios ítems con ese nombre. Aclará el galpón/zona en from.\n"
                + format_item_list(items, limit=10)
            )
        }

    item = items[0]
    if action == "retiro":
        where = (data.get("where") or "").strip()
        if not where:
            return {"error": json_help_reply("Falta where (obra destino).")}
        if item.actualAmount < cantidad:
            return {
                "error": ok_reply(
                    f"Stock insuficiente de {item.name}. Disponible: {item.actualAmount}."
                )
            }
        pending = {
            "action": action,
            "item_id": item.id,
            "cantidad": cantidad,
            "where": where,
            "quien": quien,
        }
        confirm = (
            f"¿Confirmo retiro de {cantidad} {item.name} "
            f"({item_label(item)}) a {where} ({quien})? Respondé SI o NO."
        )
        return {"pending": pending, "confirm_text": confirm}

    if action == "devolucion":
        where = (data.get("where") or "").strip()
        if not where:
            return {"error": json_help_reply("Falta where (obra de origen).")}
        pending = {
            "action": action,
            "item_id": item.id,
            "cantidad": cantidad,
            "where": where,
            "quien": quien,
        }
        confirm = (
            f"¿Confirmo devolución de {cantidad} {item.name} "
            f"desde {where} al depósito? Respondé SI o NO."
        )
        return {"pending": pending, "confirm_text": confirm}

    if action == "ingreso":
        place = (data.get("where") or data.get("from") or (item.shed.name if item.shed else "")).strip()
        pending = {
            "action": action,
            "item_id": item.id,
            "cantidad": cantidad,
            "where": place,
            "quien": quien,
        }
        confirm = (
            f"¿Confirmo ingreso de {cantidad} {item.name} "
            f"({item_label(item)})? Respondé SI o NO."
        )
        return {"pending": pending, "confirm_text": confirm}

    return {"error": json_help_reply("Acción no reconocida.")}


def prepare_obra_traslado(db: Session, data: dict, quien: str) -> dict:
    from_place = (data.get("from") or "").strip()
    to_place = (data.get("where") or "").strip()
    if not from_place or not to_place:
        return {"error": json_help_reply("Traslado entre obras: from = origen, where = destino.")}
    items = find_items(db, data["elemento"])
    if not items:
        return {"error": ok_reply(f"No encontré «{data['elemento']}».")}

    pending_matches = []
    for item in items:
        total = (
            db.query(models.History)
            .filter(
                models.History.itemId == item.id,
                models.History.action == models.ActionEnum.retiro,
                models.History.turnback == False,
                models.History.place == from_place,
                models.History.amountNotReturned > 0,
            )
            .all()
        )
        amount = sum(row.amountNotReturned or 0 for row in total)
        if amount > 0:
            pending_matches.append((item, amount))

    if len(pending_matches) == 1:
        item = pending_matches[0][0]
    elif len(items) == 1:
        item = items[0]
    elif pending_matches:
        return {
            "error": json_help_reply(
                "Hay varios ítems pendientes en esa obra. Aclará el nombre.\n"
                + "\n".join(f"- {item_label(item)} (pendiente {amt})" for item, amt in pending_matches)
            )
        }
    else:
        return {
            "error": json_help_reply(
                "Hay varios ítems con ese nombre. Aclará cuál.\n" + format_item_list(items, 10)
            )
        }

    pending = {
        "action": "traslado_obra",
        "item_id": item.id,
        "cantidad": data["cantidad"],
        "from": from_place,
        "where": to_place,
        "quien": quien,
    }
    confirm = (
        f"¿Confirmo traslado de {data['cantidad']} {item.name} "
        f"de {from_place} a {to_place}? Respondé SI o NO."
    )
    return {"pending": pending, "confirm_text": confirm}


def prepare_warehouse_move(
    db: Session,
    data: dict,
    quien: str,
    from_shed: models.Shed,
    to_shed: models.Shed,
) -> dict:
    location = resolve_from_location(db, data.get("from"))
    items = find_items(db, data["elemento"], location.shed or from_shed, location.zone)
    if not items:
        return {"error": ok_reply(f"No encontré «{data['elemento']}» en {from_shed.name}.")}
    if len(items) > 1:
        return {
            "error": json_help_reply(
                "Hay varios ítems en ese galpón. Aclará la zona en from.\n"
                + format_item_list(items, 10)
            )
        }
    item = items[0]
    dest_zone = None
    if item.zone:
        same_name = [
            zone
            for zone in (to_shed.zones or [])
            if zone.name.strip().lower() == item.zone.name.strip().lower()
        ]
        if same_name:
            dest_zone = same_name[0]
    if dest_zone is None:
        dest_zones = (
            db.query(models.Zone)
            .filter(models.Zone.shed_id == to_shed.id)
            .order_by(models.Zone.id.asc())
            .all()
        )
        if not dest_zones:
            return {"error": ok_reply(f"{to_shed.name} no tiene zonas cargadas.")}
        dest_zone = dest_zones[0]

    if item.actualAmount < data["cantidad"]:
        return {
            "error": ok_reply(
                f"Stock insuficiente. Disponible en origen: {item.actualAmount}."
            )
        }

    pending = {
        "action": "traslado_galpon",
        "item_id": item.id,
        "cantidad": data["cantidad"],
        "from_shed_id": from_shed.id,
        "to_shed_id": to_shed.id,
        "from_zone_id": item.zone_id,
        "to_zone_id": dest_zone.id,
        "quien": quien,
        "from": from_shed.name,
        "where": to_shed.name,
        "to_zone": dest_zone.name,
    }
    confirm = (
        f"¿Confirmo movimiento de {data['cantidad']} {item.name} "
        f"de {from_shed.name} a {to_shed.name} ({dest_zone.name})? Respondé SI o NO."
    )
    return {"pending": pending, "confirm_text": confirm}


def execute_pending(
    db: Session,
    user: models.User,
    current_user: dict,
    phone: str,
    pending: dict,
) -> dict:
    action = pending.get("action")
    item_id = pending.get("item_id")
    cantidad = pending.get("cantidad")
    quien = pending.get("quien")
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item and action != "consulta":
        clear_pending(db, phone)
        return ok_reply("El ítem de la operación pendiente ya no existe.")

    try:
        if action == "retiro":
            retirar_item(
                RetiroDTO(
                    itemId=item_id,
                    amount=cantidad,
                    place=pending.get("where") or "",
                    personWhoTook=quien,
                ),
                db,
                current_user,
            )
            clear_pending(db, phone)
            db.refresh(item)
            return ok_reply(
                f"Listo. Retiro de {cantidad} {item.name} a {pending.get('where')}. "
                f"Stock actual: {item.actualAmount}."
            )

        if action == "devolucion":
            devolver_item(
                DevolucionDTO(
                    itemId=item_id,
                    amount=cantidad,
                    place=pending.get("where") or "",
                    personWhoReturned=quien,
                ),
                db,
                current_user,
            )
            clear_pending(db, phone)
            db.refresh(item)
            return ok_reply(
                f"Listo. Devolución de {cantidad} {item.name} desde {pending.get('where')}. "
                f"Stock actual: {item.actualAmount}."
            )

        if action == "ingreso":
            adjust_item_stock(db, item, cantidad)
            record_carga(
                db,
                item,
                cantidad,
                current_user,
                quien,
                pending.get("where") or (item.shed.name if item.shed else ""),
            )
            clear_pending(db, phone)
            db.refresh(item)
            return ok_reply(
                f"Listo. Ingreso de {cantidad} {item.name}. Stock actual: {item.actualAmount}."
            )

        if action == "traslado_obra":
            trasladar_item(
                TrasladoDTO(
                    itemId=item_id,
                    amount=cantidad,
                    fromPlace=pending.get("from") or "",
                    toPlace=pending.get("where") or "",
                    personWhoMoved=quien,
                ),
                db,
                current_user,
            )
            clear_pending(db, phone)
            return ok_reply(
                f"Listo. Traslado de {cantidad} {item.name} "
                f"de {pending.get('from')} a {pending.get('where')}."
            )

        if action == "traslado_galpon":
            movement = MovementCreateDTO(
                item_id=item_id,
                from_shed_id=pending["from_shed_id"],
                to_shed_id=pending["to_shed_id"],
                quantity=cantidad,
                username=quien,
                from_zone_id=pending.get("from_zone_id"),
                to_zone_id=pending["to_zone_id"],
            )
            source_item, from_zone_id = validate_movement(db, movement)
            execute_movement(db, movement, user.id, source_item, from_zone_id)
            clear_pending(db, phone)
            return ok_reply(
                f"Listo. Movimiento de {cantidad} {item.name} "
                f"de {pending.get('from')} a {pending.get('where')} ({pending.get('to_zone')})."
            )
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return ok_reply(f"No se pudo confirmar: {detail}")
    except ItemServiceError as exc:
        return ok_reply(f"No se pudo confirmar: {exc.message}")

    clear_pending(db, phone)
    return ok_reply("No pude confirmar esa operación.")
