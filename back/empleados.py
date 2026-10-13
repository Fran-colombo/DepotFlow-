from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

import models
from auth import get_current_user, has_admin_access
from database import get_db
from item_categories import normalize_lookup

router = APIRouter(tags=["empleados"])


class EmpleadoWriteDTO(BaseModel):
    name: str
    active: Optional[bool] = None


def _require_admin(current_user: dict) -> None:
    if not has_admin_access(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden gestionar empleados",
        )


def _clean_name(value: str) -> str:
    name = " ".join((value or "").strip().split())
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    return name


def _find_by_name(db: Session, name: str, ignore_id: int = None):
    key = normalize_lookup(name)
    for row in db.query(models.Empleado).all():
        if ignore_id is not None and row.id == ignore_id:
            continue
        if normalize_lookup(row.name) == key:
            return row
    return None


def _payload(row: models.Empleado) -> dict:
    return {"id": row.id, "name": row.name, "active": bool(row.active)}


@router.get("/empleados")
def list_empleados(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rows = (
        db.query(models.Empleado)
        .filter(models.Empleado.active == True)
        .order_by(models.Empleado.name.asc())
        .all()
    )
    return [_payload(row) for row in rows]


@router.get("/admin/empleados")
def list_admin_empleados(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    rows = db.query(models.Empleado).order_by(models.Empleado.name.asc()).all()
    return [_payload(row) for row in rows]


@router.post("/admin/empleados", status_code=status.HTTP_201_CREATED)
def create_empleado(
    payload: EmpleadoWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    name = _clean_name(payload.name)
    if _find_by_name(db, name):
        raise HTTPException(status_code=400, detail="Ya existe un empleado con ese nombre")
    row = models.Empleado(
        name=name,
        active=True if payload.active is None else bool(payload.active),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _payload(row)


@router.put("/admin/empleados/{empleado_id}")
def update_empleado(
    empleado_id: int,
    payload: EmpleadoWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    row = db.query(models.Empleado).filter(models.Empleado.id == empleado_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Empleado no encontrado")
    name = _clean_name(payload.name)
    if _find_by_name(db, name, ignore_id=row.id):
        raise HTTPException(status_code=400, detail="Ya existe un empleado con ese nombre")
    row.name = name
    if payload.active is not None:
        row.active = bool(payload.active)
    db.commit()
    db.refresh(row)
    return _payload(row)
