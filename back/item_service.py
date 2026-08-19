import logging
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import models

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
):
    name_well_written = normalize_item_name(name)

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
        )
        db.add(item_to_add)
        db.commit()
        db.refresh(item_to_add)
        return item_to_add
    except Exception as e:
        db.rollback()
        raise ItemServiceError(f"Error creating item: {str(e)}", 400)


def adjust_item_stock(db: Session, item: models.Item, quantity_change: int):
    new_total = (item.totalAmount or 0) + quantity_change
    new_actual = (item.actualAmount or 0) + quantity_change

    if new_total < 0 or new_actual < 0:
        raise ItemServiceError(
            "No hay suficiente stock para realizar esta operación", 400
        )

    item.totalAmount = new_total
    item.actualAmount = new_actual
    db.commit()
    db.refresh(item)
    return item
