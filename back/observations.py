from datetime import datetime
from fastapi import Depends, HTTPException, status, APIRouter
from sqlalchemy.orm import Session
from typing import Annotated
import models
from database import get_db
from auth import get_current_user
import dtos.observationCreateDTO as dtos
import pytz

router = APIRouter(
    prefix="/api/observations",
    tags=["observations"]
)

db_dependency = Annotated[Session, Depends(get_db)]

TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

def now():
    """Devuelve la fecha/hora actual en la zona horaria de Buenos Aires"""
    return datetime.now(TIMEZONE)


@router.get("/", response_model=list[dtos.ObservationResponseDTO])
def get_all_observations(db: db_dependency):
    return db.query(models.Observation).all()

@router.get("/item/{item_id}", response_model=list[dtos.ObservationResponseDTO])
def get_observations_by_item(item_id: int, db: db_dependency):
    observations = db.query(models.Observation).filter(
        models.Observation.item_id == item_id
    ).all()
    
    if not observations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No observations found for this item"
        )
    return observations

@router.post("/", response_model=dtos.ObservationResponseDTO, status_code=status.HTTP_201_CREATED)
def create_observation(
    dto: dtos.ObservationCreateDTO,
    db: db_dependency,
    current_user: dict = Depends(get_current_user)
):
    item = db.query(models.Item).get(dto.item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    user = db.query(models.User).filter(models.User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    observation = models.Observation(
        item_id=dto.item_id,
        description=dto.description,
        user_id=current_user["user_id"],
        user_name=f"{user.name} {user.surname}", 
        date=now()
    )
    
    db.add(observation)
    db.commit()
    db.refresh(observation)
    
    return observation