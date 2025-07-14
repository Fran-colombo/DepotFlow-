from pydantic import BaseModel
from typing import Optional

class RetiroDTO(BaseModel):
    itemId: int
    amount: int
    place: str
    personWhoTook: Optional[str] = None  
