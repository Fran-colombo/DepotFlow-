from collections import defaultdict
from datetime import datetime, timedelta
import json
import logging
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import pytz
from sqlalchemy import or_

import models
from config import EmailConfig
from database import SessionLocal
from dtos.deleteItemDTO import ResponseFakeDeleteDTO
from unit_service import REPAIR_PLACE

TIMEZONE = pytz.timezone("America/Argentina/Buenos_Aires")
logger = logging.getLogger(__name__)
DEFAULT_REPORT_NAME = "Pendientes por obra"


def now():
    return datetime.now(TIMEZONE)


def _aware(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return TIMEZONE.localize(value)
    return value.astimezone(TIMEZONE)


def parse_item_ids(raw):
    if raw is None or str(raw).strip() in ("", "[]"):
        return []
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return []
    ids = []
    for value in data if isinstance(data, list) else []:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids


def dump_item_ids(item_ids):
    values = []
    for value in item_ids or []:
        try:
            values.append(int(value))
        except (TypeError, ValueError):
            continue
    return json.dumps(values)


def seed_default_report(db=None):
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        if db.query(models.EmailReport).first():
            return
        db.add(
            models.EmailReport(
                name=DEFAULT_REPORT_NAME,
                enabled=True,
                frequency="monthly",
                combine=True,
                item_ids="[]",
            )
        )
        db.commit()
        logger.info("Reporte de pendientes mensual creado")
    except Exception:
        db.rollback()
        logger.exception("No se pudo crear el reporte de pendientes por defecto")
    finally:
        if close:
            db.close()


def report_is_due(report, moment=None):
    if not report.enabled:
        return False
    moment = moment or now()
    last = _aware(report.last_sent)
    frequency = (report.frequency or "monthly").strip().lower()
    if frequency == "weekly":
        monday = (moment - timedelta(days=moment.weekday())).date()
        if last and last.date() >= monday:
            return False
        if last is None:
            return moment.weekday() == 0
        return last.date() < monday
    if last is None:
        return moment.day == 1
    return (last.year, last.month) < (moment.year, moment.month)


def _pending_query(db, item_ids=None):
    query = (
        db.query(models.History, models.Item)
        .join(models.Item, models.History.itemId == models.Item.id)
        .filter(
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
            models.History.place != REPAIR_PLACE,
            or_(
                models.History.hideFromHistorial.is_(False),
                models.History.hideFromHistorial.is_(None),
            ),
            models.Item.status == 1,
        )
    )
    if item_ids:
        query = query.filter(models.History.itemId.in_(item_ids))
    return query


def pending_lines(db, item_ids=None):
    rows = _pending_query(db, item_ids).all()
    if not rows:
        return []
    history_ids = [history.id for history, _item in rows]
    links = (
        db.query(models.HistoryUnit)
        .filter(models.HistoryUnit.history_id.in_(history_ids))
        .all()
    )
    links_by_history = defaultdict(list)
    unit_ids = set()
    for link in links:
        links_by_history[link.history_id].append(link)
        unit_ids.add(link.unit_id)
    units = {}
    if unit_ids:
        units = {
            unit.id: unit
            for unit in db.query(models.ItemUnit).filter(models.ItemUnit.id.in_(unit_ids)).all()
        }
    moment = now()
    lines = []
    for history, item in rows:
        obra = (history.place or "").strip() or "Sin obra"
        subcategory = item.name or "Sin subcategoría"
        person = history.personWhoTook or history.userName or "—"
        history_date = _aware(history.date) or moment
        days = max((moment - history_date).days, 0)
        related = links_by_history.get(history.id) or []
        if related:
            for link in related:
                unit = units.get(link.unit_id)
                label = ((unit.name or unit.code) if unit else None) or subcategory
                lines.append({
                    "item_id": item.id,
                    "obra": obra,
                    "subcategory": subcategory,
                    "label": label,
                    "code": (unit.code if unit else "") or "",
                    "amount": int(link.amount or history.amountNotReturned or 1),
                    "person": person,
                    "date": history_date,
                    "days": days,
                })
            continue
        lines.append({
            "item_id": item.id,
            "obra": obra,
            "subcategory": subcategory,
            "label": subcategory,
            "code": "",
            "amount": int(history.amountNotReturned or 0),
            "person": person,
            "date": history_date,
            "days": days,
        })
    return lines


def _line_sort_key(line):
    return (
        (line.get("obra") or "").lower(),
        (line.get("subcategory") or "").lower(),
        (line.get("label") or "").lower(),
        (line.get("code") or "").lower(),
    )


def build_pending_body(lines, title=None):
    if not lines:
        return "No hay ítems pendientes fuera del depósito."
    ordered = sorted(lines, key=_line_sort_key)
    chunks = [title or "Pendientes que siguen fuera del depósito.", ""]
    current_obra = None
    current_sub = None
    for line in ordered:
        if line["obra"] != current_obra:
            current_obra = line["obra"]
            current_sub = None
            chunks.append(f"Obra: {current_obra}")
        if line["subcategory"] != current_sub:
            current_sub = line["subcategory"]
            chunks.append(f"  {current_sub}")
        name = line["label"]
        if line["code"] and line["code"] != name:
            name = f"{name} ({line['code']})"
        date_text = line["date"].strftime("%d/%m/%Y") if line.get("date") else ""
        chunks.append(
            f"    {name}  ×{line['amount']}  · {line['person']}  · {date_text}  · {line['days']} días"
        )
    return "\n".join(chunks) + "\n"


def _send_mail(subject, body):
    if not EmailConfig.is_configured():
        logger.warning(
            "Email no configurado (EMAIL_ADDRESS / EMAIL_PASSWORD / ADMIN_EMAIL). "
            "Se omite el envío."
        )
        return False
    msg = MIMEMultipart()
    msg["From"] = EmailConfig.EMAIL_ADDRESS
    msg["To"] = EmailConfig.ADMIN_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    with smtplib.SMTP(EmailConfig.SMTP_SERVER, EmailConfig.SMTP_PORT) as server:
        server.starttls()
        server.login(EmailConfig.EMAIL_ADDRESS, EmailConfig.EMAIL_PASSWORD)
        server.send_message(msg)
    logger.info("Correo enviado: %s", subject)
    return True


def send_report(db, report, force=False):
    if not EmailConfig.is_configured():
        logger.warning(
            "Email no configurado (EMAIL_ADDRESS / EMAIL_PASSWORD / ADMIN_EMAIL). "
            "Se omite el envío."
        )
        return {"sent": 0, "skipped": True, "reason": "email"}
    if not force and not report_is_due(report):
        return {"sent": 0, "skipped": True}
    item_ids = parse_item_ids(report.item_ids)
    lines = pending_lines(db, item_ids or None)
    sent = 0
    if report.combine:
        subject = report.name or DEFAULT_REPORT_NAME
        if _send_mail(subject, build_pending_body(lines)):
            sent = 1
    else:
        by_item = defaultdict(list)
        for line in lines:
            by_item[line["item_id"]].append(line)
        targets = item_ids or sorted(by_item.keys())
        names = {}
        if targets:
            names = {
                item.id: item.name
                for item in db.query(models.Item).filter(models.Item.id.in_(targets)).all()
            }
        for item_id in targets:
            group = by_item.get(item_id) or []
            if not group:
                continue
            subcategory = names.get(item_id) or group[0]["subcategory"]
            subject = f"{report.name} · {subcategory}"
            if _send_mail(subject, build_pending_body(group, f"Pendientes de {subcategory}.")):
                sent += 1
        if not targets and not lines:
            if _send_mail(report.name or DEFAULT_REPORT_NAME, build_pending_body([])):
                sent = 1
    report.last_sent = now().replace(tzinfo=None)
    db.add(report)
    db.commit()
    return {"sent": sent, "skipped": False}


class NotificationService:
    @staticmethod
    def check_pending_items():
        db = None
        try:
            db = SessionLocal()
            seed_default_report(db)
            reports = db.query(models.EmailReport).filter(models.EmailReport.enabled.is_(True)).all()
            due = [report for report in reports if report_is_due(report)]
            if not due:
                logger.info("No hay reportes de pendientes vencidos")
                return
            for report in due:
                try:
                    result = send_report(db, report)
                    logger.info(
                        "Reporte %s: %s mails",
                        report.name,
                        result.get("sent") or 0,
                    )
                except Exception:
                    logger.exception("Error enviando reporte %s", report.name)
        except Exception:
            logger.exception("Error checking pending reports")
        finally:
            if db is not None:
                db.close()

    @staticmethod
    def run_scheduler():
        interval_seconds = 60 * 60
        logger.info("Iniciando scheduler de reportes de pendientes")
        while True:
            try:
                NotificationService.check_pending_items()
                time.sleep(interval_seconds)
            except Exception:
                logger.exception("Error en scheduler de notificaciones")
                time.sleep(60)


def enviar_mail_fallo_borrado(dto: ResponseFakeDeleteDTO, itemName: str):
    if not EmailConfig.is_configured():
        logger.warning("Email no configurado. Se omite aviso de borrado no autorizado.")
        return
    date_time = now()
    asunto = "Intento de borrado NO AUTORIZADO"
    cuerpo = f"""
    El usuario {dto.username} intentó borrar {itemName} sin permisos.

    Motivo: {dto.description}
    Fecha: {date_time}
    """
    try:
        _send_mail(asunto, cuerpo)
    except Exception as e:
        logger.error("Error al enviar correo de borrado no autorizado: %s", e)
