from datetime import timedelta, datetime
import math
from jose import jwt, JWTError
from fastapi import HTTPException, APIRouter, Depends, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Annotated, Optional
from pydantic import BaseModel
from starlette import status
from dtos.userDTO import CreateUser, PaginatedUsersResponse, Token, LogUser
from database import engine, SessionLocal
from passlib.context import CryptContext
from models import RoleEnum, User
from database import get_db

router = APIRouter(
    prefix="",
    tags=["auth"],
)
SECRET_KEY = "sinalientoputotetradescendidoporput0ycagon"
ALGORITHM = "HS256"

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")



db_dependency = Annotated[Session, Depends(get_db)]



@router.post("/signUp", status_code=status.HTTP_200_OK)
async def create_user(user: CreateUser , db: db_dependency):
    print(f"Trying to create user: {user.name}")
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        if existing_user.status == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email ya registrado"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Usuario registrado pero desactivado. Contacte al administrador."
            )
    try:
        hashed_password = bcrypt_context.hash(user.password)
    except Exception as e:
        print("Error hashing password:", e)
        raise HTTPException(status_code=500, detail="Hashing failed")

    new_user = User(
        name=user.name.lower().capitalize(),
        surname=user.surname.lower().capitalize(),
        password=hashed_password,
        email=user.email,
        role=RoleEnum.user,
        status=1  
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "User created successfully"}


@router.post("/login", response_model=Token)
async def login(form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: db_dependency):
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not bcrypt_context.verify(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    token = create_access_token(user.email, user.id, user.role.value, timedelta(minutes=30))
    return {"access_token": token, "token_type": "bearer"}


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.email == username, User.status == 1).first()
    
    if not user:
        return False
    
    
    try:
        password_valid = bcrypt_context.verify(password, user.password)
        if not password_valid:
            print("Password verification failed")  
            return False
        return user
    except Exception as e:
        return False

def create_access_token(email: str, user_id: int, role: str, expires_delta: timedelta | None = None):
    to_encode = {"sub": email, "user_id": user_id, "role": role.value if hasattr(role, 'value') else role}
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        role: str = payload.get("role")
        if username is None or user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"username": username, "user_id": user_id, "role": role}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def delete_user_byId(db: Session, user_id: int):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    user.status = 0  
    db.commit()
    return {"message": "User deleted successfully"}

def delete_user_byEmail(db: Session, email: str):
    user = db.query(User).filter(User.email == email).first()
    if not user or user.status == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    user.status = 0
    db.commit()
    return {"message": "User deleted successfully"}


def get_user_name_by_id(db: Session, user_id: int) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return f"{user.name} {user.surname}"


