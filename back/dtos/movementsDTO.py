from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class MovementCreateDTO(BaseModel):
    item_id: int
    from_shed_id: int
    to_shed_id: int
    quantity: int
    username: str
    from_zone_id: Optional[int] = None
    to_zone_id: int


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
    from_zone_id: Optional[int] = None
    to_zone_id: Optional[int] = None
    from_zone_name: Optional[str] = None
    to_zone_name: Optional[str] = None
    user_id: Optional[int]
    username: Optional[str]
