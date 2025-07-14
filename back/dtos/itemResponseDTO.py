from pydantic import BaseModel
from typing import Optional

class ItemResponseDTO(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    totalAmount: int
    actualAmount: int
    is_available: bool
    shed_id: Optional[int] = None
    status: int

    class Config:
        from_attributes = True
