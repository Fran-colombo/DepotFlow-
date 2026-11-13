import secrets
from datetime import datetime

import pytz
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Integer, String, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import bcrypt_context, get_current_user
from database import get_db

TIMEZONE = pytz.timezone("America/Argentina/Buenos_Aires")

router = APIRouter(prefix="/admin/sysadmin", tags=["sysadmin"])

HIDDEN = {
    "users": {"password", "telegram_link_token", "telegram_link_expires"},
}

TABLES = (
    ("items", "Subcategorías", models.Item),
    ("units", "Códigos", models.ItemUnit),
    ("history", "Historial", models.History),
    ("history_units", "Piezas del historial", models.HistoryUnit),
    ("observations", "Observaciones", models.Observation),
    ("movements", "Movimientos", models.Movement),
    ("sheds", "Depósitos", models.Shed),
    ("zones", "Zonas", models.Zone),
    ("obras", "Obras", models.Obra),
    ("categories", "Categorías", models.Category),
    ("users", "Usuarios", models.User),
    ("deleted_items", "Eliminados", models.DeletedItem),
    ("transportes", "Autos y carros", models.Transport),
    ("transporte_usos", "Salidas de autos", models.TransportUse),
    ("transporte_multas", "Multas", models.TransportFine),
    ("transporte_notas", "Notas de autos", models.TransportNote),
)

COLUMN_LABELS = {
    "id": "Id",
    "name": "Nombre",
    "surname": "Apellido",
    "email": "Email",
    "role": "Rol",
    "status": "Estado",
    "phone": "Teléfono",
    "telegram_id": "Telegram",
    "description": "Descripción",
    "aliases": "Otros nombres",
    "category": "Categoría",
    "totalAmount": "Cantidad total",
    "actualAmount": "Cantidad en depósito",
    "is_available": "Disponible",
    "shed_id": "Depósito",
    "zone_id": "Zona",
    "image_filename": "Archivo de foto",
    "track_units": "Código por pieza",
    "inner_quantity": "Cantidad dentro del código",
    "code_prefix": "Prefijo",
    "code": "Código",
    "quantity": "Cantidad",
    "created_at": "Creado",
    "consumed_at": "Consumido",
    "is_broken": "Rota",
    "damage_note": "Qué le pasó",
    "repair_note": "Qué habría que hacer",
    "item_id": "Subcategoría",
    "itemId": "Subcategoría",
    "user_id": "Usuario",
    "userId": "Usuario",
    "user_name": "Nombre de usuario",
    "userName": "Nombre de usuario",
    "personWhoTook": "Persona",
    "action": "Acción",
    "amountRetired": "Cantidad",
    "amountNotReturned": "Pendiente de volver",
    "date": "Fecha",
    "place": "Lugar",
    "turnback": "Ya volvió",
    "turnbackDate": "Fecha de devolución",
    "lastNotification": "Último aviso",
    "hideFromHistorial": "Oculto del historial",
    "history_id": "Historial",
    "unit_id": "Código",
    "observed_by": "Observado por",
    "item_name": "Nombre",
    "from_shed_id": "Depósito origen",
    "to_shed_id": "Depósito destino",
    "from_zone_id": "Zona origen",
    "to_zone_id": "Zona destino",
    "username": "Usuario",
    "active": "Activa",
    "stage": "Estado de obra",
    "label": "Etiqueta",
    "sort_order": "Orden",
    "is_consumable": "No vuelve",
    "unit": "Unidad",
    "hint": "Qué entra",
    "seed_key": "Clave interna",
    "deletion_reason": "Motivo",
    "deleted_at": "Borrado",
    "kind": "Tipo",
    "plate": "Patente",
    "last_service_at": "Último service",
    "last_service_km": "Km del service",
    "next_service_km": "Km del próximo service",
    "current_km": "Km actuales",
    "in_repair": "Lo llevaron a arreglar",
    "transport_id": "Auto o carro",
    "cart_id": "Carro",
    "person": "Quién",
    "left_at": "Salió",
    "returned_at": "Volvió",
    "km": "Kilómetros",
    "external_vehicle": "Auto de afuera",
    "occurred_at": "Fecha de la multa",
    "paid": "Pagada",
    "use_id": "Uso",
}

SUMMARY_KEYS = (
    "name",
    "code",
    "email",
    "label",
    "place",
    "item_name",
    "username",
    "description",
)

ACTION_LABELS = {
    "retiro": "Retiro",
    "devolucion": "Devolución",
    "carga": "Carga",
    "traslado": "Traslado",
    "descarte": "Tirado",
    "no_volvio": "No volvió",
    "uso_galpon": "Usado en el galpón",
}


def _require_admin(current_user: dict) -> None:
    if not current_user or current_user.get("role") != "sysadmin":
        raise HTTPException(status_code=403, detail="Solo sysadmin puede usar este panel")


def _table(key: str):
    for table_key, label, model in TABLES:
        if table_key == key:
            return label, model
    raise HTTPException(status_code=404, detail="Esa tabla no existe")


def _columns(key: str, model):
    hidden = HIDDEN.get(key, set())
    described = []
    for column in model.__table__.columns:
        if column.name in hidden or column.name == "id":
            continue
        kind = "string"
        options = None
        if isinstance(column.type, Boolean):
            kind = "boolean"
        elif isinstance(column.type, Integer):
            kind = "integer"
        elif isinstance(column.type, DateTime):
            kind = "datetime"
        elif isinstance(column.type, SqlEnum):
            kind = "enum"
            options = list(column.type.enums)
        described.append({
            "name": column.name,
            "label": COLUMN_LABELS.get(column.name, column.name),
            "type": kind,
            "nullable": bool(column.nullable),
            "options": options,
        })
    return described


def _enum_member(column, raw):
    enum_class = column.type.enum_class
    if enum_class is None:
        return raw
    for member in enum_class:
        if raw == member.value or raw == member.name:
            return member
    raise HTTPException(status_code=400, detail=f"Valor inválido para {column.name}")


def _parse(column, raw):
    if isinstance(raw, str):
        raw = raw.strip()
    if raw is None or raw == "":
        return None
    if isinstance(column.type, Boolean):
        if isinstance(raw, bool):
            return raw
        return str(raw).lower() in ("1", "true", "si", "sí")
    if isinstance(column.type, Integer):
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{column.name} tiene que ser un número")
    if isinstance(column.type, DateTime):
        text = str(raw).replace("Z", "")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{column.name} no es una fecha válida")
    if isinstance(column.type, SqlEnum):
        return _enum_member(column, raw)
    return str(raw)


def _dump(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if hasattr(value, "value"):
        return value.value
    return value


def _values(key: str, row) -> dict:
    hidden = HIDDEN.get(key, set())
    data = {"id": row.id}
    for column in row.__table__.columns:
        if column.name in hidden or column.name == "id":
            continue
        data[column.name] = _dump(getattr(row, column.name))
    return data


def _summary(values: dict) -> str:
    for key in SUMMARY_KEYS:
        if values.get(key) not in (None, ""):
            return str(values[key])
    return ""


def _join_parts(*parts) -> str:
    cleaned = []
    for part in parts:
        if part is None:
            continue
        text = str(part).strip()
        if text:
            cleaned.append(text)
    return " · ".join(cleaned)


def _clock(value) -> str:
    if not value:
        return ""
    moment = value
    if moment.tzinfo is None:
        moment = pytz.utc.localize(moment)
    return moment.astimezone(TIMEZONE).strftime("%d/%m %H:%M")


def _action_label(value) -> str:
    if value is None:
        return ""
    raw = value.value if hasattr(value, "value") else str(value)
    return ACTION_LABELS.get(raw, raw)


def _tool_label(unit) -> str:
    if not unit:
        return ""
    name = (unit.name or "").strip()
    code = (unit.code or "").strip()
    if name and code:
        return name
    return name or code


def _history_route(action, place):
    raw = action.value if hasattr(action, "value") else str(action or "")
    place = (place or "").strip()
    if raw == "traslado" and "→" in place:
        left, right = [side.strip() for side in place.split("→", 1)]
        return left or "—", right or "—"
    if raw in ("retiro", "uso_galpon"):
        return "Depósito", place or "—"
    if raw == "devolucion":
        return place or "—", "Depósito"
    if raw == "carga":
        return "—", place or "Depósito"
    if raw == "descarte":
        return place or "Depósito", "Tirado"
    if raw == "no_volvio":
        return place or "Obra", "No volvió"
    return "—", place or "—"


def _map_by_id(db: Session, model, ids):
    found = {}
    clean = [item_id for item_id in set(ids) if item_id is not None]
    if not clean:
        return found
    for row in db.query(model).filter(model.id.in_(clean)).all():
        found[row.id] = row
    return found


def _location_label(shed_name, zone_name) -> str:
    shed_name = (shed_name or "").strip()
    zone_name = (zone_name or "").strip()
    if shed_name and zone_name:
        return f"{shed_name} / {zone_name}"
    return zone_name or shed_name or "—"


def _row_summaries(db: Session, key: str, rows) -> dict:
    if not rows:
        return {}
    if key == "history":
        return _history_summaries(db, rows)
    if key == "history_units":
        return _history_unit_summaries(db, rows)
    if key == "observations":
        return _observation_summaries(db, rows)
    if key == "movements":
        return _movement_summaries(db, rows)
    if key == "zones":
        return _zone_summaries(db, rows)
    if key == "transporte_usos":
        return _transport_use_summaries(db, rows)
    return {row.id: _summary(_values(key, row)) for row in rows}


def _history_summaries(db: Session, rows) -> dict:
    history_ids = [row.id for row in rows]
    items = _map_by_id(db, models.Item, [row.itemId for row in rows])
    links = (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.history_id.in_(history_ids))
        .all()
    )
    units = _map_by_id(db, models.ItemUnit, [link.unit_id for link in links])
    names_by_history = {}
    for link in links:
        label = _tool_label(units.get(link.unit_id))
        if not label:
            continue
        bucket = names_by_history.setdefault(link.history_id, [])
        if label not in bucket:
            bucket.append(label)
    summaries = {}
    for row in rows:
        tools = names_by_history.get(row.id) or []
        item = items.get(row.itemId)
        tool = ", ".join(tools) if tools else (item.name if item else "Sin herramienta")
        origin, destination = _history_route(row.action, row.place)
        summaries[row.id] = _join_parts(
            tool,
            row.amountRetired,
            f"{origin} → {destination}",
            _clock(row.date),
        )
    return summaries


def _history_unit_summaries(db: Session, rows) -> dict:
    histories = _map_by_id(db, models.History, [row.history_id for row in rows])
    units = _map_by_id(db, models.ItemUnit, [row.unit_id for row in rows])
    summaries = {}
    for row in rows:
        history = histories.get(row.history_id)
        unit = units.get(row.unit_id)
        origin, destination = _history_route(
            history.action if history else "",
            history.place if history else "",
        )
        qty = row.amount if row.amount not in (None, 0) else (
            history.amountRetired if history else None
        )
        summaries[row.id] = _join_parts(
            _tool_label(unit) or (unit.code if unit else f"Código {row.unit_id}"),
            _action_label(history.action) if history else f"Historial {row.history_id}",
            qty,
            f"{origin} → {destination}" if history else "",
            _clock(history.date) if history else "",
        )
    return summaries


def _observation_summaries(db: Session, rows) -> dict:
    units = _map_by_id(db, models.ItemUnit, [row.unit_id for row in rows])
    items = _map_by_id(db, models.Item, [row.item_id for row in rows])
    summaries = {}
    for row in rows:
        unit = units.get(row.unit_id)
        item = items.get(row.item_id)
        tool = _tool_label(unit) or (item.name if item else "")
        summaries[row.id] = _join_parts(tool or "Sin herramienta", row.description)
    return summaries


def _movement_summaries(db: Session, rows) -> dict:
    items = _map_by_id(db, models.Item, [row.item_id for row in rows])
    zones = _map_by_id(
        db,
        models.Zone,
        [row.from_zone_id for row in rows] + [row.to_zone_id for row in rows],
    )
    sheds = _map_by_id(
        db,
        models.Shed,
        [row.from_shed_id for row in rows] + [row.to_shed_id for row in rows],
    )
    item_ids = [row.item_id for row in rows if row.item_id]
    unit_names = {}
    if item_ids:
        histories = (
            db.query(models.History)
            .filter(
                models.History.itemId.in_(item_ids),
                models.History.action == models.ActionEnum.traslado,
            )
            .all()
        )
        history_ids = [history.id for history in histories]
        links = (
            db.query(models.HistoryUnit)
            .filter(models.HistoryUnit.history_id.in_(history_ids or [0]))
            .all()
        )
        units = _map_by_id(db, models.ItemUnit, [link.unit_id for link in links])
        names_by_history = {}
        for link in links:
            label = _tool_label(units.get(link.unit_id))
            if not label:
                continue
            bucket = names_by_history.setdefault(link.history_id, [])
            if label not in bucket:
                bucket.append(label)
        for history in histories:
            names = names_by_history.get(history.id)
            if not names:
                continue
            key = (history.itemId, _clock(history.date), history.amountRetired)
            unit_names.setdefault(key, names)

    summaries = {}
    for row in rows:
        from_zone = zones.get(row.from_zone_id)
        to_zone = zones.get(row.to_zone_id)
        from_shed = sheds.get(row.from_shed_id)
        to_shed = sheds.get(row.to_shed_id)
        item = items.get(row.item_id)
        names = unit_names.get((row.item_id, _clock(row.date), row.quantity))
        tool = ", ".join(names) if names else (row.item_name or (item.name if item else "Sin herramienta"))
        summaries[row.id] = _join_parts(
            tool,
            row.quantity,
            f"{_location_label(from_shed.name if from_shed else None, from_zone.name if from_zone else None)} → {_location_label(to_shed.name if to_shed else None, to_zone.name if to_zone else None)}",
            _clock(row.date),
        )
    return summaries


def _zone_summaries(db: Session, rows) -> dict:
    sheds = _map_by_id(db, models.Shed, [row.shed_id for row in rows])
    return {
        row.id: _join_parts(
            sheds.get(row.shed_id).name if sheds.get(row.shed_id) else "Sin depósito",
            row.name,
        )
        for row in rows
    }


def _transport_use_summaries(db: Session, rows) -> dict:
    transports = _map_by_id(
        db,
        models.Transport,
        [row.transport_id for row in rows]
        + [row.cart_id for row in rows]
        + [row.with_transport_id for row in rows],
    )
    summaries = {}
    for row in rows:
        vehicle = transports.get(row.transport_id)
        cart = transports.get(row.cart_id)
        extra = transports.get(row.with_transport_id)
        vehicle_label = ""
        if vehicle:
            vehicle_label = vehicle.plate or vehicle.name
            if vehicle.kind == "carro":
                vehicle_label = f"Carro {vehicle.name}"
        cart_label = f"carro {cart.name}" if cart else ""
        extra_label = extra.name if extra and extra.id not in (row.transport_id, row.cart_id) else ""
        left = _clock(row.left_at)
        back = _clock(row.returned_at) if row.returned_at else "sigue afuera"
        route = f"{left} → {back}" if left else back
        summaries[row.id] = _join_parts(
            vehicle_label or f"Vehículo {row.transport_id}",
            cart_label,
            extra_label,
            row.person,
            row.obra,
            row.external_vehicle,
            route,
        )
    return summaries


def _search_filters(db: Session, table: str, model, term: str):
    like = f"%{term}%"
    filters = []
    if term.isdigit():
        filters.append(model.id == int(term))
    for column in model.__table__.columns:
        if isinstance(column.type, String):
            filters.append(column.ilike(like))
    if table == "history":
        filters.append(
            model.itemId.in_(db.query(models.Item.id).filter(models.Item.name.ilike(like)))
        )
        filters.append(
            model.id.in_(
                db.query(models.HistoryUnit.history_id)
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(or_(models.ItemUnit.name.ilike(like), models.ItemUnit.code.ilike(like)))
            )
        )
    elif table == "history_units":
        filters.append(
            model.unit_id.in_(
                db.query(models.ItemUnit.id).filter(
                    or_(models.ItemUnit.name.ilike(like), models.ItemUnit.code.ilike(like))
                )
            )
        )
        if term.isdigit():
            filters.append(model.history_id == int(term))
    elif table == "observations":
        filters.append(
            model.unit_id.in_(
                db.query(models.ItemUnit.id).filter(
                    or_(models.ItemUnit.name.ilike(like), models.ItemUnit.code.ilike(like))
                )
            )
        )
        filters.append(
            model.item_id.in_(db.query(models.Item.id).filter(models.Item.name.ilike(like)))
        )
    elif table == "movements":
        filters.append(
            model.from_zone_id.in_(db.query(models.Zone.id).filter(models.Zone.name.ilike(like)))
        )
        filters.append(
            model.to_zone_id.in_(db.query(models.Zone.id).filter(models.Zone.name.ilike(like)))
        )
        filters.append(
            model.from_shed_id.in_(db.query(models.Shed.id).filter(models.Shed.name.ilike(like)))
        )
        filters.append(
            model.to_shed_id.in_(db.query(models.Shed.id).filter(models.Shed.name.ilike(like)))
        )
    elif table == "zones":
        filters.append(
            model.shed_id.in_(db.query(models.Shed.id).filter(models.Shed.name.ilike(like)))
        )
    elif table == "transporte_usos":
        filters.append(
            model.transport_id.in_(
                db.query(models.Transport.id).filter(
                    or_(
                        models.Transport.name.ilike(like),
                        models.Transport.plate.ilike(like),
                    )
                )
            )
        )
    return filters


def _apply(key: str, model, row, payload: dict) -> None:
    hidden = HIDDEN.get(key, set())
    columns = {column.name: column for column in model.__table__.columns}
    for name, raw in (payload or {}).items():
        if name in hidden or name == "id" or name not in columns:
            continue
        column = columns[name]
        parsed = _parse(column, raw)
        if parsed is None and not column.nullable and column.default is not None:
            continue
        setattr(row, name, parsed)


def _null_where(db: Session, model, column, ids):
    if not ids:
        return
    db.query(model).filter(column.in_(list(ids))).update({column: None}, synchronize_session=False)


def _delete_ids(db: Session, model, column, ids):
    if not ids:
        return
    db.query(model).filter(column.in_(list(ids))).delete(synchronize_session=False)


def _prepare_delete(db: Session, key: str, row) -> None:
    row_id = row.id
    if key == "items":
        unit_ids = [value for (value,) in db.query(models.ItemUnit.id).filter(models.ItemUnit.item_id == row_id)]
        history_ids = [value for (value,) in db.query(models.History.id).filter(models.History.itemId == row_id)]
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.unit_id, unit_ids)
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.history_id, history_ids)
        _null_where(db, models.Observation, models.Observation.unit_id, unit_ids)
        _null_where(db, models.Observation, models.Observation.item_id, [row_id])
        _null_where(db, models.Movement, models.Movement.item_id, [row_id])
        _null_where(db, models.History, models.History.itemId, [row_id])
        _delete_ids(db, models.ItemUnit, models.ItemUnit.id, unit_ids)
    elif key == "units":
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.unit_id, [row_id])
        _null_where(db, models.Observation, models.Observation.unit_id, [row_id])
    elif key == "history":
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.history_id, [row_id])
    elif key == "sheds":
        zone_ids = [value for (value,) in db.query(models.Zone.id).filter(models.Zone.shed_id == row_id)]
        _null_where(db, models.Item, models.Item.zone_id, zone_ids)
        _null_where(db, models.Movement, models.Movement.from_zone_id, zone_ids)
        _null_where(db, models.Movement, models.Movement.to_zone_id, zone_ids)
        _delete_ids(db, models.Zone, models.Zone.id, zone_ids)
        _null_where(db, models.Item, models.Item.shed_id, [row_id])
        _null_where(db, models.Movement, models.Movement.from_shed_id, [row_id])
        _null_where(db, models.Movement, models.Movement.to_shed_id, [row_id])
    elif key == "zones":
        _null_where(db, models.Item, models.Item.zone_id, [row_id])
        _null_where(db, models.Movement, models.Movement.from_zone_id, [row_id])
        _null_where(db, models.Movement, models.Movement.to_zone_id, [row_id])
    elif key == "users":
        _null_where(db, models.Observation, models.Observation.user_id, [row_id])
        _null_where(db, models.History, models.History.userId, [row_id])
        _null_where(db, models.Movement, models.Movement.user_id, [row_id])


def _integrity_message(exc: IntegrityError) -> str:
    text = str(getattr(exc, "orig", exc))
    return f"La base no dejó guardar esa fila. {text}"


@router.get("/tables")
def list_tables(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    return [
        {
            "key": key,
            "label": label,
            "columns": _columns(key, model),
        }
        for key, label, model in TABLES
    ]


@router.get("/{table}")
def list_rows(
    table: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    q: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    _require_admin(current_user)
    _, model = _table(table)
    query = db.query(model)
    term = (q or "").strip()
    if term:
        filters = _search_filters(db, table, model, term)
        if filters:
            query = query.filter(or_(*filters))
    total = query.count()
    rows = (
        query.order_by(model.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    summaries = _row_summaries(db, table, rows)
    data = []
    for row in rows:
        values = _values(table, row)
        data.append({
            "id": row.id,
            "summary": summaries.get(row.id) or _summary(values),
            "values": values,
        })
    return {
        "rows": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
        },
    }


@router.post("/{table}", status_code=201)
def create_row(
    table: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = model()
    _apply(table, model, row, payload)
    if table == "users" and not getattr(row, "password", None):
        row.password = bcrypt_context.hash(secrets.token_urlsafe(24))
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    db.refresh(row)
    values = _values(table, row)
    return {
        "id": row.id,
        "summary": _row_summaries(db, table, [row]).get(row.id) or _summary(values),
        "values": values,
    }


@router.put("/{table}/{row_id}")
def update_row(
    table: str,
    row_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No se encontró esa fila")
    _apply(table, model, row, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    db.refresh(row)
    values = _values(table, row)
    return {
        "id": row.id,
        "summary": _row_summaries(db, table, [row]).get(row.id) or _summary(values),
        "values": values,
    }


@router.delete("/{table}/{row_id}")
def delete_row(
    table: str,
    row_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No se encontró esa fila")
    _prepare_delete(db, table, row)
    db.delete(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    return {"ok": True}
