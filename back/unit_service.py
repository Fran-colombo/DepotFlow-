import re
import unicodedata
from datetime import datetime

from sqlalchemy import func
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
    pattern = re.compile(rf"^{re.escape(prefix)}-\d+$")
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


def apply_piece_profile(unit, name: str, is_broken: bool, damage_note: str = None, repair_note: str = None):
    cleaned = (name or "").strip()
    if not cleaned:
        raise ItemServiceError("El nombre de la pieza es obligatorio")
    unit.name = cleaned
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


def add_inner_boxes(db: Session, item: models.Item, pieces) -> list:
    if not item.inner_quantity:
        raise ItemServiceError("Esta subcategoría no guarda cantidad dentro del código")
    units = []
    for piece in pieces or []:
        inside = piece.quantity
        if inside is None or int(inside) < 1:
            raise ItemServiceError("Indicá cuántos hay adentro")
        created = create_units_for_item(db, item, 1, codes=[piece.code])
        unit = created[0]
        rename_unit(unit, piece.name)
        unit.quantity = int(inside)
        item.actualAmount = int(item.actualAmount or 0) + int(inside)
        item.totalAmount = int(item.totalAmount or 0) + int(inside)
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
            if unit and unit.status == STATUS_RETIRADA:
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
            if not unit or unit.status != STATUS_RETIRADA:
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
                "amount": history.amountRetired,
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
