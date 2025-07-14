from typing import  Optional
from datetime import datetime
from pydantic import BaseModel

class DeletedItemResponse(BaseModel):
    id: int
    item_id: int
    name: str
    category: str
    description: Optional[str]
    deletion_reason: str
    deleted_at: datetime
    # place:str

    class Config:
        orm_mode = True