from datetime import datetime, timedelta
import time
import logging
import models
import smtplib
from typing import List
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dtos.deleteItemDTO import ResponseFakeDeleteDTO
from database import SessionLocal
from config import EmailConfig
import pytz

TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

def now():
    """Devuelve la fecha/hora actual en la zona horaria de Buenos Aires"""
    return datetime.now(TIMEZONE)

logger = logging.getLogger(__name__)

class NotificationService:
    @staticmethod

    def check_pending_items():
        db = None
        try:
            db = SessionLocal()
            now_utc = datetime.utcnow()

            threshold_days = max(float(EmailConfig.NOTIFICATION_THRESHOLD_DAYS or 7), 0.1)
            threshold_datetime = now_utc - timedelta(days=threshold_days)

            # Trae todos los items pendientes (turnback == False)
            pending_items = db.query(
                models.History,
                models.Item.name.label('itemName'),
                models.Item.category.label('itemCategory')
            ).join(
                models.Item, models.History.itemId == models.Item.id
            ).filter(
                models.History.turnback == False
            ).all()

            items_to_notify = []

            for history, item_name, category in pending_items:
                # Verificamos si el item está pendiente desde hace más tiempo que el umbral
                if history.date < threshold_datetime:
                    # Verificamos si ya notificamos este item recientemente
                    if not history.lastNotification or history.lastNotification < threshold_datetime:
                        items_to_notify.append((history, item_name, category))

            if items_to_notify:
                logger.info(f"Se encontraron {len(items_to_notify)} ítems pendientes para notificar.")
                NotificationService.send_notification_email(items_to_notify)

                # Guardar última fecha de notificación
                for history, _, _ in items_to_notify:
                    history.lastNotification = now_utc
                db.commit()
                logger.info("Se actualizó la fecha de última notificación de los ítems.")
            else:
                logger.info("No hay ítems pendientes para notificar en esta corrida.")

        except Exception as e:
            logger.error(f"Error checking pending items: {e}", exc_info=True)
        finally:
            if db is not None:
                db.close()


    @staticmethod
    def _build_email_body(items: List[tuple]) -> str:
        body = "Los siguientes ítems llevan demasiado tiempo pendientes:\n\n"
        for item, item_name, category in items:
            days_pending = (datetime.utcnow() - item.date).days
            body += (
                f"Ítem: {item_name}\n"
                f"Categoría: {category}\n"
                f"Retirado por: {item.personWhoTook or item.userName}\n"
                f"Fecha de retiro: {item.date.strftime('%d/%m/%Y %H:%M:%S')}\n"
                f"Días pendientes: {days_pending}\n"
                f"Cantidad: {item.amountNotReturned}\n"
                f"Lugar: {item.place or 'No especificado'}\n"
                "----------------------------------------\n"
            )
        return body

    @staticmethod
    def send_notification_email(items: List[tuple]):
        if not EmailConfig.is_configured():
            logger.warning(
                "Email no configurado (EMAIL_ADDRESS / EMAIL_PASSWORD / ADMIN_EMAIL). "
                "Se omite el envío de notificación."
            )
            return
        try:
            msg = MIMEMultipart()
            msg['From'] = EmailConfig.EMAIL_ADDRESS
            msg['To'] = EmailConfig.ADMIN_EMAIL
            msg['Subject'] = f"Notificación de ítems pendientes ({len(items)})"

            body = NotificationService._build_email_body(items)
            msg.attach(MIMEText(body, 'plain'))

            with smtplib.SMTP(EmailConfig.SMTP_SERVER, EmailConfig.SMTP_PORT) as server:
                server.starttls()
                server.login(EmailConfig.EMAIL_ADDRESS, EmailConfig.EMAIL_PASSWORD)
                server.send_message(msg)
                logger.info("Correo de notificación enviado correctamente.")

        except smtplib.SMTPException as e:
            logger.error(f"Error SMTP al enviar notificación: {e}", exc_info=True)
        except Exception as e:
            logger.error(f"Error inesperado al enviar notificación: {e}", exc_info=True)

    @staticmethod
    def run_scheduler():
        interval_seconds = 60 * 60
        logger.info("Iniciando scheduler de notificaciones")
        while True:
            try:
                logger.info("Ejecutando chequeo de ítems pendientes...")
                NotificationService.check_pending_items()
                logger.info("Chequeo finalizado, durmiendo %s segundos...", interval_seconds)
                time.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"Error en scheduler de notificaciones: {e}", exc_info=True)
                time.sleep(60)

def enviar_mail_fallo_borrado(dto: ResponseFakeDeleteDTO, itemName: str):
    if not EmailConfig.is_configured():
        logger.warning(
            "Email no configurado. Se omite aviso de borrado no autorizado."
        )
        return
    date_time = now()
    asunto = "Intento de borrado NO AUTORIZADO"
    cuerpo = f"""
    El usuario {dto.username} intentó borrar {itemName} sin permisos.

    Motivo: {dto.description}
    Fecha: {date_time}
    """

    mensaje = MIMEMultipart()
    mensaje["From"] = EmailConfig.EMAIL_ADDRESS
    mensaje["To"] = EmailConfig.ADMIN_EMAIL
    mensaje["Subject"] = asunto
    mensaje.attach(MIMEText(cuerpo, "plain"))

    try:
        with smtplib.SMTP(EmailConfig.SMTP_SERVER, EmailConfig.SMTP_PORT) as servidor:
            servidor.starttls()
            servidor.login(EmailConfig.EMAIL_ADDRESS, EmailConfig.EMAIL_PASSWORD)
            servidor.send_message(mensaje)
        logger.info("Correo de borrado no autorizado enviado.")
    except Exception as e:
        logger.error("Error al enviar correo de borrado no autorizado: %s", e)
