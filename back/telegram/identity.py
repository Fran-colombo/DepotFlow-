import re
from typing import Optional

from sqlalchemy.orm import Session

from models import User


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
