from pydantic import BaseModel
from typing import List, Optional

class DevolucionDTO(BaseModel):
    itemId: int
    amount: int
    personWhoReturned: Optional[str] = None  
    place: str
    codes: Optional[List[str]] = None
