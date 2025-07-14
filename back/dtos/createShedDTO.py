from pydantic import BaseModel

class ShedCreateDTO(BaseModel):
    name:str

class ShedDTO(BaseModel):
    id: int
    name: str


    class Config:
        orm_mode = True
