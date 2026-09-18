from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
import math


from database import get_db
from models import User
from dtos.userDTO import PaginatedUsersResponse, UpdatePasswordDTO, UpdatePhoneDTO, UpdateTelegramDTO
from auth import get_current_user, get_user_name_by_id, bcrypt_context
from sqlalchemy.exc import IntegrityError
from whatsapp.phone import normalize_phone, phone_in_use
from telegram.identity import normalize_telegram_id, telegram_id_in_use

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_user)]
)

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

@router.get("/users", response_model=PaginatedUsersResponse)
async def get_all_users(
    name: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):

    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden acceder a esta información"
        )

    query = db.query(User).filter(User.status == 1)

    if name:
        query = query.filter(User.name.ilike(f"%{name}%"))
    if email:
        query = query.filter(User.email.ilike(f"%{email}%"))

    total = query.count()
    total_pages = math.ceil(total / page_size)

    users = query.order_by(User.id)\
                .offset((page - 1) * page_size)\
                .limit(page_size)\
                .all()

    

    return {
        "data": users,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción"
        )

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    user.status = 0
    user.phone = None
    user.telegram_id = None
    db.commit()

    return {"message": "Usuario desactivado correctamente"}


@router.put("/users/{user_id}/password")
async def update_user_password(
    user_id: int,
    body: UpdatePasswordDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    user.password = bcrypt_context.hash(body.password)
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}


@router.put("/users/{user_id}/phone")
async def update_user_phone(
    user_id: int,
    body: UpdatePhoneDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    phone = normalize_phone(body.phone)
    if phone and phone_in_use(db, phone, exclude_user_id=user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ese número de teléfono ya está registrado",
        )

    user.phone = phone
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ese número de teléfono ya está registrado",
        )
    return {"message": "Teléfono actualizado correctamente", "phone": phone}


@router.put("/users/{user_id}/telegram")
async def update_user_telegram(
    user_id: int,
    body: UpdateTelegramDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden realizar esta acción",
        )

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    telegram_id = normalize_telegram_id(body.telegram_id)
    if body.telegram_id and str(body.telegram_id).strip() and not telegram_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El Telegram ID tiene que ser el número que te tira el bot.",
        )
    if telegram_id and telegram_id_in_use(db, telegram_id, exclude_user_id=user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ese Telegram ID ya está registrado",
        )

    user.telegram_id = telegram_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ese Telegram ID ya está registrado",
        )
    return {"message": "Telegram ID actualizado correctamente", "telegram_id": telegram_id}


@router.get("/me")
def get_current_user_name(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"full_name": get_user_name_by_id(db, current_user["user_id"])}