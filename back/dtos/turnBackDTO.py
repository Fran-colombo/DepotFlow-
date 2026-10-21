from pydantic import BaseModel
from typing import List, Optional

class DevolucionDTO(BaseModel):
    itemId: int
    amount: int
    personWhoReturned: Optional[str] = None  
    place: str
    codes: Optional[List[str]] = None
    note: Optional[str] = None
    fixed: Optional[bool] = None
    fix_note: Optional[str] = None
    damage_note: Optional[str] = None
    outcome: Optional[str] = None
    authorized_by: Optional[str] = None
