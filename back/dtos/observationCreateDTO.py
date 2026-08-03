from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ObservationCreateDTO(BaseModel):
    item_id: int
    description: str
    observed_by: Optional[str] = None


class ObservationResponseDTO(BaseModel):
    id: int
    item_id: int
    description: str
    date: datetime
    user_id: int
    user_name: str
    observed_by: Optional[str] = None

    class Config:
        from_attributes = True
