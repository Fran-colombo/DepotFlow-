from pydantic import BaseModel
from typing import Optional


class TrasladoDTO(BaseModel):
    itemId: int
    amount: int
    fromPlace: str
    toPlace: str
    personWhoMoved: Optional[str] = None
