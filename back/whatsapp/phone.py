import re
from typing import Optional

from sqlalchemy.orm import Session

from models import User

CONFIRM_YES = {"si", "sí", "ok", "dale", "confirmo", "yes", "s"}
CONFIRM_NO = {"no", "nop", "cancelar", "cancel", "n"}


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    digits = re.sub(r"\D", "", text)
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("54"):
        return f"+{digits}"
    if digits.startswith("0"):
        digits = digits.lstrip("0")
    if len(digits) == 10:
        return f"+549{digits}"
    return f"+{digits}"


def phone_lookup_variants(raw: str) -> list[str]:
    normalized = normalize_phone(raw)
    variants = []
    if normalized:
        variants.append(normalized)
        variants.append(normalized.lstrip("+"))
    digits = re.sub(r"\D", "", raw or "")
    if digits and digits not in variants:
        variants.append(digits)
        variants.append(f"+{digits}")
    seen = set()
    unique = []
    for value in variants:
        if value and value not in seen:
            seen.add(value)
            unique.append(value)
    return unique


def find_user_by_phone(db: Session, raw: str) -> Optional[User]:
    for candidate in phone_lookup_variants(raw):
        user = (
            db.query(User)
            .filter(User.status == 1, User.phone == candidate)
            .first()
        )
        if user:
            return user
        if not candidate.startswith("+"):
            user = (
                db.query(User)
                .filter(User.status == 1, User.phone == f"+{candidate}")
                .first()
            )
            if user:
                return user
    normalized = normalize_phone(raw)
    if not normalized:
        return None
    users = db.query(User).filter(User.status == 1, User.phone.isnot(None)).all()
    for user in users:
        if normalize_phone(user.phone) == normalized:
            return user
    return None


def is_confirm_yes(text: str) -> bool:
    return _plain(text) in CONFIRM_YES


def is_confirm_no(text: str) -> bool:
    return _plain(text) in CONFIRM_NO


def _plain(text: str) -> str:
    cleaned = (text or "").strip().lower().replace("í", "i")
    return re.sub(r"[.!?¿¡]+$", "", cleaned).strip()
