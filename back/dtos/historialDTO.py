from typing import Optional
from pydantic import BaseModel
from datetime import datetime
from enum import Enum


class ActionEnum(str, Enum):
    retiro = "retiro"
    devolucion = "devolucion"
    carga = "carga"
    traslado = "traslado"


class HistoryCreateDTO(BaseModel):
    itemId: int
    itemName: str
    action: ActionEnum
    amountRetired: int
    amountNotReturned: int | None = None
    date: datetime
    place: str
    turnback: bool = False
    turnbackDate: datetime | None = None


class HistoryResponseDTO(BaseModel):
    id: int
    itemId: int
    itemName: str
    userId: int
    userName: str
    personWhoTook: Optional[str] = None
    action: ActionEnum
    amountRetired: Optional[int] = None
    amountNotReturned: Optional[int] = None
    date: datetime
    place: str
    turnback: bool
    turnbackDate: Optional[datetime] = None


class HistoryResponseWithDetailsDTO(HistoryResponseDTO):
    itemCategory: Optional[str] = None
    shedId: Optional[int] = None
    shed_name: Optional[str] = None

    class Config:
        from_attributes = True
