from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
import math
from database import get_db
from models import User
from dtos.userDTO import  ChangePasswordDTO, PaginatedUsersResponse
from auth import get_current_user, get_user_name_by_id, bcrypt_context

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
    db.commit()

    return {"message": "Usuario desactivado correctamente"}

@router.get("/me")
def get_current_user_name(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"full_name": get_user_name_by_id(db, current_user["user_id"])}


@router.put("/users/{user_id}/password")
def change_user_password(
    user_id: int,
    payload: ChangePasswordDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden cambiar contraseñas"
        )

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    try:
        hashed_password = bcrypt_context.hash(payload.new_password)
        user.password = hashed_password
        db.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al actualizar la contraseña")

    return {"message": "Contraseña actualizada correctamente"}