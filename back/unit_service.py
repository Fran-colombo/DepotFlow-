import re
import unicodedata
from datetime import datetime

import pytz
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
from item_service import ItemServiceError

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9\-]{0,39}$")
PREFIX_PATTERN = re.compile(r"^[A-Z](?:[A-Z0-9]|-(?=[A-Z0-9])){0,11}$")
TIMEZONE = pytz.timezone("America/Argentina/Buenos_Aires")

STATUS_EN_STOCK = "en_stock"
STATUS_RETIRADA = "retirada"
STATUS_CONSUMIDA = "consumida"
STATUS_FUERA_DE_SERVICIO = "fuera_de_servicio"
STATUS_TIRADA = "tirada"
REPAIR_PLACE = "Reparación"


def normalize_code(raw: str) -> str:
    code = re.sub(r"\s+", "", (raw or "").strip().upper())
    if not code or not CODE_PATTERN.fullmatch(code):
        raise ItemServiceError(
            "El código solo puede tener letras, números y guiones, y no puede estar vacío"
        )
    return code


def _existing_codes(db: Session) -> set:
    return {code for (code,) in db.query(models.ItemUnit.code).all()}


def normalize_prefix(raw: str) -> str:
    prefix = re.sub(r"\s+", "", (raw or "").strip().upper())
    prefix = re.sub(r"-{2,}", "-", prefix).strip("-")
    if not prefix or not PREFIX_PATTERN.fullmatch(prefix):
        raise ItemServiceError("El prefijo puede tener letras, números y guiones, por ejemplo AM-C")
    return prefix


def _code_year() -> str:
    return datetime.now(TIMEZONE).strftime("%y")


def _folded_words(name: str) -> list:
    folded = unicodedata.normalize("NFD", name or "")
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")
    words = []
    for word in re.findall(r"[A-Za-z0-9]+", folded.upper()):
        clean = re.sub(r"[^A-Z0-9]", "", word)
        if clean:
            words.append(clean)
    return words


def prefix_candidates(name: str) -> list:
    words = _folded_words(name)
    if not words:
        return ["K"]
    candidates = []
    if len(words) == 1:
        word = words[0]
        for size in range(1, min(4, len(word)) + 1):
            candidates.append(word[:size])
    else:
        initials = "".join(word[0] for word in words)[:4]
        for size in range(1, len(initials) + 1):
            candidates.append(initials[:size])
        blob = "".join(words)
        for size in range(1, min(4, len(blob)) + 1):
            if blob[:size] not in candidates:
                candidates.append(blob[:size])
    base = (candidates[-1] if candidates else "K")[:3]
    for digit in range(2, 10):
        suffixed = f"{base}{digit}"[:4]
        if suffixed not in candidates:
            candidates.append(suffixed)
    return [candidate for candidate in candidates if PREFIX_PATTERN.fullmatch(candidate)]


def prefix_conflicts(db: Session, prefix: str, name: str) -> bool:
    from item_service import normalize_item_name

    prefix = normalize_prefix(prefix)
    wanted = normalize_item_name(name).lower()
    stored = (
        db.query(models.Item)
        .filter(models.Item.code_prefix == prefix, models.Item.status == 1)
        .all()
    )
    for item in stored:
        if normalize_item_name(item.name).lower() != wanted:
            return True
    pattern = re.compile(rf"^{re.escape(prefix)}-(?:\d{{2}}-)?\d+$")
    rows = (
        db.query(models.ItemUnit.code, models.Item.name)
        .join(models.Item, models.Item.id == models.ItemUnit.item_id)
        .filter(models.ItemUnit.code.like(f"{prefix}-%"))
        .all()
    )
    for code, item_name in rows:
        if pattern.fullmatch(code or "") and normalize_item_name(item_name).lower() != wanted:
            return True
    return False


def suggest_prefix(db: Session, name: str) -> str:
    for candidate in prefix_candidates(name):
        if not prefix_conflicts(db, candidate, name):
            return candidate
    raise ItemServiceError("No hay un prefijo libre para esta subcategoría")


def infer_prefix(db: Session, item: models.Item) -> str:
    if getattr(item, "code_prefix", None):
        return normalize_prefix(item.code_prefix)
    unit = (
        db.query(models.ItemUnit)
        .filter(models.ItemUnit.item_id == item.id)
        .order_by(models.ItemUnit.id.desc())
        .first()
    )
    if unit and unit.code:
        coded = unit.code or ""
        current = re.fullmatch(r"^(.+)-(\d{2})-(\d+)$", coded)
        if current and PREFIX_PATTERN.fullmatch(current.group(1) or ""):
            return current.group(1)
        legacy = re.fullmatch(r"^([A-Z](?:[A-Z0-9]|-(?=[A-Z0-9]))*)-(\d+)$", coded)
        if legacy and PREFIX_PATTERN.fullmatch(legacy.group(1) or ""):
            return legacy.group(1)
    return "K"


def peek_codes(db: Session, count: int, prefix: str = "K") -> list:
    if count <= 0:
        return []
    prefix = normalize_prefix(prefix)
    year = _code_year()
    pattern = re.compile(rf"^{re.escape(prefix)}-{year}-(\d+)$")
    discarded = re.compile(rf"^TIRADO-{re.escape(prefix)}-{year}-(\d+)$")
    existing = _existing_codes(db)
    serial = 0
    for code in existing:
        match = pattern.fullmatch(code or "") or discarded.fullmatch(code or "")
        if match:
            serial = max(serial, int(match.group(1)))
    codes = []
    while len(codes) < count:
        serial += 1
        candidate = f"{prefix}-{year}-{serial:03d}"
        if candidate not in existing:
            codes.append(candidate)
            existing.add(candidate)
    return codes


def rename_unit(unit, name: str):
    cleaned = (name or "").strip()
    if not cleaned:
        raise ItemServiceError("El nombre de la pieza es obligatorio")
    unit.name = cleaned


def select_relocatable_units(db: Session, item: models.Item, codes):
    if not codes:
        raise ItemServiceError("Elegí las piezas a mover")
    normalized = [normalize_code(code) for code in codes]
    if len(set(normalized)) != len(normalized):
        raise ItemServiceError("Hay códigos repetidos")
    units = []
    for code in normalized:
        unit = db.query(models.ItemUnit).filter(models.ItemUnit.code == code).first()
        if not unit or unit.item_id != item.id:
            raise ItemServiceError(f"El código {code} no pertenece a este artículo")
        if unit.status not in (STATUS_EN_STOCK, STATUS_RETIRADA):
            raise ItemServiceError(f"El código {code} no se puede mover")
        units.append(unit)
    return units


def _open_break(db: Session, unit: models.ItemUnit):
    return (
        db.query(models.Rotura)
        .filter(models.Rotura.unit_id == unit.id, models.Rotura.fixed_at.is_(None))
        .order_by(models.Rotura.id.desc())
        .first()
    )


def sync_breakage(db: Session, unit: models.ItemUnit, was_broken: bool, previous_damage: str = None, previous_repair: str = None, fix_note: str = None):
    if unit.is_broken:
        row = _open_break(db, unit)
        if row is None:
            row = models.Rotura(unit_id=unit.id, broken_at=datetime.now(TIMEZONE))
            db.add(row)
        row.damage_note = unit.damage_note
        row.repair_note = unit.repair_note
        return
    if not was_broken:
        return
    done = (fix_note or "").strip()
    if not done:
        raise ItemServiceError("Contá qué se le hizo")
    row = _open_break(db, unit)
    if row is None:
        row = models.Rotura(
            unit_id=unit.id,
            damage_note=(previous_damage or "").strip() or None,
            repair_note=(previous_repair or "").strip() or None,
            broken_at=datetime.now(TIMEZONE),
        )
        db.add(row)
    row.fix_note = done
    row.fixed_at = datetime.now(TIMEZONE)


def breaks_by_unit(db: Session, unit_ids) -> dict:
    ids = [unit_id for unit_id in (unit_ids or []) if unit_id is not None]
    grouped = {unit_id: [] for unit_id in ids}
    if not ids:
        return grouped
    rows = (
        db.query(models.Rotura)
        .filter(models.Rotura.unit_id.in_(ids))
        .order_by(models.Rotura.broken_at.desc(), models.Rotura.id.desc())
        .all()
    )
    for row in rows:
        grouped.setdefault(row.unit_id, []).append({
            "id": row.id,
            "damage_note": row.damage_note or "",
            "repair_note": row.repair_note or "",
            "fix_note": row.fix_note or "",
            "broken_at": row.broken_at.isoformat() if row.broken_at else None,
            "fixed_at": row.fixed_at.isoformat() if row.fixed_at else None,
        })
    return grouped


def apply_piece_profile(unit, name: str, is_broken: bool, damage_note: str = None, repair_note: str = None, description: str = None):
    cleaned = (name or "").strip()
    if not cleaned:
        raise ItemServiceError("El nombre de la pieza es obligatorio")
    unit.name = cleaned
    unit.description = (description or "").strip() or None
    unit.is_broken = bool(is_broken)
    if unit.is_broken:
        unit.damage_note = (damage_note or "").strip() or None
        unit.repair_note = (repair_note or "").strip() or None
    else:
        unit.damage_note = None
        unit.repair_note = None


def create_units_for_item(db: Session, item: models.Item, quantity: int, codes=None, prefix=None):
    if quantity <= 0:
        item._created_codes = []
        return []

    if codes:
        normalized = [normalize_code(code) for code in codes]
        if len(normalized) != quantity:
            raise ItemServiceError(f"Hace falta un código por pieza ({quantity})")
        if len(set(normalized)) != len(normalized):
            raise ItemServiceError("Hay códigos repetidos en la carga")
    else:
        normalized = peek_codes(db, quantity, prefix or infer_prefix(db, item))

    taken = _existing_codes(db)
    units = []
    for code in normalized:
        if code in taken:
            raise ItemServiceError(f"El código {code} ya existe")
        taken.add(code)
        unit = models.ItemUnit(
            item_id=item.id,
            code=code,
            status=STATUS_EN_STOCK,
            quantity=1,
            created_at=datetime.utcnow(),
        )
        db.add(unit)
        units.append(unit)
    db.flush()
    item._created_codes = [unit.code for unit in units]
    return units


def unit_out_quantity(db: Session, unit: models.ItemUnit) -> int:
    total = (
        db.query(func.coalesce(func.sum(models.History.amountNotReturned), 0))
        .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
        .filter(
            models.HistoryUnit.unit_id == unit.id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
        )
        .scalar()
    )
    return int(total or 0)


def pending_places_by_unit(db: Session, unit_ids) -> dict:
    ids = [unit_id for unit_id in (unit_ids or []) if unit_id is not None]
    if not ids:
        return {}
    rows = (
        db.query(
            models.HistoryUnit.unit_id,
            models.History.place,
            func.coalesce(func.sum(models.History.amountNotReturned), 0),
        )
        .join(models.History, models.History.id == models.HistoryUnit.history_id)
        .filter(
            models.HistoryUnit.unit_id.in_(ids),
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
        )
        .group_by(models.HistoryUnit.unit_id, models.History.place)
        .all()
    )
    grouped = {}
    for unit_id, place, quantity in rows:
        amount = int(quantity or 0)
        if amount <= 0:
            continue
        grouped.setdefault(unit_id, []).append({"place": place or "", "quantity": amount})
    return grouped


def unit_out_places(db: Session, unit: models.ItemUnit) -> list:
    rows = (
        db.query(
            models.History.place,
            func.coalesce(func.sum(models.History.amountNotReturned), 0),
        )
        .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
        .filter(
            models.HistoryUnit.unit_id == unit.id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
        )
        .group_by(models.History.place)
        .all()
    )
    places = []
    for place, quantity in rows:
        amount = int(quantity or 0)
        if amount <= 0:
            continue
        places.append({"place": place or "", "quantity": amount})
    return places


def depot_zones_by_unit(db: Session, unit_ids) -> dict:
    ids = [unit_id for unit_id in (unit_ids or []) if unit_id is not None]
    grouped = {unit_id: [] for unit_id in ids}
    if not ids:
        return grouped
    rows = (
        db.query(models.UnitDepotZone, models.Zone.name)
        .join(models.Zone, models.Zone.id == models.UnitDepotZone.zone_id)
        .filter(models.UnitDepotZone.unit_id.in_(ids), models.UnitDepotZone.quantity > 0)
        .order_by(models.Zone.name.asc())
        .all()
    )
    for place, zone_name in rows:
        grouped.setdefault(place.unit_id, []).append({
            "zone_id": place.zone_id,
            "zone_name": zone_name or "",
            "quantity": int(place.quantity or 0),
        })
    return grouped


def align_depot_zones(db: Session, unit: models.ItemUnit, item: models.Item) -> None:
    if not item or not item.inner_quantity:
        return
    expected = int(unit.quantity or 0)
    rows = (
        db.query(models.UnitDepotZone)
        .filter(models.UnitDepotZone.unit_id == unit.id)
        .order_by(models.UnitDepotZone.id.asc())
        .all()
    )
    if not rows:
        return
    current = sum(int(row.quantity or 0) for row in rows)
    if expected > current:
        extra = expected - current
        home = next((row for row in rows if row.zone_id == item.zone_id), None)
        if home:
            home.quantity = int(home.quantity or 0) + extra
        elif item.zone_id:
            db.add(models.UnitDepotZone(unit_id=unit.id, zone_id=item.zone_id, quantity=extra))
        else:
            rows[0].quantity = int(rows[0].quantity or 0) + extra
        return
    if expected == current:
        return
    left = current - expected
    ordered = sorted(rows, key=lambda row: (0 if row.zone_id == item.zone_id else 1, row.id))
    for row in ordered:
        if left <= 0:
            break
        qty = int(row.quantity or 0)
        take = min(qty, left)
        row.quantity = qty - take
        left -= take
        if row.quantity <= 0:
            db.delete(row)


def set_unit_depot_zones(db: Session, item: models.Item, unit: models.ItemUnit, places) -> list:
    if unit.item_id != item.id:
        raise ItemServiceError("La pieza no pertenece a esta subcategoría")
    expected = int(unit.quantity or 0) if item.inner_quantity else (1 if unit.status == STATUS_EN_STOCK else 0)
    if expected <= 0:
        raise ItemServiceError("Esta pieza no está en el galpón")
    cleaned = []
    seen = set()
    for place in places or []:
        zone_id = int(place.zone_id)
        quantity = int(place.quantity)
        if quantity <= 0:
            continue
        if zone_id in seen:
            raise ItemServiceError("Hay una zona repetida")
        seen.add(zone_id)
        zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
        if not zone or zone.shed_id != item.shed_id:
            raise ItemServiceError("La zona no es de este depósito")
        cleaned.append((zone, quantity))
    if sum(quantity for _zone, quantity in cleaned) != expected:
        raise ItemServiceError(f"Las zonas tienen que sumar {expected}")
    db.query(models.UnitDepotZone).filter(models.UnitDepotZone.unit_id == unit.id).delete(
        synchronize_session=False,
    )
    home_only = (
        len(cleaned) == 1
        and item.zone_id
        and cleaned[0][0].id == item.zone_id
    )
    if not home_only:
        for zone, quantity in cleaned:
            db.add(models.UnitDepotZone(unit_id=unit.id, zone_id=zone.id, quantity=quantity))
    db.flush()
    return depot_zones_by_unit(db, [unit.id]).get(unit.id, [])


def take_inner_quantity(unit: models.ItemUnit, amount: int, consume: bool):
    available = int(unit.quantity or 0)
    if amount <= 0:
        raise ItemServiceError("La cantidad debe ser mayor a 0")
    if amount > available:
        raise ItemServiceError(f"En este código quedan {available}")
    unit.quantity = available - amount
    if unit.quantity == 0:
        if consume:
            unit.status = STATUS_CONSUMIDA
            unit.consumed_at = datetime.utcnow()
        else:
            unit.status = STATUS_RETIRADA
            unit.consumed_at = None
    return unit


def apply_inner_return(unit: models.ItemUnit, amount: int):
    if amount <= 0:
        raise ItemServiceError("La cantidad debe ser mayor a 0")
    unit.quantity = int(unit.quantity or 0) + amount
    if unit.status == STATUS_RETIRADA:
        unit.status = STATUS_EN_STOCK
        unit.consumed_at = None
    return unit


def set_inner_contents(db: Session, item: models.Item, contents) -> None:
    if not item.inner_quantity:
        raise ItemServiceError("Esta subcategoría no guarda cantidad dentro del código")
    for row in contents or []:
        unit = (
            db.query(models.ItemUnit)
            .filter(models.ItemUnit.id == row.id, models.ItemUnit.item_id == item.id)
            .first()
        )
        if not unit:
            raise ItemServiceError("La pieza no pertenece a esta subcategoría")
        if unit.status == STATUS_CONSUMIDA:
            raise ItemServiceError(f"El código {unit.code} ya está usado")
        if row.quantity < 0:
            raise ItemServiceError("La cantidad no puede ser negativa")
        delta = int(row.quantity) - int(unit.quantity or 0)
        new_actual = int(item.actualAmount or 0) + delta
        new_total = int(item.totalAmount or 0) + delta
        if new_actual < 0 or new_total < 0:
            raise ItemServiceError("No hay suficiente stock para realizar esta operación")
        unit.quantity = int(row.quantity)
        item.actualAmount = new_actual
        item.totalAmount = new_total
        outside = unit_out_quantity(db, unit)
        if unit.quantity == 0 and outside > 0:
            unit.status = STATUS_RETIRADA
            unit.consumed_at = None
        elif unit.quantity > 0 and unit.status == STATUS_RETIRADA:
            unit.status = STATUS_EN_STOCK
            unit.consumed_at = None
        align_depot_zones(db, unit, item)


def add_inner_boxes(db: Session, item: models.Item, pieces) -> list:
    if not item.inner_quantity:
        raise ItemServiceError("Esta subcategoría no guarda cantidad dentro del código")
    units = []
    for piece in pieces or []:
        inside = int(piece.quantity) if piece.quantity is not None else 0
        if inside < 1:
            raise ItemServiceError("Indicá cuántos hay adentro")
        created = create_units_for_item(db, item, 1, codes=[piece.code])
        unit = created[0]
        rename_unit(unit, piece.name)
        unit.quantity = inside
        item.actualAmount = int(item.actualAmount or 0) + inside
        item.totalAmount = int(item.totalAmount or 0) + inside
        units.append(unit)
    item._created_codes = [unit.code for unit in units]
    return units


def select_stock_units(db: Session, item: models.Item, quantity: int, codes=None):
    if quantity <= 0:
        raise ItemServiceError("La cantidad debe ser mayor a 0")

    if codes:
        normalized = [normalize_code(code) for code in codes]
        if len(normalized) != quantity:
            raise ItemServiceError(
                f"La cantidad ({quantity}) no coincide con los códigos indicados ({len(normalized)})"
            )
        if len(set(normalized)) != len(normalized):
            raise ItemServiceError("Hay códigos repetidos")
        units = []
        for code in normalized:
            unit = db.query(models.ItemUnit).filter(models.ItemUnit.code == code).first()
            if not unit or unit.item_id != item.id or unit.status != STATUS_EN_STOCK:
                raise ItemServiceError(
                    f"El código {code} no está en depósito para este artículo"
                )
            units.append(unit)
        return units

    units = (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.item_id == item.id,
            models.ItemUnit.status == STATUS_EN_STOCK,
        )
        .order_by(models.ItemUnit.id.asc())
        .limit(quantity)
        .all()
    )
    if len(units) < quantity:
        raise ItemServiceError(
            f"No hay suficientes piezas identificadas en depósito. Disponibles: {len(units)}"
        )
    return units


def take_units_out(db: Session, item: models.Item, quantity: int, codes, consume: bool, out_status: str = None):
    units = select_stock_units(db, item, quantity, codes)
    moment = datetime.utcnow()
    for unit in units:
        if consume:
            unit.status = STATUS_CONSUMIDA
            unit.consumed_at = moment
        else:
            unit.status = out_status or STATUS_RETIRADA
            unit.consumed_at = None
    return units


def link_history_units(db: Session, history_id: int, units, amounts=None) -> None:
    amounts = amounts or {}
    for unit in units or []:
        raw = amounts.get(unit.id)
        db.add(
            models.HistoryUnit(
                history_id=history_id,
                unit_id=unit.id,
                amount=int(raw) if raw is not None else None,
            )
        )


def units_for_pending_place(db: Session, item: models.Item, place: str, amount: int):
    if not item.track_units or amount <= 0:
        return []
    histories = (
        db.query(models.History)
        .filter(
            models.History.itemId == item.id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.place == place,
            models.History.amountNotReturned > 0,
        )
        .order_by(models.History.date.asc())
        .all()
    )
    selected = []
    seen = set()
    for history in histories:
        links = (
            db.query(models.HistoryUnit)
            .filter(models.HistoryUnit.history_id == history.id)
            .all()
        )
        for link in links:
            if link.unit_id in seen:
                continue
            unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == link.unit_id).first()
            if unit and unit.status in (STATUS_RETIRADA, STATUS_FUERA_DE_SERVICIO):
                selected.append(unit)
                seen.add(unit.id)
                if len(selected) >= amount:
                    return selected
    if len(selected) < amount:
        extras = (
            db.query(models.ItemUnit)
            .filter(
                models.ItemUnit.item_id == item.id,
                models.ItemUnit.status.in_((STATUS_RETIRADA, STATUS_FUERA_DE_SERVICIO)),
            )
            .order_by(models.ItemUnit.id.asc())
            .all()
        )
        for unit in extras:
            if unit.id in seen:
                continue
            selected.append(unit)
            seen.add(unit.id)
            if len(selected) >= amount:
                break
    return selected[:amount]


def restore_units(db: Session, item: models.Item, amount: int, codes, place: str):
    if not item.track_units:
        return []
    if codes:
        normalized = [normalize_code(code) for code in codes]
        if len(normalized) != amount:
            raise ItemServiceError(
                f"La cantidad ({amount}) no coincide con los códigos indicados ({len(normalized)})"
            )
        units = []
        for code in normalized:
            unit = db.query(models.ItemUnit).filter(models.ItemUnit.code == code).first()
            if not unit or unit.status not in (STATUS_RETIRADA, STATUS_FUERA_DE_SERVICIO):
                raise ItemServiceError(f"El código {code} no está afuera para devolver")
            units.append(unit)
    else:
        units = units_for_pending_place(db, item, place, amount)

    for unit in units:
        unit.status = STATUS_EN_STOCK
        unit.consumed_at = None

    missing = amount - len(units)
    if missing > 0:
        units.extend(create_units_for_item(db, item, missing))
    return units


def _piece_amounts(db: Session, item: models.Item, unit: models.ItemUnit):
    if item.inner_quantity:
        depot = int(unit.quantity or 0)
        return depot, depot + unit_out_quantity(db, unit)
    if unit.status in (STATUS_CONSUMIDA, STATUS_TIRADA):
        return 0, 0
    depot = 1 if unit.status == STATUS_EN_STOCK else 0
    return depot, 1


def reassign_unit_subcategory(db: Session, source: models.Item, unit: models.ItemUnit, target: models.Item, new_code: str = None):
    if unit.item_id != source.id:
        raise ItemServiceError("La pieza no pertenece a esta subcategoría")
    if target.id == source.id:
        raise ItemServiceError("Elegí otra subcategoría")
    if target.status != 1:
        raise ItemServiceError("La subcategoría destino no está activa")
    if not target.track_units:
        raise ItemServiceError("La subcategoría destino tiene que contar por código")
    if bool(target.inner_quantity) != bool(source.inner_quantity):
        raise ItemServiceError("La subcategoría destino tiene que contar de la misma forma")

    if new_code and str(new_code).strip():
        normalized = normalize_code(new_code)
        if normalized != (unit.code or ""):
            taken = db.query(models.ItemUnit).filter(models.ItemUnit.code == normalized).first()
            if taken:
                raise ItemServiceError("Ese código ya existe")
            unit.code = normalized

    depot, total = _piece_amounts(db, source, unit)
    if (source.actualAmount or 0) < depot or (source.totalAmount or 0) < total:
        raise ItemServiceError("No hay suficiente stock para pasar la pieza")
    source.actualAmount = (source.actualAmount or 0) - depot
    source.totalAmount = (source.totalAmount or 0) - total
    target.actualAmount = (target.actualAmount or 0) + depot
    target.totalAmount = (target.totalAmount or 0) + total
    unit.item_id = target.id
    if target.shed_id != source.shed_id:
        db.query(models.UnitDepotZone).filter(models.UnitDepotZone.unit_id == unit.id).delete(
            synchronize_session=False,
        )

    db.query(models.Observation).filter(models.Observation.unit_id == unit.id).update(
        {models.Observation.item_id: target.id},
        synchronize_session=False,
    )

    history_ids = [
        history_id
        for (history_id,) in db.query(models.HistoryUnit.history_id)
        .filter(models.HistoryUnit.unit_id == unit.id)
        .all()
    ]
    if history_ids:
        shared_ids = {
            history_id
            for (history_id,) in db.query(models.HistoryUnit.history_id)
            .filter(
                models.HistoryUnit.history_id.in_(history_ids),
                models.HistoryUnit.unit_id != unit.id,
            )
            .all()
        }
        own_ids = [history_id for history_id in history_ids if history_id not in shared_ids]
        if own_ids:
            db.query(models.History).filter(models.History.id.in_(own_ids)).update(
                {models.History.itemId: target.id},
                synchronize_session=False,
            )
    return unit


def _discarded_code(db: Session, code: str) -> str:
    base = f"TIRADO-{(code or '').strip().upper()}"
    candidate = base
    number = 2
    while db.query(models.ItemUnit.id).filter(models.ItemUnit.code == candidate).first():
        candidate = f"{base}-{number}"
        number += 1
        if number > 50:
            raise ItemServiceError("No se pudo liberar el código")
    if not CODE_PATTERN.fullmatch(candidate):
        raise ItemServiceError("El código queda demasiado largo para marcarlo como tirado")
    return candidate


def discard_unit(db: Session, item: models.Item, unit: models.ItemUnit, person: str, authorized_by: str, user_id: int, user_name: str):
    if unit.item_id != item.id:
        raise ItemServiceError("La pieza no pertenece a esta subcategoría")
    if unit.status == STATUS_TIRADA:
        raise ItemServiceError("Esta pieza ya fue tirada")
    if not unit.is_broken and unit.status != STATUS_FUERA_DE_SERVICIO:
        raise ItemServiceError("Solo se puede tirar si está rota o fuera de servicio")
    who = (person or "").strip()
    authorized = (authorized_by or "").strip()
    if not who or not authorized:
        raise ItemServiceError("Indicá quién la tira y quién autoriza")

    depot, total = _piece_amounts(db, item, unit)
    if (item.actualAmount or 0) < depot or (item.totalAmount or 0) < total:
        raise ItemServiceError("No hay suficiente stock para tirar la pieza")
    item.actualAmount = (item.actualAmount or 0) - depot
    item.totalAmount = (item.totalAmount or 0) - total

    moment = datetime.now(TIMEZONE)
    history_ids = [
        history_id
        for (history_id,) in db.query(models.HistoryUnit.history_id)
        .filter(models.HistoryUnit.unit_id == unit.id)
        .all()
    ]
    if history_ids:
        pending = (
            db.query(models.History)
            .filter(
                models.History.id.in_(history_ids),
                models.History.action == models.ActionEnum.retiro,
                models.History.turnback == False,
                models.History.amountNotReturned > 0,
            )
            .all()
        )
        for history in pending:
            others = (
                db.query(models.HistoryUnit.id)
                .filter(
                    models.HistoryUnit.history_id == history.id,
                    models.HistoryUnit.unit_id != unit.id,
                )
                .count()
            )
            if others == 0:
                history.turnback = True
                history.turnbackDate = moment
                history.amountNotReturned = 0
                continue
            link = (
                db.query(models.HistoryUnit)
                .filter(
                    models.HistoryUnit.history_id == history.id,
                    models.HistoryUnit.unit_id == unit.id,
                )
                .first()
            )
            share = int(link.amount) if link and link.amount is not None else 1
            history.amountNotReturned = max(0, int(history.amountNotReturned or 0) - share)
            if history.amountNotReturned == 0:
                history.turnback = True
                history.turnbackDate = moment

    unit.code = _discarded_code(db, unit.code)
    unit.status = STATUS_TIRADA
    unit.consumed_at = moment
    if item.inner_quantity:
        unit.quantity = 0
        align_depot_zones(db, unit, item)

    thrown = models.History(
        itemId=item.id,
        userId=user_id,
        userName=user_name or who,
        personWhoTook=who,
        action=models.ActionEnum.descarte,
        amountRetired=total or 1,
        amountNotReturned=0,
        date=moment,
        place=f"Autorizado por {authorized}",
        turnback=True,
        turnbackDate=moment,
        hideFromHistorial=False,
    )
    db.add(thrown)
    db.flush()
    link_history_units(db, thrown.id, [unit], {unit.id: total or 1})
    return unit


def move_stock_units(db: Session, source: models.Item, target: models.Item, quantity: int, codes=None):
    if quantity <= 0:
        return []
    if source.track_units:
        units = select_stock_units(db, source, quantity, codes)
        for unit in units:
            unit.item_id = target.id
        target.track_units = True
        return units
    if target.track_units:
        return create_units_for_item(db, target, quantity)
    return []


def counting_mode(item: models.Item) -> str:
    if not item.track_units:
        return "quantity"
    if item.inner_quantity:
        return "inner"
    return "units"


def _units_of(db: Session, item: models.Item) -> list:
    return (
        db.query(models.ItemUnit)
        .filter(models.ItemUnit.item_id == item.id)
        .order_by(models.ItemUnit.id.asc())
        .all()
    )


def _assert_all_home(db: Session, item: models.Item) -> list:
    if (item.totalAmount or 0) != (item.actualAmount or 0):
        raise ItemServiceError("Hay stock afuera. Devolvelo antes de cambiar cómo se cuenta")
    units = _units_of(db, item)
    for unit in units:
        if unit.status != STATUS_EN_STOCK or unit_out_quantity(db, unit) > 0:
            raise ItemServiceError(
                "Hay piezas que no están en depósito. Devolvelas antes de cambiar cómo se cuenta"
            )
    return units


def _drop_units(db: Session, units: list) -> None:
    from item_images import stored_image_path

    ids = [unit.id for unit in units]
    if not ids:
        return
    (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.unit_id.in_(ids))
        .delete(synchronize_session=False)
    )
    (
        db.query(models.Observation)
        .filter(models.Observation.unit_id.in_(ids))
        .update({models.Observation.unit_id: None}, synchronize_session=False)
    )
    for unit in units:
        if unit.image_filename:
            path = stored_image_path(unit.image_filename)
            try:
                if path.is_file():
                    path.unlink()
            except OSError:
                pass
        db.delete(unit)
    db.flush()


def _assign_prefix(db: Session, item: models.Item, prefix: str) -> str:
    normalized = normalize_prefix(prefix) if prefix else suggest_prefix(db, item.name)
    if prefix_conflicts(db, normalized, item.name):
        raise ItemServiceError(f"El prefijo {normalized} ya está usado")
    item.code_prefix = normalized
    return normalized


def change_item_counting(db: Session, item: models.Item, mode: str, prefix: str = None):
    try:
        return _change_item_counting(db, item, mode, prefix)
    except ItemServiceError:
        db.rollback()
        raise


def _change_item_counting(db: Session, item: models.Item, mode: str, prefix: str = None):
    if mode not in ("quantity", "units", "inner"):
        raise ItemServiceError("El modo no es válido")
    current = counting_mode(item)
    if mode == current:
        raise ItemServiceError("La subcategoría ya se cuenta así")
    units = _assert_all_home(db, item)

    if current == "quantity" and units:
        raise ItemServiceError("Esta subcategoría ya tiene códigos")

    created = []
    if current == "quantity" and mode == "units":
        normalized = _assign_prefix(db, item, prefix)
        item.track_units = True
        item.inner_quantity = False
        quantity = item.actualAmount or 0
        if quantity > 0:
            created = create_units_for_item(db, item, quantity, prefix=normalized)
    elif current == "quantity" and mode == "inner":
        normalized = _assign_prefix(db, item, prefix)
        item.track_units = True
        item.inner_quantity = True
        quantity = item.actualAmount or 0
        if quantity > 0:
            created = create_units_for_item(db, item, 1, prefix=normalized)
            created[0].quantity = quantity
            created[0].name = item.name
    elif current == "units" and mode == "inner":
        item.inner_quantity = True
        created = units
    elif current == "inner" and mode == "units":
        if any(int(unit.quantity or 0) != 1 for unit in units):
            raise ItemServiceError(
                "Hay un código con más de 1 adentro. No se puede pasar a un código por pieza"
            )
        item.inner_quantity = False
        created = units
    elif mode == "quantity":
        total = sum(int(unit.quantity or 0) for unit in units)
        _drop_units(db, units)
        item.track_units = False
        item.inner_quantity = False
        item.actualAmount = total
        item.totalAmount = total
    else:
        raise ItemServiceError("No se puede cambiar a ese modo")

    db.commit()
    db.refresh(item)
    return created


def identify_current_stock(db: Session, item: models.Item, prefix: str):
    if item.track_units:
        raise ItemServiceError("Este artículo ya identifica cada pieza")
    return change_item_counting(db, item, "units", prefix)


def find_unit_by_code(db: Session, code: str):
    normalized = normalize_code(code)
    return db.query(models.ItemUnit).filter(models.ItemUnit.code == normalized).first()


def _clock(value):
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is not None:
        return value.replace(tzinfo=None)
    return value


def return_shares(db: Session, history: models.History) -> dict:
    """Cantidad de una devolución que corresponde a cada código.

    Si la devolución juntó varios juegos, cada vínculo guarda su parte.
    En las que se guardaron antes, se reconstruye con los retiros que
    esa devolución cerró.
    """
    links = (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.history_id == history.id)
        .all()
    )
    if len(links) <= 1:
        return {}
    if any(link.amount is not None for link in links):
        return {link.unit_id: int(link.amount) for link in links if link.amount is not None}

    if history.action != models.ActionEnum.devolucion:
        return {}

    moment = _clock(history.date)
    shares = {}
    for link in links:
        retiros = (
            db.query(models.History)
            .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
            .filter(
                models.HistoryUnit.unit_id == link.unit_id,
                models.History.action == models.ActionEnum.retiro,
                models.History.place == history.place,
                models.History.turnback == True,
            )
            .all()
        )
        closed_now = []
        if moment is not None:
            for retiro in retiros:
                closed = _clock(retiro.turnbackDate)
                if closed is None:
                    continue
                if abs((closed - moment).total_seconds()) <= 15:
                    closed_now.append(retiro)
        chosen = closed_now
        if not chosen and len(retiros) == 1:
            chosen = retiros
        if not chosen:
            return {}
        shares[link.unit_id] = sum(int(retiro.amountRetired or 0) for retiro in chosen)

    if sum(shares.values()) != int(history.amountRetired or 0):
        return {}
    return shares


def piece_amount(db: Session, history: models.History, link: models.HistoryUnit, shares=None):
    if link.amount is not None:
        return int(link.amount)
    if shares is None:
        shares = return_shares(db, history)
    if link.unit_id in shares:
        return shares[link.unit_id]
    return history.amountRetired


def unit_history(db: Session, unit: models.ItemUnit) -> list:
    links = (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.unit_id == unit.id)
        .order_by(models.HistoryUnit.id.asc())
        .all()
    )
    rows = []
    for link in links:
        history = db.query(models.History).filter(models.History.id == link.history_id).first()
        if not history or history.hideFromHistorial:
            continue
        rows.append(
            {
                "action": history.action.value if history.action else None,
                "place": history.place,
                "person": history.personWhoTook,
                "date": history.date.isoformat() if history.date else None,
                "amount": piece_amount(db, history, link),
                "note": history.note or "",
            }
        )
    return rows


def histories_by_unit(db: Session, unit_ids) -> dict:
    ids = [unit_id for unit_id in (unit_ids or []) if unit_id is not None]
    grouped = {unit_id: [] for unit_id in ids}
    if not ids:
        return grouped
    rows = (
        db.query(models.HistoryUnit, models.History)
        .join(models.History, models.History.id == models.HistoryUnit.history_id)
        .filter(
            models.HistoryUnit.unit_id.in_(ids),
            or_(
                models.History.hideFromHistorial.is_(False),
                models.History.hideFromHistorial.is_(None),
            ),
        )
        .order_by(models.HistoryUnit.id.asc())
        .all()
    )
    shares_by_history = {}
    for link, history in rows:
        if link.amount is not None:
            amount = int(link.amount)
        else:
            if history.id not in shares_by_history:
                shares_by_history[history.id] = return_shares(db, history)
            shares = shares_by_history[history.id]
            amount = shares[link.unit_id] if link.unit_id in shares else history.amountRetired
        grouped.setdefault(link.unit_id, []).append(
            {
                "action": history.action.value if history.action else None,
                "place": history.place,
                "person": history.personWhoTook,
                "date": history.date.isoformat() if history.date else None,
                "amount": amount,
                "note": history.note or "",
            }
        )
    return grouped


def last_unit_movement(db: Session, unit: models.ItemUnit):
    link = (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.unit_id == unit.id)
        .order_by(models.HistoryUnit.id.desc())
        .first()
    )
    if not link:
        return None
    return db.query(models.History).filter(models.History.id == link.history_id).first()
