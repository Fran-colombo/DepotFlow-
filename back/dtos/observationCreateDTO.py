from pydantic import BaseModel
from datetime import datetime

class ObservationCreateDTO(BaseModel):
    item_id: int
    description: str

class ObservationResponseDTO(BaseModel):
    id: int
    item_id: int
    description: str
    date: datetime
    user_id: int
    user_name: str
    
    class Config:
        from_attributes = True