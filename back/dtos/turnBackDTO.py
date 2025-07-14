from pydantic import BaseModel
from typing import Optional

class DevolucionDTO(BaseModel):
    itemId: int
    amount: int
    personWhoReturned: Optional[str] = None  
    place: str  
