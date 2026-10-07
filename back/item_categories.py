import unicodedata

from sqlalchemy.orm import Session

import models

SEED_CATEGORIES = [
    {
        "value": "Materiales consumibles",
        "label": "Materiales consumibles",
        "is_consumable": True,
    },
    {
        "value": "Maquinas y herramientas eléctricas de mano",
        "label": "Maq. y herramientas eléctricas de mano",
    },
    {"value": "Prolongación", "label": "Prolongación"},
    {
        "value": "Maquinas y herramientas eléctricas de obra",
        "label": "Maq. y herramientas eléctricas de obra",
    },
    {"value": "Herramientas de obra general", "label": "Herramientas de obra general"},
    {"value": "Encofrados", "label": "Encofrados"},
    {"value": "Estructuras de hormigón", "label": "Estructuras de hormigón"},
    {"value": "Contrapisos", "label": "Contrapisos"},
    {"value": "Albañilería", "label": "Albañilería"},
    {"value": "Yesería", "label": "Yesería"},
]


def normalize_lookup(value: str) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )
    return " ".join(text.split())


def seed_categories(db: Session) -> None:
    """Insert the original categories when their seed key is still missing."""
    existing_keys = {
        row.seed_key
        for row in db.query(models.Category.seed_key).filter(models.Category.seed_key.isnot(None))
    }
    created = False
    for index, category in enumerate(SEED_CATEGORIES):
        seed_key = normalize_lookup(category["value"])
        if seed_key in existing_keys:
            continue
        name_taken = (
            db.query(models.Category)
            .filter(models.Category.name == category["value"])
            .first()
        )
        if name_taken:
            if not name_taken.seed_key:
                name_taken.seed_key = seed_key
                created = True
            continue
        db.add(
            models.Category(
                name=category["value"],
                label=category["label"],
                sort_order=index,
                active=True,
                is_consumable=bool(category.get("is_consumable")),
                seed_key=seed_key,
            )
        )
        created = True
    if created:
        db.commit()


def list_categories(db: Session, active_only: bool = False):
    query = db.query(models.Category)
    if active_only:
        query = query.filter(models.Category.active == True)
    return query.order_by(models.Category.sort_order.asc(), models.Category.name.asc()).all()


def canonical_category(db: Session, raw: str):
    key = normalize_lookup(raw)
    if not key:
        return None
    for category in list_categories(db, active_only=True):
        if normalize_lookup(category.name) == key or normalize_lookup(category.label) == key:
            return category.name
    return None


def clean_unit(value: str) -> str:
    unit = (value or "unidad").strip().lower()
    if unit not in ("unidad", "metro"):
        return ""
    return unit


def category_units_by_name(db: Session) -> dict:
    result = {}
    for category in db.query(models.Category).all():
        unit = clean_unit(getattr(category, "unit", None) or "unidad") or "unidad"
        result[normalize_lookup(category.name)] = unit
    return result


def category_is_consumable(db: Session, name: str) -> bool:
    key = normalize_lookup(name)
    if not key:
        return False
    for category in db.query(models.Category).all():
        if normalize_lookup(category.name) == key:
            return bool(category.is_consumable)
    return key == normalize_lookup("Materiales consumibles")


def category_payload(category: models.Category) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "label": category.label,
        "sort_order": category.sort_order,
        "active": bool(category.active),
        "is_consumable": bool(category.is_consumable),
        "unit": clean_unit(getattr(category, "unit", None) or "unidad") or "unidad",
        "hint": (category.hint or "").strip(),
    }
