from pydantic import BaseModel
from typing import List, Optional

class RetiroDTO(BaseModel):
    itemId: int
    amount: int
    place: str
    personWhoTook: Optional[str] = None
    codes: Optional[List[str]] = None
    noReturn: bool = False
    repair: bool = False
