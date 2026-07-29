from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from typing import Annotated, List, Optional
import models
from database import get_db
from dtos.zoneDTO import ZoneCreateDTO, ZoneUpdateDTO, ZoneDTO

router = APIRouter(prefix="/zones", tags=["zones"])
db_dependency = Annotated[Session, Depends(get_db)]


def _to_dto(zone: models.Zone) -> ZoneDTO:
    return ZoneDTO(
        id=zone.id,
        name=zone.name,
        shed_id=zone.shed_id,
        shed_name=zone.shed.name if zone.shed else None,
    )


@router.get("/", response_model=List[ZoneDTO])
def get_zones(
    db: db_dependency,
    shed_id: Optional[int] = Query(None),
):
    query = db.query(models.Zone).options(joinedload(models.Zone.shed))
    if shed_id is not None:
        query = query.filter(models.Zone.shed_id == shed_id)
    zones = query.order_by(models.Zone.name.asc()).all()
    return [_to_dto(z) for z in zones]


@router.get("/{zone_id}", response_model=ZoneDTO)
def get_zone_by_id(zone_id: int, db: db_dependency):
    zone = (
        db.query(models.Zone)
        .options(joinedload(models.Zone.shed))
        .filter(models.Zone.id == zone_id)
        .first()
    )
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona no encontrada",
        )
    return _to_dto(zone)


@router.post("/", response_model=ZoneDTO, status_code=status.HTTP_201_CREATED)
def create_zone(payload: ZoneCreateDTO, db: db_dependency):
    shed = db.query(models.Shed).filter(models.Shed.id == payload.shed_id).first()
    if not shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Galpón no encontrado",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de la zona es obligatorio",
        )

    existing = (
        db.query(models.Zone)
        .filter(
            models.Zone.shed_id == payload.shed_id,
            models.Zone.name == name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una zona con ese nombre en este galpón",
        )

    zone = models.Zone(name=name, shed_id=payload.shed_id)
    db.add(zone)
    db.commit()
    db.refresh(zone)
    zone = (
        db.query(models.Zone)
        .options(joinedload(models.Zone.shed))
        .filter(models.Zone.id == zone.id)
        .first()
    )
    return _to_dto(zone)


@router.put("/{zone_id}", response_model=ZoneDTO)
def update_zone(zone_id: int, payload: ZoneUpdateDTO, db: db_dependency):
    zone = (
        db.query(models.Zone)
        .options(joinedload(models.Zone.shed))
        .filter(models.Zone.id == zone_id)
        .first()
    )
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona no encontrada",
        )

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de la zona es obligatorio",
        )

    duplicate = (
        db.query(models.Zone)
        .filter(
            models.Zone.shed_id == zone.shed_id,
            models.Zone.name == name,
            models.Zone.id != zone_id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una zona con ese nombre en este galpón",
        )

    zone.name = name
    db.commit()
    db.refresh(zone)
    return _to_dto(zone)


@router.delete("/{zone_id}", status_code=status.HTTP_200_OK)
def delete_zone(zone_id: int, db: db_dependency):
    zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona no encontrada",
        )

    active_items = (
        db.query(models.Item)
        .filter(
            models.Item.zone_id == zone_id,
            models.Item.status == 1,
        )
        .count()
    )
    if active_items > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede eliminar una zona con ítems activos",
        )

    db.delete(zone)
    db.commit()
    return {"message": f"Zona {zone_id} eliminada exitosamente"}
