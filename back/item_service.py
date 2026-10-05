import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import models
from item_categories import canonical_category

logger = logging.getLogger(__name__)


class ItemServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def normalize_item_name(name: str) -> str:
    return (name or "").strip().lower().capitalize()


def find_item_by_name_and_zone(db: Session, name: str, zone_id: int):
    normalized = normalize_item_name(name)
    return (
        db.query(models.Item)
        .filter(
            func.lower(models.Item.name) == normalized.lower(),
            models.Item.zone_id == zone_id,
        )
        .first()
    )


def create_item(
    db: Session,
    *,
    name: str,
    description: str,
    category: str,
    quantity: int,
    zone_id: int,
    shed_id=None,
    track_units: bool = True,
    inner_quantity: bool = False,
    codes=None,
    code_prefix=None,
):
    from unit_service import create_units_for_item, normalize_prefix, prefix_conflicts, suggest_prefix

    name_well_written = normalize_item_name(name)
    resolved_category = canonical_category(db, category)
    if not resolved_category:
        raise ItemServiceError("La categoría no es válida", 400)
    category = resolved_category

    if quantity < 0:
        raise ItemServiceError("La cantidad no puede ser negativa", 400)
    if inner_quantity and not track_units:
        raise ItemServiceError("La cantidad dentro del código necesita un código por pieza", 400)

    if not zone_id:
        raise ItemServiceError("La zona es obligatoria", 400)

    zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not zone:
        raise ItemServiceError("Zona no encontrada", 404)

    if shed_id is not None and shed_id != zone.shed_id:
        raise ItemServiceError("La zona no pertenece al galpón seleccionado", 400)

    resolved_shed_id = zone.shed_id
    existing = find_item_by_name_and_zone(db, name_well_written, zone_id)

    if existing:
        if existing.status == 1:
            raise ItemServiceError(
                "Un elemento con el mismo nombre ya existe en esa zona.", 400
            )
        existing.name = f"{existing.name}__OLD_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        db.commit()

    deleted_with_same_name = (
        db.query(models.DeletedItem)
        .filter(models.DeletedItem.name == name_well_written)
        .order_by(models.DeletedItem.deleted_at.desc())
        .first()
    )
    if deleted_with_same_name:
        logger.warning(
            f"Se está recreando un item previamente borrado: {name_well_written}"
        )

    try:
        resolved_prefix = None
        if track_units:
            resolved_prefix = normalize_prefix(code_prefix) if code_prefix else suggest_prefix(db, name_well_written)
            if prefix_conflicts(db, resolved_prefix, name_well_written):
                raise ItemServiceError(f"El prefijo {resolved_prefix} ya está usado", 400)

        item_to_add = models.Item(
            name=name_well_written,
            description=description or "",
            category=category,
            shed_id=resolved_shed_id,
            zone_id=zone_id,
            totalAmount=quantity,
            actualAmount=quantity,
            is_available=True,
            status=1,
            track_units=bool(track_units),
            inner_quantity=bool(inner_quantity) and bool(track_units),
            code_prefix=resolved_prefix,
        )
        db.add(item_to_add)
        db.flush()
        if item_to_add.track_units and item_to_add.inner_quantity and quantity > 0:
            box_codes = None
            if codes:
                if len(codes) != 1:
                    raise ItemServiceError("Una caja nueva es un solo código", 400)
                box_codes = codes
            units = create_units_for_item(
                db, item_to_add, 1, box_codes, prefix=resolved_prefix
            )
            if units:
                units[0].quantity = quantity
        elif item_to_add.track_units and quantity > 0:
            create_units_for_item(db, item_to_add, quantity, codes, prefix=resolved_prefix)
        else:
            item_to_add._created_codes = []
        created_codes = list(getattr(item_to_add, "_created_codes", []) or [])
        db.commit()
        db.refresh(item_to_add)
        item_to_add._created_codes = created_codes
        return item_to_add
    except ItemServiceError:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise ItemServiceError(f"Error creating item: {str(e)}", 400)


def adjust_item_stock(db: Session, item: models.Item, quantity_change: int, codes=None, names_by_code=None):
    from unit_service import create_units_for_item, rename_unit, take_units_out

    new_total = (item.totalAmount or 0) + quantity_change
    new_actual = (item.actualAmount or 0) + quantity_change

    if new_total < 0 or new_actual < 0:
        raise ItemServiceError(
            "No hay suficiente stock para realizar esta operación", 400
        )

    if item.track_units and quantity_change > 0:
        units = create_units_for_item(db, item, quantity_change, codes)
        if names_by_code is not None:
            for unit in units:
                rename_unit(unit, names_by_code.get(unit.code))
    elif item.track_units and quantity_change < 0:
        removed = take_units_out(db, item, -quantity_change, codes, consume=True)
        item._created_codes = [unit.code for unit in removed]
    else:
        item._created_codes = []

    item.totalAmount = new_total
    item.actualAmount = new_actual
    created_codes = list(getattr(item, "_created_codes", []) or [])
    db.commit()
    db.refresh(item)
    item._created_codes = created_codes
    return item
