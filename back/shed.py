from datetime import datetime
from fastapi import Depends, HTTPException, status, APIRouter
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
import models
from database import get_db
from dtos.createShedDTO import ShedDTO, ShedCreateDTO
# from main import get_item_by_id


router = APIRouter(
    prefix="/sheds",
    tags=["sheds"]
)

db_dependency = Annotated[Session, Depends(get_db)]


@router.get("/", response_model=List[ShedDTO])
def get_all_sheds(db: db_dependency):
    sheds = db.query(models.Shed).all()
    if not sheds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sheds found"
        )
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

# @router.post("/", response_model=ShedDTO, status_code=status.HTTP_201_CREATED)
# def create_shed(shed: ShedCreateDTO, db: db_dependency):
#     existing_shed = db.query(models.Shed).filter(models.Shed.name == shed.name).first()
#     if existing_shed:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Shed with this name already exists"
#         )
    
#     db.add(shed)
#     db.commit()
#     db.refresh(shed)
#     return shed

@router.post("/", response_model=ShedDTO, status_code=status.HTTP_201_CREATED)
def create_shed(shed: ShedCreateDTO, db: db_dependency):
    existing_shed = db.query(models.Shed).filter(models.Shed.name == shed.name).first()
    if existing_shed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shed with this name already exists"
        )
    
    new_shed = models.Shed(name=shed.name)  
    db.add(new_shed)
    db.commit()
    db.refresh(new_shed)
    return new_shed
