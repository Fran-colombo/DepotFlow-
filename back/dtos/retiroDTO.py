from pydantic import BaseModel, Field
from typing import List, Optional

class RetiroDTO(BaseModel):
    itemId: int
    amount: int = Field(..., ge=1)
    place: str
    personWhoTook: Optional[str] = None
    codes: Optional[List[str]] = None
    noReturn: bool = False
    repair: bool = False
    inShed: bool = False
    note: Optional[str] = None
    occurredAt: Optional[str] = None
    viajeId: Optional[int] = None
