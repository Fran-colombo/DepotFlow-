import re
import secrets
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models import User

_LINK_TTL = timedelta(days=7)


def normalize_telegram_id(raw: Optional[str | int]) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip().lstrip("@")
    if not text:
        return None
    if text.startswith("-") and text[1:].isdigit():
        return text
    if text.isdigit():
        return text
    digits = re.sub(r"\D", "", text)
    return digits or None


def telegram_id_in_use(
    db: Session, raw: str, exclude_user_id: int | None = None
) -> Optional[User]:
    telegram_id = normalize_telegram_id(raw)
    if not telegram_id:
        return None
    query = db.query(User).filter(User.telegram_id == telegram_id)
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first()


def find_user_by_telegram_id(db: Session, raw: str | int) -> Optional[User]:
    telegram_id = normalize_telegram_id(raw)
    if not telegram_id:
        return None
    return (
        db.query(User)
        .filter(User.status == 1, User.telegram_id == telegram_id)
        .first()
    )


def create_link_token(db: Session, user_id: int) -> tuple[str, datetime]:
    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise ValueError("Usuario no encontrado")
    token = secrets.token_urlsafe(12).replace("=", "")
    expires = datetime.utcnow() + _LINK_TTL
    user.telegram_link_token = token
    user.telegram_link_expires = expires
    db.commit()
    return token, expires


def consume_link_token(db: Session, token: str) -> Optional[int]:
    code = (token or "").strip()
    if not code:
        return None
    user = (
        db.query(User)
        .filter(User.status == 1, User.telegram_link_token == code)
        .first()
    )
    if not user:
        return None
    expires = user.telegram_link_expires
    user.telegram_link_token = None
    user.telegram_link_expires = None
    expired = not expires or datetime.utcnow() > expires
    db.commit()
    if expired:
        return None
    return user.id


def link_telegram_user(db: Session, user_id: int, telegram_id: str) -> User:
    telegram_id = normalize_telegram_id(telegram_id)
    if not telegram_id:
        raise ValueError("Telegram ID inválido")

    owner = telegram_id_in_use(db, telegram_id, exclude_user_id=user_id)
    if owner:
        raise ValueError("Ese Telegram ya está vinculado a otro usuario")

    user = db.query(User).filter(User.id == user_id, User.status == 1).first()
    if not user:
        raise ValueError("Usuario no encontrado")
    user.telegram_id = telegram_id
    user.telegram_link_token = None
    user.telegram_link_expires = None
    db.commit()
    db.refresh(user)
    return user
