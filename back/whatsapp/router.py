from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from whatsapp.handlers import JSON_TEMPLATE, WhatsAppActionDTO, handle_action, unauthorized_reply
from whatsapp.phone import find_user_by_phone, normalize_phone
from whatsapp.security import require_whatsapp_api_key

router = APIRouter(
    prefix="/whatsapp",
    tags=["whatsapp"],
    dependencies=[Depends(require_whatsapp_api_key)],
)


@router.get("/me")
def whatsapp_me(phone: str = Query(...), db: Session = Depends(get_db)):
    user = find_user_by_phone(db, phone)
    if not user:
        return unauthorized_reply()
    return {
        "ok": True,
        "authorized": True,
        "needs_json": False,
        "needs_confirm": False,
        "reply": f"Hola {user.name}. Ya podés consultar o mover stock por WhatsApp.",
        "user": {
            "id": user.id,
            "name": user.name,
            "surname": user.surname,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "phone": user.phone,
        },
    }


@router.get("/template")
def whatsapp_template():
    return {
        "ok": True,
        "authorized": True,
        "needs_json": True,
        "needs_confirm": False,
        "reply": (
            "Mandá un JSON exacto así:\n"
            f"{JSON_TEMPLATE}\n\n"
            "Acciones: consulta, retiro, devolucion, ingreso, traslado."
        ),
        "template": {
            "action": "retiro",
            "where": "C15",
            "from": "Galpon San Martin",
            "elemento": "Pala",
            "cantidad": 2,
        },
    }


@router.post("/actions")
def whatsapp_actions(dto: WhatsAppActionDTO, db: Session = Depends(get_db)):
    dto.phone = normalize_phone(dto.phone) or dto.phone
    result = handle_action(db, dto)
    result["phone"] = dto.phone
    return result
