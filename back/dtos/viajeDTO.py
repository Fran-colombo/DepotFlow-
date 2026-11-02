from pydantic import BaseModel
from typing import List, Optional


class ViajeLineaDTO(BaseModel):
    itemId: int
    amount: int
    codes: Optional[List[str]] = None
    note: Optional[str] = None
    noReturn: bool = False


class ViajeCreateDTO(BaseModel):
    direction: str
    person: str
    place: str
    occurredAt: Optional[str] = None
    note: Optional[str] = None
    lines: List[ViajeLineaDTO]


class ViajeLineasDTO(BaseModel):
    lines: List[ViajeLineaDTO]
