import re
from datetime import datetime

from sqlalchemy.orm import Session

import models
from item_service import ItemServiceError

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9\-]{0,39}$")
PREFIX_PATTERN = re.compile(r"^[A-Z][A-Z0-9]{0,3}$")

STATUS_EN_STOCK = "en_stock"
STATUS_RETIRADA = "retirada"
STATUS_CONSUMIDA = "consumida"


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
    prefix = re.sub(r"[^A-Z0-9]", "", (raw or "").strip().upper())
    if not prefix or not PREFIX_PATTERN.fullmatch(prefix):
        raise ItemServiceError("El prefijo es una letra, por ejemplo H")
    return prefix


def infer_prefix(db: Session, item: models.Item) -> str:
    unit = (
        db.query(models.ItemUnit)
        .filter(models.ItemUnit.item_id == item.id)
        .order_by(models.ItemUnit.id.desc())
        .first()
    )
    if unit and unit.code:
        match = re.match(r"^([A-Z][A-Z0-9]{0,3})-\d+$", unit.code)
        if match:
            return match.group(1)
    return "K"


def peek_codes(db: Session, count: int, prefix: str = "K") -> list:
    if count <= 0:
        return []
    prefix = normalize_prefix(prefix)
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    existing = _existing_codes(db)
    serial = 0
    for code in existing:
        match = pattern.fullmatch(code or "")
        if match:
            serial = max(serial, int(match.group(1)))
    codes = []
    while len(codes) < count:
        serial += 1
        candidate = f"{prefix}-{serial:03d}"
        if candidate not in existing:
            codes.append(candidate)
            existing.add(candidate)
    return codes


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
            created_at=datetime.utcnow(),
        )
        db.add(unit)
        units.append(unit)
    db.flush()
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


def take_units_out(db: Session, item: models.Item, quantity: int, codes, consume: bool):
    units = select_stock_units(db, item, quantity, codes)
    moment = datetime.utcnow()
    for unit in units:
        if consume:
            unit.status = STATUS_CONSUMIDA
            unit.consumed_at = moment
        else:
            unit.status = STATUS_RETIRADA
            unit.consumed_at = None
    return units


def link_history_units(db: Session, history_id: int, units) -> None:
    for unit in units or []:
        db.add(models.HistoryUnit(history_id=history_id, unit_id=unit.id))


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
            if unit and unit.status == STATUS_RETIRADA and unit.item_id == item.id:
                selected.append(unit)
                seen.add(unit.id)
                if len(selected) >= amount:
                    return selected
    if len(selected) < amount:
        extras = (
            db.query(models.ItemUnit)
            .filter(
                models.ItemUnit.item_id == item.id,
                models.ItemUnit.status == STATUS_RETIRADA,
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
            if not unit or unit.item_id != item.id or unit.status != STATUS_RETIRADA:
                raise ItemServiceError(f"El código {code} no está en obra para devolver")
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


def identify_current_stock(db: Session, item: models.Item, prefix: str):
    if item.track_units:
        raise ItemServiceError("Este artículo ya identifica cada pieza")
    quantity = item.actualAmount or 0
    item.track_units = True
    units = create_units_for_item(db, item, quantity, prefix=prefix) if quantity > 0 else []
    db.commit()
    db.refresh(item)
    return units


def find_unit_by_code(db: Session, code: str):
    normalized = normalize_code(code)
    return db.query(models.ItemUnit).filter(models.ItemUnit.code == normalized).first()


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
        if not history:
            continue
        rows.append(
            {
                "action": history.action.value if history.action else None,
                "place": history.place,
                "person": history.personWhoTook,
                "date": history.date.isoformat() if history.date else None,
            }
        )
    return rows


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
