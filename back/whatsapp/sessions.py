import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models import WhatsAppPendingAction

PENDING_TTL = timedelta(minutes=15)


def save_pending(db: Session, phone: str, payload: dict) -> None:
    row = (
        db.query(WhatsAppPendingAction)
        .filter(WhatsAppPendingAction.phone == phone)
        .first()
    )
    encoded = json.dumps(payload, ensure_ascii=False)
    if row:
        row.payload = encoded
        row.created_at = datetime.utcnow()
    else:
        db.add(
            WhatsAppPendingAction(
                phone=phone,
                payload=encoded,
                created_at=datetime.utcnow(),
            )
        )
    db.commit()


def load_pending(db: Session, phone: str) -> dict | None:
    row = (
        db.query(WhatsAppPendingAction)
        .filter(WhatsAppPendingAction.phone == phone)
        .first()
    )
    if not row:
        return None
    created = row.created_at
    if created and datetime.utcnow() - created > PENDING_TTL:
        db.delete(row)
        db.commit()
        return None
    try:
        return json.loads(row.payload)
    except json.JSONDecodeError:
        db.delete(row)
        db.commit()
        return None


def clear_pending(db: Session, phone: str) -> None:
    db.query(WhatsAppPendingAction).filter(
        WhatsAppPendingAction.phone == phone
    ).delete()
    db.commit()
