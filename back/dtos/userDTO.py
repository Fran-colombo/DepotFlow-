from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class CreateUser(BaseModel):
    name: str = Field(..., max_length=50)
    surname: str = Field(..., max_length=50)
    email: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(default="user")  # "user" | "admin"
    phone: Optional[str] = Field(default=None, max_length=32)


class UpdatePasswordDTO(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


class UpdatePhoneDTO(BaseModel):
    phone: Optional[str] = Field(default=None, max_length=32)


class UpdateTelegramDTO(BaseModel):
    telegram_id: Optional[str] = Field(default=None, max_length=32)


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
    phone: Optional[str] = None
    telegram_id: Optional[str] = None

    class Config:
        orm_mode = True

class PaginatedUsersResponse(BaseModel):
    data: List[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

