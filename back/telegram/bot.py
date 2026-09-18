import logging
import os
import threading
import time
from typing import Annotated

import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from auth import get_current_user
from database import SessionLocal, get_db
from sqlalchemy.orm import Session
from telegram.identity import (
    consume_link_token,
    create_link_token,
    link_telegram_user,
    normalize_telegram_id,
)
from whatsapp.handlers import WhatsAppActionDTO, handle_action

logger = logging.getLogger(__name__)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("urllib3.connectionpool").setLevel(logging.WARNING)

router = APIRouter(prefix="/telegram", tags=["telegram"])

TELEGRAM_API = "https://api.telegram.org"
_bot_username_cache: str | None = None


def bot_token() -> str:
    return (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()


def webhook_secret() -> str:
    return (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()


def webhook_url() -> str:
    return (os.getenv("TELEGRAM_WEBHOOK_URL") or "").strip()


def n8n_webhook_url() -> str:
    return (os.getenv("TELEGRAM_N8N_WEBHOOK_URL") or "").strip()


def _api(method: str) -> str:
    return f"{TELEGRAM_API}/bot{bot_token()}/{method}"


def bot_username() -> str | None:
    global _bot_username_cache
    env_name = (os.getenv("TELEGRAM_BOT_USERNAME") or "").strip().lstrip("@")
    if env_name:
        return env_name
    if _bot_username_cache:
        return _bot_username_cache
    if not bot_token():
        return None
    try:
        response = requests.get(_api("getMe"), timeout=15)
        response.raise_for_status()
        username = (response.json().get("result") or {}).get("username")
        if username:
            _bot_username_cache = username
            return username
    except requests.RequestException:
        logger.exception("No se pudo obtener el usuario del bot de Telegram")
    return None


def bot_deeplink(start: str | None = None) -> str | None:
    username = bot_username()
    if not username:
        return None
    if start:
        return f"https://t.me/{username}?start={start}"
    return f"https://t.me/{username}"


def send_message(chat_id: int | str, text: str) -> None:
    token = bot_token()
    if not token or not text:
        return
    payload = {
        "chat_id": chat_id,
        "text": text[:4096],
    }
    try:
        response = requests.post(_api("sendMessage"), json=payload, timeout=20)
        if not response.ok:
            logger.warning("Telegram sendMessage falló: %s %s", response.status_code, response.text)
    except requests.RequestException:
        logger.exception("No se pudo enviar mensaje de Telegram a %s", chat_id)


def _link_from_start_payload(payload: str, telegram_id: str) -> str:
    db = SessionLocal()
    try:
        user_id = consume_link_token(db, payload)
        if user_id is None:
            return (
                "El enlace de vinculación expiró o ya se usó.\n"
                "Pedile a un admin un link nuevo en Usuarios, o tocá Telegram en el menú."
            )
        user = link_telegram_user(db, user_id, telegram_id)
        return (
            f"Listo {user.name}. Este Telegram quedó vinculado a tu usuario.\n"
            "Ya podés consultar o mover stock por acá."
        )
    except ValueError as exc:
        return str(exc)
    except Exception:
        logger.exception("Error vinculando Telegram")
        return "No pude vincular este Telegram. Pedile a un admin un link nuevo."
    finally:
        db.close()


def _forward_to_n8n(telegram_id: str, chat_id: int | str, text: str) -> str | None:
    url = n8n_webhook_url()
    if not url:
        return None
    try:
        response = requests.post(
            url,
            json={"telegram_id": telegram_id, "chat_id": chat_id, "text": text},
            timeout=120,
        )
        if not response.ok:
            logger.warning(
                "n8n Telegram webhook falló: %s %s",
                response.status_code,
                response.text[:300],
            )
            return None
        data = response.json() if response.content else {}
        if isinstance(data, list) and data:
            data = data[0]
        if isinstance(data, dict):
            reply = data.get("reply") or (data.get("json") or {}).get("reply")
            if reply:
                return str(reply)
    except requests.RequestException:
        logger.exception("No se pudo llamar al webhook n8n de Telegram")
    return None


def process_update(update: dict) -> None:
    message = update.get("message") or update.get("edited_message") or {}
    if not message:
        return
    chat_id = (message.get("chat") or {}).get("id")
    from_user = message.get("from") or {}
    telegram_id = normalize_telegram_id(from_user.get("id") or chat_id)
    if not chat_id or not telegram_id:
        return

    text = (message.get("text") or "").strip()
    if not text:
        send_message(chat_id, "Mandá un mensaje de texto para consultar o mover stock.")
        return

    if text.lower().startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) > 1:
            send_message(chat_id, _link_from_start_payload(parts[1], telegram_id))
            return

    n8n_reply = _forward_to_n8n(telegram_id, chat_id, text)
    if n8n_reply:
        send_message(chat_id, n8n_reply)
        return

    dto = WhatsAppActionDTO(telegram_id=telegram_id, text=text)
    db = SessionLocal()
    try:
        result = handle_action(db, dto)
        send_message(chat_id, result.get("reply") or "No pude procesar el mensaje.")
    except Exception:
        logger.exception("Error procesando update de Telegram")
        send_message(chat_id, "Hubo un error al procesar el mensaje. Probá de nuevo.")
    finally:
        db.close()


def _set_webhook(url: str) -> None:
    payload = {"url": url}
    secret = webhook_secret()
    if secret:
        payload["secret_token"] = secret
    response = requests.post(_api("setWebhook"), json=payload, timeout=20)
    if not response.ok:
        logger.warning("No se pudo registrar webhook de Telegram: %s %s", response.status_code, response.text)
        return
    logger.info("Webhook de Telegram registrado: %s", url)


def _delete_webhook() -> None:
    try:
        requests.post(_api("deleteWebhook"), json={"drop_pending_updates": False}, timeout=20)
    except requests.RequestException:
        logger.exception("No se pudo borrar el webhook de Telegram")


def _poll_loop() -> None:
    offset = 0
    logger.info("Polling de Telegram iniciado (getUpdates)")
    while True:
        if not bot_token():
            return
        try:
            response = requests.post(
                _api("getUpdates"),
                json={"offset": offset, "timeout": 25},
                timeout=35,
            )
            response.raise_for_status()
            for update in response.json().get("result") or []:
                offset = max(offset, int(update.get("update_id", 0)) + 1)
                process_update(update)
        except requests.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else None
            if code == 409:
                logger.warning(
                    "Telegram getUpdates en conflicto (otro proceso ya está escuchando). Reintento en 10s."
                )
                time.sleep(10)
            else:
                logger.warning("Telegram getUpdates HTTP %s", code)
                time.sleep(5)
        except requests.RequestException:
            logger.exception("Error en getUpdates de Telegram")
            time.sleep(5)
        except Exception:
            logger.exception("Error inesperado en polling de Telegram")
            time.sleep(5)


def start_telegram_bot() -> None:
    token = bot_token()
    if not token:
        logger.info("Telegram omitido: falta TELEGRAM_BOT_TOKEN")
        return

    username = bot_username()
    if username:
        logger.info("Bot de Telegram: @%s (%s)", username, bot_deeplink())
    if n8n_webhook_url():
        logger.info("Telegram → n8n: %s", n8n_webhook_url())
    else:
        logger.info("Telegram sin n8n (TELEGRAM_N8N_WEBHOOK_URL vacío): respuestas directas")

    url = webhook_url()
    if url:
        _set_webhook(url)
        return

    _delete_webhook()
    thread = threading.Thread(target=_poll_loop, daemon=True, name="telegram-poll")
    thread.start()


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    if not bot_token():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram no configurado (TELEGRAM_BOT_TOKEN)",
        )

    secret = webhook_secret()
    if secret and x_telegram_bot_api_secret_token != secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Secret inválido")

    update = await request.json()
    process_update(update if isinstance(update, dict) else {})
    return {"ok": True}


@router.get("/bot")
def telegram_bot_info():
    username = bot_username()
    url = bot_deeplink()
    return {
        "configured": bool(bot_token() and username),
        "username": username,
        "url": url,
    }


@router.post("/link")
def telegram_link(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    return issue_user_deeplink(db, current_user["user_id"])


def issue_user_deeplink(db: Session, user_id: int) -> dict:
    if not bot_token():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram no está configurado en el servidor.",
        )
    username = bot_username()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener el usuario del bot. Probá más tarde.",
        )
    try:
        token, expires = create_link_token(db, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return {
        "url": bot_deeplink(token),
        "username": username,
        "expires_at": expires.isoformat() + "Z",
    }
