from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

import models
from auth import get_current_user
from database import get_db
from item_categories import normalize_lookup

router = APIRouter(tags=["obras"])


OBRA_STAGES = (
    "por_iniciar",
    "trabajando",
    "terminaciones",
    "postventa",
    "finalizada",
)

OBRA_STAGE_LABELS = {
    "por_iniciar": "Por iniciar",
    "trabajando": "Trabajando",
    "terminaciones": "Terminaciones",
    "postventa": "Postventa",
    "finalizada": "Finalizada",
}


class ObraWriteDTO(BaseModel):
    name: str
    active: Optional[bool] = None
    stage: Optional[str] = None


def _require_admin(current_user: dict) -> None:
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden gestionar obras",
        )


def _clean_name(value: str) -> str:
    name = " ".join((value or "").strip().split())
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    return name


def _find_by_name(db: Session, name: str, ignore_id: int = None):
    key = normalize_lookup(name)
    for obra in db.query(models.Obra).all():
        if ignore_id is not None and obra.id == ignore_id:
            continue
        if normalize_lookup(obra.name) == key:
            return obra
    return None


def _clean_stage(value: Optional[str], default: str) -> str:
    stage = (value or default).strip()
    if stage not in OBRA_STAGES:
        raise HTTPException(status_code=400, detail="El estado de la obra no es válido")
    return stage


def require_active_obra(db: Session, name: str) -> str:
    cleaned = _clean_name(name)
    obra = _find_by_name(db, cleaned)
    if not obra or not obra.active:
        raise HTTPException(status_code=400, detail="Elegí una obra existente")
    if (obra.stage or "") == "finalizada":
        raise HTTPException(status_code=400, detail="Esa obra ya finalizó")
    return obra.name


def _payload(obra: models.Obra) -> dict:
    stage = obra.stage if obra.stage in OBRA_STAGES else "trabajando"
    return {
        "id": obra.id,
        "name": obra.name,
        "active": bool(obra.active),
        "stage": stage,
        "stage_label": OBRA_STAGE_LABELS[stage],
    }


def _rename_places(db: Session, previous: str, current: str) -> None:
    if previous == current:
        return
    rows = db.query(models.History).filter(models.History.place.isnot(None)).all()
    for row in rows:
        place = row.place or ""
        if place == previous:
            row.place = current
            continue
        if " → " not in place:
            continue
        parts = [current if part == previous else part for part in place.split(" → ")]
        row.place = " → ".join(parts)


def seed_obras_from_history(db: Session) -> None:
    if db.query(models.Obra).first():
        return
    seen = set()
    rows = db.query(models.History.place).distinct().all()
    for (place,) in rows:
        if not place or " → " in place:
            continue
        name = " ".join(place.split())
        key = normalize_lookup(name)
        if not name or key in seen:
            continue
        seen.add(key)
        db.add(models.Obra(name=name, active=True, stage="trabajando"))
    if seen:
        db.commit()


@router.get("/obras")
def list_obras(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(models.Obra).filter(
        models.Obra.active == True,
        models.Obra.stage != "finalizada",
    )
    return [_payload(obra) for obra in query.order_by(models.Obra.name.asc()).all()]


@router.get("/admin/obras")
def list_admin_obras(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    rows = db.query(models.Obra).order_by(models.Obra.name.asc()).all()
    return [_payload(obra) for obra in rows]


@router.post("/admin/obras", status_code=status.HTTP_201_CREATED)
def create_obra(
    payload: ObraWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    name = _clean_name(payload.name)
    if _find_by_name(db, name):
        raise HTTPException(status_code=400, detail="Ya existe una obra con ese nombre")
    obra = models.Obra(
        name=name,
        active=True if payload.active is None else bool(payload.active),
        stage=_clean_stage(payload.stage, "por_iniciar"),
    )
    db.add(obra)
    db.commit()
    db.refresh(obra)
    return _payload(obra)


@router.put("/admin/obras/{obra_id}")
def update_obra(
    obra_id: int,
    payload: ObraWriteDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    obra = db.query(models.Obra).filter(models.Obra.id == obra_id).first()
    if not obra:
        raise HTTPException(status_code=404, detail="Obra no encontrada")
    name = _clean_name(payload.name)
    taken = _find_by_name(db, name, ignore_id=obra.id)
    if taken:
        raise HTTPException(status_code=400, detail="Ya existe una obra con ese nombre")
    previous = obra.name
    obra.name = name
    if payload.active is not None:
        obra.active = bool(payload.active)
    if payload.stage is not None:
        obra.stage = _clean_stage(payload.stage, obra.stage or "trabajando")
    _rename_places(db, previous, name)
    db.commit()
    db.refresh(obra)
    return _payload(obra)
