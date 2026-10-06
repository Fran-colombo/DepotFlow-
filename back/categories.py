from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

import models
from auth import get_current_user, has_admin_access
from database import get_db
from item_categories import category_payload, list_categories, normalize_lookup

router = APIRouter(tags=["categories"])


class CategoryWriteDTO(BaseModel):
    name: str
    label: Optional[str] = None
    is_consumable: bool = False
    active: Optional[bool] = None


def _require_admin(current_user: dict) -> None:
    if not has_admin_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden gestionar categorías",
        )


def _clean_name(value: str) -> str:
    name = " ".join((value or "").strip().split())
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    return name


def _name_taken(db: Session, name: str, ignore_id: int = None) -> bool:
    key = normalize_lookup(name)
    for category in db.query(models.Category).all():
        if ignore_id is not None and category.id == ignore_id:
            continue
        if normalize_lookup(category.name) == key or normalize_lookup(category.label) == key:
            return True
    return False


@router.get("/categories")
def get_active_categories(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return [category_payload(category) for category in list_categories(db, active_only=True)]


@router.get("/admin/categories")
def get_all_categories(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    return [category_payload(category) for category in list_categories(db, active_only=False)]


@router.post("/admin/categories", status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    name = _clean_name(payload.name)
    label = _clean_name(payload.label or name)
    if _name_taken(db, name) or (normalize_lookup(label) != normalize_lookup(name) and _name_taken(db, label)):
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    last = db.query(models.Category).order_by(models.Category.sort_order.desc()).first()
    category = models.Category(
        name=name,
        label=label,
        sort_order=(last.sort_order + 1) if last else 0,
        active=True if payload.active is None else bool(payload.active),
        is_consumable=bool(payload.is_consumable),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category_payload(category)


@router.put("/admin/categories/{category_id}")
def update_category(
    category_id: int,
    payload: CategoryWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    name = _clean_name(payload.name)
    label = _clean_name(payload.label or name)
    if _name_taken(db, name, ignore_id=category.id) or (
        normalize_lookup(label) != normalize_lookup(name) and _name_taken(db, label, ignore_id=category.id)
    ):
        raise HTTPException(status_code=400, detail="Ya existe una categoría con ese nombre")

    previous_name = category.name
    category.name = name
    category.label = label
    category.is_consumable = bool(payload.is_consumable)
    if payload.active is not None:
        category.active = bool(payload.active)

    if previous_name != name:
        db.query(models.Item).filter(models.Item.category == previous_name).update(
            {models.Item.category: name},
            synchronize_session=False,
        )
        db.query(models.DeletedItem).filter(models.DeletedItem.category == previous_name).update(
            {models.DeletedItem.category: name},
            synchronize_session=False,
        )

    db.commit()
    db.refresh(category)
    return category_payload(category)
