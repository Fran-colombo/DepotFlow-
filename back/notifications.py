from collections import defaultdict
from datetime import datetime, timedelta
from html import escape
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
REPORT_KINDS = ("pending", "broken", "no_stock")
KIND_LABELS = {
    "pending": "Pendientes fuera del depósito",
    "broken": "Elementos rotos",
    "no_stock": "Sin stock en depósito",
}


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


def parse_kinds(raw):
    values = []
    if raw is None or str(raw).strip() == "":
        return ["pending"]
    text = str(raw).strip()
    try:
        parsed = json.loads(text)
        parts = parsed if isinstance(parsed, list) else [parsed]
    except (TypeError, json.JSONDecodeError):
        parts = [part.strip() for part in text.split(",")]
    for part in parts:
        kind = str(part or "").strip().lower()
        if kind in REPORT_KINDS and kind not in values:
            values.append(kind)
    return values or ["pending"]


def dump_kinds(kinds):
    values = []
    for part in kinds or []:
        kind = str(part or "").strip().lower()
        if kind in REPORT_KINDS and kind not in values:
            values.append(kind)
    return ",".join(values or ["pending"])


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
                kind="pending",
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


def _item_query(db, item_ids=None):
    query = db.query(models.Item).filter(models.Item.status == 1)
    if item_ids:
        query = query.filter(models.Item.id.in_(item_ids))
    return query


def broken_lines(db, item_ids=None):
    query = (
        db.query(models.ItemUnit, models.Item)
        .join(models.Item, models.Item.id == models.ItemUnit.item_id)
        .filter(
            models.Item.status == 1,
            models.ItemUnit.is_broken.is_(True),
            models.ItemUnit.status != "tirada",
        )
    )
    if item_ids:
        query = query.filter(models.Item.id.in_(item_ids))
    lines = []
    for unit, item in query.all():
        status_labels = {
            "en_stock": "En depósito",
            "retirada": "En obra",
            "fuera_de_servicio": "Fuera de servicio",
            "consumida": "Usada",
        }
        lines.append({
            "item_id": item.id,
            "obra": "",
            "subcategory": item.name or "Sin subcategoría",
            "label": unit.name or unit.code or item.name,
            "code": unit.code or "",
            "amount": int(unit.quantity or 1),
            "person": status_labels.get(unit.status, unit.status or ""),
            "date": None,
            "days": None,
            "note": (unit.damage_note or unit.repair_note or "").strip(),
        })
    return lines


def no_stock_lines(db, item_ids=None):
    items = _item_query(db, item_ids).order_by(models.Item.name.asc()).all()
    lines = []
    for item in items:
        if int(item.actualAmount or 0) > 0:
            continue
        lines.append({
            "item_id": item.id,
            "obra": "",
            "subcategory": item.category or "Sin categoría",
            "label": item.name or "Sin nombre",
            "code": "",
            "amount": 0,
            "person": "Por cantidad" if not item.track_units else "Por código",
            "date": None,
            "days": None,
            "note": "",
        })
    return lines


def report_lines(db, kind, item_ids=None):
    if kind == "broken":
        return broken_lines(db, item_ids)
    if kind == "no_stock":
        return no_stock_lines(db, item_ids)
    return pending_lines(db, item_ids)


def _line_sort_key(line):
    return (
        (line.get("obra") or "").lower(),
        (line.get("subcategory") or "").lower(),
        (line.get("label") or "").lower(),
        (line.get("code") or "").lower(),
    )


def _grouped_lines(lines):
    groups = []
    current = None
    for line in sorted(lines, key=_line_sort_key):
        obra = line.get("obra") or ""
        sub = line.get("subcategory") or ""
        if current is None or current["obra"] != obra or current["subcategory"] != sub:
            current = {"obra": obra, "subcategory": sub, "lines": []}
            groups.append(current)
        current["lines"].append(line)
    return groups


def _line_name(line):
    name = line.get("label") or ""
    code = line.get("code") or ""
    if code and code != name:
        return f"{name} ({code})"
    return name


def _empty_message(kind):
    if kind == "broken":
        return "No hay elementos rotos."
    if kind == "no_stock":
        return "No hay productos sin stock."
    return "No hay ítems pendientes fuera del depósito."


def _section_title(kind, title=None):
    return title or KIND_LABELS.get(kind, KIND_LABELS["pending"]) + "."


def build_pending_body(lines, title=None, empty_message=None):
    if not lines:
        return empty_message or "No hay ítems pendientes fuera del depósito."
    chunks = [title or "Pendientes que siguen fuera del depósito.", ""]
    unseen = object()
    last_obra = unseen
    for group in _grouped_lines(lines):
        if group["obra"] and group["obra"] != last_obra:
            if last_obra is not unseen:
                chunks.append("")
            chunks.append(f"Obra: {group['obra']}")
            last_obra = group["obra"]
        elif not group["obra"] and last_obra is not unseen:
            chunks.append("")
            last_obra = ""
        chunks.append(group["subcategory"])
        for line in group["lines"]:
            chunks.append(f"  {_line_name(line)}")
            meta = [f"Cantidad: {line.get('amount', 0)}"]
            if line.get("person"):
                meta.append(line["person"])
            if line.get("date"):
                meta.append(line["date"].strftime("%d/%m/%Y"))
            if line.get("days") is not None:
                meta.append(f"{line['days']} días")
            if line.get("note"):
                meta.append(line["note"])
            chunks.append("  " + "  ·  ".join(meta))
        chunks.append("")
    return "\n".join(chunks).rstrip() + "\n"


def _html(text):
    return escape(str(text or ""))


def build_report_html(kind, lines, title=None):
    heading = _html(_section_title(kind, title).rstrip("."))
    if not lines:
        return (
            f'<h2 style="margin:0 0 12px;font-size:18px;color:#101828">{heading}</h2>'
            f'<p style="margin:0;color:#667085">{_html(_empty_message(kind))}</p>'
        )
    blocks = [
        f'<h2 style="margin:0 0 16px;font-size:18px;color:#101828">{heading}</h2>'
    ]
    last_obra = object()
    unseen = last_obra
    for group in _grouped_lines(lines):
        if group["obra"] and group["obra"] != last_obra:
            blocks.append(
                '<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px">'
                f'<tr><td style="background:#175cd3;color:#ffffff;padding:10px 14px;'
                f'font-size:15px;font-weight:bold;border-radius:8px 8px 0 0">'
                f'{_html(group["obra"])}</td></tr></table>'
            )
            last_obra = group["obra"]
        rows = []
        for line in group["lines"]:
            name = _html(line.get("label") or "")
            code = line.get("code") or ""
            code_html = (
                f'<div style="font-size:12px;color:#667085;margin-top:2px">{_html(code)}</div>'
                if code and code != line.get("label")
                else ""
            )
            meta_bits = []
            if line.get("person"):
                meta_bits.append(_html(line["person"]))
            if line.get("date"):
                meta_bits.append(_html(line["date"].strftime("%d/%m/%Y")))
            if line.get("days") is not None:
                meta_bits.append(_html(f"{line['days']} días"))
            if line.get("note"):
                meta_bits.append(_html(line["note"]))
            meta = " · ".join(meta_bits)
            rows.append(
                '<tr>'
                '<td style="padding:10px 14px;border-top:1px solid #eaecf0;vertical-align:top">'
                f'<div style="font-weight:600;color:#101828">{name}</div>'
                f"{code_html}"
                f'<div style="font-size:12px;color:#667085;margin-top:4px">{meta}</div>'
                "</td>"
                '<td style="padding:10px 14px;border-top:1px solid #eaecf0;vertical-align:top;'
                'text-align:right;white-space:nowrap;font-weight:600;color:#175cd3">'
                f'×{_html(line.get("amount", 0))}</td>'
                "</tr>"
            )
        blocks.append(
            '<table width="100%" cellpadding="0" cellspacing="0" '
            'style="background:#ffffff;border:1px solid #eaecf0;border-radius:8px;margin:0 0 12px">'
            f'<tr><td colspan="2" style="padding:10px 14px;font-size:13px;color:#667085;'
            f'font-weight:bold;background:#f7f8fa">{_html(group["subcategory"])}</td></tr>'
            + "".join(rows)
            + "</table>"
        )
    return "".join(blocks)


def wrap_report_html(inner):
    return (
        "<!DOCTYPE html><html><body "
        'style="margin:0;padding:0;background:#f7f8fa;font-family:Arial,Helvetica,sans-serif;'
        'color:#101828">'
        '<div style="max-width:640px;margin:0 auto;padding:20px 12px">'
        f"{inner}"
        "</div></body></html>"
    )


def build_report_body(kind, lines, title=None):
    return build_pending_body(
        lines,
        title=_section_title(kind, title),
        empty_message=_empty_message(kind),
    )


def build_report_parts(kind, lines, title=None):
    return (
        build_report_body(kind, lines, title=title),
        build_report_html(kind, lines, title=title),
    )


def _send_mail(subject, body, html=None):
    if not EmailConfig.is_configured():
        logger.warning(
            "Email no configurado (EMAIL_ADDRESS / EMAIL_PASSWORD / ADMIN_EMAIL). "
            "Se omite el envío."
        )
        return False
    msg = MIMEMultipart("alternative")
    msg["From"] = EmailConfig.EMAIL_ADDRESS
    msg["To"] = EmailConfig.ADMIN_EMAIL
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(wrap_report_html(html), "html", "utf-8"))
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
    kinds = parse_kinds(getattr(report, "kind", None))
    collected = []
    for kind in kinds:
        collected.append((kind, report_lines(db, kind, item_ids or None)))
    sent = 0
    if report.combine:
        texts = []
        htmls = []
        for kind, lines in collected:
            title = KIND_LABELS[kind] + "." if len(kinds) > 1 else None
            text, html = build_report_parts(kind, lines, title=title)
            texts.append(text)
            htmls.append(html)
        subject = report.name or KIND_LABELS[kinds[0]]
        if _send_mail(subject, "\n".join(texts), "".join(htmls)):
            sent = 1
    else:
        by_item = defaultdict(list)
        for kind, lines in collected:
            for line in lines:
                by_item[line["item_id"]].append((kind, line))
        targets = item_ids or sorted(by_item.keys())
        names = {}
        if targets:
            names = {
                item.id: item.name
                for item in db.query(models.Item).filter(models.Item.id.in_(targets)).all()
            }
        for item_id in targets:
            grouped = by_item.get(item_id) or []
            if not grouped:
                continue
            subcategory = names.get(item_id) or grouped[0][1]["subcategory"]
            texts = []
            htmls = []
            lines_by_kind = defaultdict(list)
            for kind, line in grouped:
                lines_by_kind[kind].append(line)
            for kind in kinds:
                kind_lines = lines_by_kind.get(kind) or []
                if not kind_lines and len(kinds) > 1:
                    continue
                title = f"{KIND_LABELS[kind]} · {subcategory}."
                text, html = build_report_parts(kind, kind_lines, title=title)
                texts.append(text)
                htmls.append(html)
            if _send_mail(f"{report.name} · {subcategory}", "\n".join(texts), "".join(htmls)):
                sent += 1
        if not targets:
            texts = []
            htmls = []
            for kind, lines in collected:
                text, html = build_report_parts(kind, lines)
                texts.append(text)
                htmls.append(html)
            if _send_mail(report.name or KIND_LABELS[kinds[0]], "\n".join(texts), "".join(htmls)):
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
