from enum import Enum
from pydantic import BaseModel, ConfigDict    
from typing import Optional


class ActionEnum(str, Enum):
    add = "add"
    rest = "rest"

class ItemBaseDTO(BaseModel):
    name: str
    description: str
    quantity: int

class ItemCreateDTO(ItemBaseDTO):
    category: str
    shed_id: Optional[int] = None

class ItemUpdateDTO(BaseModel):
    # name: str
    # description: Optional[str] = None
    quantity: Optional[int] = None  
    action: ActionEnum

class MoveItemDTO(BaseModel):
    item_id: int
    quantity: int
    from_shed_id: int
    to_shed_id: int


    model_config = ConfigDict(from_attributes=True)