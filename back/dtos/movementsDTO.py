from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MovementCreateDTO(BaseModel):
    item_id: int
    from_shed_id: int
    to_shed_id: int
    quantity: int
    username: str


class MovementResponseDTO(BaseModel):
    id: int
    item_id_origen: int
    item_id_destino: Optional[int] = None
    item_name: str
    quantity: int
    date: str  
    from_shed_id: int
    to_shed_id: int
    from_shed_name: str
    to_shed_name: str
    user_id: Optional[int]
    username: Optional[str]