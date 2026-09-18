import logging
import os
import threading
import time

import requests
from fastapi import APIRouter, Header, HTTPException, Request, status

from database import SessionLocal
from telegram.identity import normalize_telegram_id
from whatsapp.handlers import WhatsAppActionDTO, handle_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["telegram"])

TELEGRAM_API = "https://api.telegram.org"


def bot_token() -> str:
    return (os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()


def webhook_secret() -> str:
    return (os.getenv("TELEGRAM_WEBHOOK_SECRET") or "").strip()


def webhook_url() -> str:
    return (os.getenv("TELEGRAM_WEBHOOK_URL") or "").strip()


def _api(method: str) -> str:
    return f"{TELEGRAM_API}/bot{bot_token()}/{method}"


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
