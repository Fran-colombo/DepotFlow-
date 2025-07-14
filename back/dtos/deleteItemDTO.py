from pydantic import BaseModel
from datetime import datetime

class DeleteItemDTO(BaseModel):
    item_id: int
    description: str
    date: datetime
    # place:str

class ResponseFakeDeleteDTO(DeleteItemDTO):
    username: str