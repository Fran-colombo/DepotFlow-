from pydantic import BaseModel
from typing import Optional


class ZoneCreateDTO(BaseModel):
    name: str
    shed_id: int


class ZoneUpdateDTO(BaseModel):
    name: str


class ZoneDTO(BaseModel):
    id: int
    name: str
    shed_id: int
    shed_name: Optional[str] = None

    class Config:
        from_attributes = True
