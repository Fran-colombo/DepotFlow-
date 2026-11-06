from pydantic import BaseModel
from typing import List, Optional


class ItemDepotZoneDTO(BaseModel):
    zone_id: int
    zone_name: str
    quantity: int


class ItemResponseDTO(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    aliases: Optional[str] = None
    totalAmount: int
    actualAmount: int
    is_available: bool
    shed_id: Optional[int] = None
    zone_id: Optional[int] = None
    zone_name: Optional[str] = None
    status: int
    has_image: bool = False
    image_filename: Optional[str] = None
    track_units: bool = False
    inner_quantity: bool = False
    is_consumable: bool = False
    unit: str = "unidad"
    code_prefix: Optional[str] = None
    missing_amount: int = 0
    depot_zones: List[ItemDepotZoneDTO] = []

    class Config:
        from_attributes = True
