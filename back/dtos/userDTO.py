from pydantic import BaseModel, Field
from typing import List
from datetime import datetime

class CreateUser(BaseModel):
    name: str = Field(..., max_length=50)
    surname: str = Field(..., max_length=50)
    email: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8, max_length=128)

class LogUser(BaseModel):
    email: str = Field(..., max_length=50)
    password: str = Field(..., min_length=8, max_length=128)

class Token(BaseModel):
    access_token: str
    token_type: str


class UserResponse(BaseModel):
    id: int
    name: str
    surname: str
    email: str
    role: str
    status: int
    # created_at: datetime

    class Config:
        orm_mode = True

class PaginatedUsersResponse(BaseModel):
    data: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

