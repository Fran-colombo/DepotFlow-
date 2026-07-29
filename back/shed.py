from fastapi import Depends, HTTPException, status, APIRouter
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
import models
from database import get_db
from dtos.createShedDTO import ShedDTO, ShedCreateDTO, ShedUpdateDTO


router = APIRouter(
    prefix="/sheds",
    tags=["sheds"]
)

db_dependency = Annotated[Session, Depends(get_db)]


@router.get("/", response_model=List[ShedDTO])
def get_all_sheds(db: db_dependency):
    sheds = db.query(models.Shed).order_by(models.Shed.name.asc()).all()
    return sheds

def get_shed_name_by_id(db, shed_id: int) -> Optional[str]:
    shed = db.query(models.Shed).filter(models.Shed.id == shed_id).first()
    return shed.name if shed else None

@router.get("/{shed_id}", response_model=ShedDTO)
def get_shed_by_id(shed_id: int, db: db_dependency):
    shed = db.query(models.Shed).filter(models.Shed.id == shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shed not found"
        )
    return shed

@router.post("/", response_model=ShedDTO, status_code=status.HTTP_201_CREATED)
def create_shed(shed: ShedCreateDTO, db: db_dependency):
    name = shed.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del depósito es obligatorio",
        )

    existing_shed = db.query(models.Shed).filter(models.Shed.name == name).first()
    if existing_shed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shed with this name already exists"
        )
    
    new_shed = models.Shed(name=name)
    db.add(new_shed)
    db.commit()
    db.refresh(new_shed)
    return new_shed


@router.put("/{shed_id}", response_model=ShedDTO)
def update_shed(shed_id: int, payload: ShedUpdateDTO, db: db_dependency):
    shed = db.query(models.Shed).filter(models.Shed.id == shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Depósito no encontrado",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del depósito es obligatorio",
        )

    duplicate = (
        db.query(models.Shed)
        .filter(models.Shed.name == name, models.Shed.id != shed_id)
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un depósito con ese nombre",
        )

    shed.name = name
    db.commit()
    db.refresh(shed)
    return shed


@router.delete("/{shed_id}", status_code=status.HTTP_200_OK)
def delete_shed(shed_id: int, db: db_dependency):
    shed = db.query(models.Shed).filter(models.Shed.id == shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Depósito no encontrado",
        )

    zone_count = db.query(models.Zone).filter(models.Zone.shed_id == shed_id).count()
    if zone_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar un depósito que aún tiene zonas. Eliminá las zonas primero.",
        )

    active_items = (
        db.query(models.Item)
        .filter(models.Item.shed_id == shed_id, models.Item.status == 1)
        .count()
    )
    if active_items > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar un depósito con ítems activos",
        )

    db.delete(shed)
    db.commit()
    return {"message": f"Depósito {shed_id} eliminado exitosamente"}
