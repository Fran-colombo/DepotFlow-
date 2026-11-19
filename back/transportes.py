from datetime import date, datetime, time, timedelta
from io import BytesIO
from typing import Annotated, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user, get_user_name_by_id, has_admin_access
from database import get_db
from feriados import holidays_in_range, working_days
from obras import require_active_obra
from item_images import (
    MAX_BYTES,
    MEDIA_TYPES,
    _load_image,
    _save_processed,
    delete_stored_image,
    stored_image_path,
)
from rosario_multas import RosarioError, fetch_hits, match_hits, parse_datetime

WEEKDAY_ES = (
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
)

router = APIRouter(prefix="/transportes", tags=["transportes"])


def _admin(current_user):
    if not has_admin_access(current_user):
        raise HTTPException(status_code=403, detail="Solo admin puede hacer eso")


def _moment(value: str) -> datetime:
    text = (value or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Indicá la fecha y la hora")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        raise HTTPException(status_code=400, detail="La fecha y la hora no son válidas")


def _km(value):
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise HTTPException(status_code=400, detail="Los kilómetros tienen que ser un número")
    return value


def _plate(raw: str) -> str:
    plate = " ".join((raw or "").split()).upper()
    if not plate:
        raise HTTPException(status_code=400, detail="Indicá la patente")
    return plate


def _get(db: Session, transport_id: int) -> models.Transport:
    row = db.query(models.Transport).filter(models.Transport.id == transport_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No está")
    return row


def _get_fine(db: Session, fine_id: int) -> models.TransportFine:
    fine = db.query(models.TransportFine).filter(models.TransportFine.id == fine_id).first()
    if not fine:
        raise HTTPException(status_code=404, detail="No está esa multa")
    return fine


FINE_STATUSES = ("a_pagar", "a_reclamar", "reclamo", "pagada")
FINE_STATUS_LABELS = {
    "a_pagar": "A pagar",
    "a_reclamar": "A reclamar",
    "reclamo": "Reclamada",
    "pagada": "Pagada",
}


def _fine_file_kind(filename: str) -> str:
    if not filename:
        return ""
    return "pdf" if filename.lower().endswith(".pdf") else "image"


def _fine_status(fine: models.TransportFine) -> str:
    status = (getattr(fine, "status", None) or "").strip()
    if status in FINE_STATUSES:
        return status
    return "pagada" if fine.paid else "a_pagar"


def _set_fine_status(fine: models.TransportFine, status: str) -> None:
    value = (status or "").strip()
    if value not in FINE_STATUSES:
        raise HTTPException(status_code=400, detail="El estado no es válido")
    fine.status = value
    fine.paid = value == "pagada"


def _apply_rosario_hit(fine: models.TransportFine, hit: dict) -> None:
    fine.acta = (hit.get("acta") or "").strip() or None
    fine.infraccion = (hit.get("infraccion") or "").strip() or None
    fine.lugar_infraccion = (hit.get("lugar") or "").strip() or None
    fine.municipal_section = (hit.get("section") or "").strip() or None
    if "voluntary" in hit:
        fine.voluntary = hit.get("voluntary")
    if "amount" in hit:
        amount = hit.get("amount")
        fine.amount = None if amount is None else int(amount)
    issued = parse_datetime(hit.get("issued_at") or "")
    if issued:
        fine.issued_at = issued
    due = parse_datetime(hit.get("due_at") or "")
    if due:
        fine.due_at = due
    fine.consulted_at = datetime.now()


def _day(value: str):
    text = (value or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Indicá la fecha")
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail="La fecha es día/mes/año")


def _optional_moment(value: Optional[str], label: str) -> Optional[datetime]:
    text = "" if value is None else str(value).strip()
    if not text:
        return None
    parsed = parse_datetime(text)
    if parsed:
        return parsed
    raise HTTPException(status_code=400, detail=f"{label} es día/mes/año")


def _excel_day(value: Optional[datetime], with_time: bool = False) -> str:
    if not value:
        return ""
    if with_time:
        return value.strftime("%d/%m/%Y %H:%M")
    return value.strftime("%d/%m/%Y")


def _voluntary_label(value) -> str:
    if value is True:
        return "Sí"
    if value is False:
        return "No"
    return ""


def _fine_out(fine: models.TransportFine, row: models.Transport | None = None) -> dict:
    filename = fine.image_filename or ""
    kind = _fine_file_kind(filename)
    status = _fine_status(fine)
    data = {
        "id": fine.id,
        "transport_id": fine.transport_id,
        "occurred_at": _iso(fine.occurred_at),
        "person": fine.person or "",
        "paid": status == "pagada",
        "status": status,
        "amount": fine.amount,
        "voluntary": None if fine.voluntary is None else bool(fine.voluntary),
        "acta": fine.acta or "",
        "infraccion": fine.infraccion or "",
        "lugar_infraccion": fine.lugar_infraccion or "",
        "municipal_section": fine.municipal_section or "",
        "issued_at": _iso(fine.issued_at),
        "due_at": _iso(fine.due_at),
        "consulted_at": _iso(fine.consulted_at),
        "claim_reason": fine.claim_reason or "",
        "has_file": bool(filename),
        "has_image": kind == "image",
        "file_kind": kind,
        "image_filename": filename,
    }
    if row is not None:
        data["plate"] = row.plate or ""
        data["name"] = row.name
    return data


def _save_fine_file(fine_id: int, data: bytes, filename: str | None, content_type: str | None) -> str:
    name = (filename or "").lower()
    ctype = (content_type or "").lower()
    is_pdf = name.endswith(".pdf") or "pdf" in ctype or data[:5] == b"%PDF-"
    if is_pdf:
        stored = f"multa{fine_id}_{uuid4().hex[:12]}.pdf"
        stored_image_path(stored).write_bytes(data)
        return stored
    try:
        img = _load_image(data)
    except HTTPException as exc:
        raise HTTPException(
            status_code=400,
            detail="Tiene que ser una foto (JPG, PNG, WEBP) o un PDF.",
        ) from exc
    return _save_processed(f"multa{fine_id}", img)


def _open_for(db: Session, transport_id: int):
    return (
        db.query(models.TransportUse)
        .filter(
            models.TransportUse.returned_at.is_(None),
            or_(
                models.TransportUse.transport_id == transport_id,
                models.TransportUse.cart_id == transport_id,
            ),
        )
        .order_by(models.TransportUse.id.desc())
        .first()
    )


def _iso(value):
    return value.isoformat() if value else None


def _use_row(use: models.TransportUse, names: dict) -> dict:
    return {
        "id": use.id,
        "transport_id": use.transport_id,
        "person": use.person,
        "left_at": _iso(use.left_at),
        "returned_at": _iso(use.returned_at),
        "km": use.km,
        "cart_id": use.cart_id,
        "cart_name": names.get(use.cart_id) or "",
        "external_vehicle": use.external_vehicle or "",
        "vehicle_name": names.get(use.transport_id) or "",
        "with_transport_id": use.with_transport_id,
        "with_transport_name": names.get(use.with_transport_id) or "",
        "obra": use.obra or "",
    }


def _summary(row: models.Transport, open_use, names: dict, joined_cart=None) -> dict:
    km_until = None
    if row.kind == "auto" and row.current_km is not None and row.next_service_km is not None:
        km_until = int(row.next_service_km) - int(row.current_km)
    place = "En depósito"
    with_name = ""
    if open_use:
        if open_use.transport_id == row.id and row.kind == "auto":
            place = "En uso"
            if open_use.cart_id:
                with_name = names.get(open_use.cart_id) or ""
            elif joined_cart:
                with_name = names.get(joined_cart.transport_id) or ""
        elif open_use.cart_id == row.id:
            place = "Con un auto"
            with_name = names.get(open_use.transport_id) or ""
        elif open_use.with_transport_id:
            place = "Con un auto"
            with_name = names.get(open_use.with_transport_id) or ""
        elif (open_use.obra or "").strip():
            place = f"En la obra · {open_use.obra.strip()}"
        else:
            place = "Prestado"
            with_name = open_use.external_vehicle or ""
    return {
        "id": row.id,
        "kind": row.kind,
        "name": row.name,
        "plate": row.plate or "",
        "has_image": bool(row.image_filename),
        "image_filename": row.image_filename,
        "current_km": row.current_km,
        "next_service_km": row.next_service_km,
        "km_until": km_until,
        "is_broken": bool(row.is_broken),
        "in_repair": bool(row.in_repair),
        "out": bool(open_use),
        "place": place,
        "with_name": with_name,
        "open_person": open_use.person if open_use else "",
        "open_left_at": _iso(open_use.left_at) if open_use else None,
        "joined_cart_id": joined_cart.transport_id if joined_cart else None,
    }


class CreateBody(BaseModel):
    kind: str
    name: str
    plate: Optional[str] = None


class LeaveBody(BaseModel):
    person: Optional[str] = None
    left_at: str
    cart_id: Optional[int] = None
    km: Optional[int] = None
    external_vehicle: Optional[str] = None
    with_transport_id: Optional[int] = None
    obra: Optional[str] = None


class ReturnBody(BaseModel):
    returned_at: str
    km: Optional[int] = None
    cart_too: bool = True


class HandoverBody(BaseModel):
    person: str
    at: str
    km: Optional[int] = None
    cart_too: bool = True


class PastUseBody(BaseModel):
    person: str
    left_at: str
    returned_at: str
    km: Optional[int] = None
    cart_id: Optional[int] = None
    external_vehicle: Optional[str] = None
    with_transport_id: Optional[int] = None


class ProfileBody(BaseModel):
    name: str
    plate: Optional[str] = None
    last_service_at: Optional[str] = None
    last_service_km: Optional[int] = None
    next_service_km: Optional[int] = None
    is_broken: bool = False
    damage_note: Optional[str] = None
    in_repair: bool = False


class NoteBody(BaseModel):
    description: str
    observed_by: Optional[str] = None


class FineLookupBody(BaseModel):
    occurred_at: str


class FineBody(BaseModel):
    occurred_at: str
    person: Optional[str] = None
    use_id: Optional[int] = None


class FinePersonBody(BaseModel):
    person: str


class FineUpdateBody(BaseModel):
    status: Optional[str] = None
    person: Optional[str] = None
    amount: Optional[int] = None
    voluntary: Optional[bool] = None
    acta: Optional[str] = None
    infraccion: Optional[str] = None
    lugar_infraccion: Optional[str] = None
    municipal_section: Optional[str] = None
    issued_at: Optional[str] = None
    due_at: Optional[str] = None
    claim_reason: Optional[str] = None


class FineExportBody(BaseModel):
    ids: list[int]


class UseReportBody(BaseModel):
    persona: Optional[str] = None
    transport_id: Optional[int] = None
    desde: Optional[str] = None
    hasta: Optional[str] = None


class RosarioBody(BaseModel):
    acta: Optional[str] = None
    occurred_at: Optional[str] = None
    infraccion: Optional[str] = None
    lugar: Optional[str] = None
    section: Optional[str] = None
    voluntary: Optional[bool] = None
    amount: Optional[int] = None
    issued_at: Optional[str] = None
    due_at: Optional[str] = None
    apply: bool = False


class KmBody(BaseModel):
    km: int


class ServicePlaceBody(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


def _clean(value) -> Optional[str]:
    return " ".join((value or "").split()) or None


def _place_row(place: models.TransportServicePlace) -> dict:
    return {
        "id": place.id,
        "name": place.name,
        "phone": place.phone or "",
        "address": place.address or "",
        "website": place.website or "",
    }


def _apply_place(place: models.TransportServicePlace, body: ServicePlaceBody):
    name = _clean(body.name)
    if not name:
        raise HTTPException(status_code=400, detail="Poné el nombre del lugar")
    place.name = name
    place.phone = _clean(body.phone)
    place.address = _clean(body.address)
    place.website = (body.website or "").strip() or None


def _names(db: Session) -> dict:
    rows = db.query(models.Transport.id, models.Transport.name).all()
    return {row.id: row.name for row in rows}


def _apply_km(row: models.Transport, km):
    if km is None or row.kind != "auto":
        return
    row.current_km = km


def _busy(db: Session, transport_id: int, start: datetime, end: datetime):
    return (
        db.query(models.TransportUse)
        .filter(
            or_(
                models.TransportUse.transport_id == transport_id,
                models.TransportUse.cart_id == transport_id,
            ),
            models.TransportUse.left_at < end,
            or_(
                models.TransportUse.returned_at.is_(None),
                models.TransportUse.returned_at > start,
            ),
        )
        .order_by(models.TransportUse.left_at.asc())
        .first()
    )


def _busy_detail(use: models.TransportUse, label: str) -> str:
    when = use.left_at.strftime("%d/%m/%Y %H:%M")
    who = (use.person or "").strip()
    where = (use.obra or "").strip()
    if who:
        return f"En esas fechas {label} lo tenía {who} (salió {when})"
    if where:
        return f"En esas fechas {label} estaba en {where} (salió {when})"
    return f"En esas fechas {label} estaba afuera (salió {when})"


def _joined_cart(db: Session, auto_id: int):
    return (
        db.query(models.TransportUse)
        .filter(
            models.TransportUse.returned_at.is_(None),
            models.TransportUse.with_transport_id == auto_id,
        )
        .order_by(models.TransportUse.id.desc())
        .first()
    )


@router.get("")
def list_transportes(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rows = db.query(models.Transport).order_by(models.Transport.name.asc()).all()
    names = {row.id: row.name for row in rows}
    open_rows = (
        db.query(models.TransportUse)
        .filter(models.TransportUse.returned_at.is_(None))
        .all()
    )
    open_by_id = {}
    joined_by_auto = {}
    for use in open_rows:
        open_by_id[use.transport_id] = use
        if use.cart_id:
            open_by_id[use.cart_id] = use
        if use.with_transport_id:
            joined_by_auto[use.with_transport_id] = use
    return [
        _summary(row, open_by_id.get(row.id), names, joined_by_auto.get(row.id))
        for row in rows
    ]


@router.get("/multas")
def list_fines(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rows = (
        db.query(models.TransportFine, models.Transport)
        .join(models.Transport, models.Transport.id == models.TransportFine.transport_id)
        .order_by(models.TransportFine.occurred_at.desc(), models.TransportFine.id.desc())
        .all()
    )
    return [_fine_out(fine, row) for fine, row in rows]


@router.post("/multas/export")
def export_fines(
    body: FineExportBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    wanted = []
    seen = set()
    for fine_id in body.ids or []:
        if fine_id in seen:
            continue
        seen.add(fine_id)
        wanted.append(fine_id)
    if not wanted:
        raise HTTPException(status_code=400, detail="Seleccioná al menos una multa")
    if len(wanted) > 500:
        raise HTTPException(status_code=400, detail="Demasiadas multas para exportar")
    rows = (
        db.query(models.TransportFine, models.Transport)
        .join(models.Transport, models.Transport.id == models.TransportFine.transport_id)
        .filter(models.TransportFine.id.in_(wanted))
        .all()
    )
    by_id = {fine.id: (fine, row) for fine, row in rows}
    ordered = [by_id[fine_id] for fine_id in wanted if fine_id in by_id]
    if not ordered:
        raise HTTPException(status_code=400, detail="No están esas multas")
    wb = Workbook()
    sheet = wb.active
    sheet.title = "Multas"
    headers = [
        "Patente",
        "Auto",
        "Persona",
        "Estado",
        "Pago voluntario",
        "Precio",
        "Día de infracción",
        "Emisión",
        "Vencimiento",
        "Ubicación",
        "Acta",
        "Infracción",
        "En Rosario",
        "Consultada",
        "Motivo del reclamo",
    ]
    header_fill = PatternFill("solid", fgColor="228BE6")
    header_font = Font(bold=True, color="FFFFFF")
    for col, header in enumerate(headers, start=1):
        cell = sheet.cell(1, col, header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
    for index, (fine, row) in enumerate(ordered, start=2):
        status = _fine_status(fine)
        values = [
            row.plate or "",
            row.name or "",
            fine.person or "",
            FINE_STATUS_LABELS.get(status, status),
            _voluntary_label(None if fine.voluntary is None else bool(fine.voluntary)),
            fine.amount if fine.amount is not None else "",
            _excel_day(fine.occurred_at, with_time=True),
            _excel_day(fine.issued_at),
            _excel_day(fine.due_at),
            fine.lugar_infraccion or "",
            fine.acta or "",
            fine.infraccion or "",
            fine.municipal_section or "",
            _excel_day(fine.consulted_at, with_time=True),
            fine.claim_reason or "",
        ]
        for col, value in enumerate(values, start=1):
            sheet.cell(index, col, value)
    widths = (12, 22, 18, 14, 16, 12, 20, 14, 14, 28, 16, 36, 16, 20, 36)
    for col, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(col)].width = width
    sheet.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{max(len(ordered) + 1, 1)}"
    sheet.freeze_panes = "A2"
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"multas_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _optional_day(value: Optional[str], label: str) -> Optional[date]:
    text = "" if value is None else str(value).strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"{label} es día/mes/año")


def _clock_hm(value: datetime) -> str:
    return value.strftime("%H:%M")


def _weekday_label(day: date) -> str:
    return f"{WEEKDAY_ES[day.weekday()]} {day.strftime('%d/%m/%Y')}"


def _use_covers_day(use: models.TransportUse, day: date) -> bool:
    if not use.left_at:
        return False
    start = use.left_at.date()
    end = use.returned_at.date() if use.returned_at else date.today()
    return start <= day <= end


def _hours_for_day(use: models.TransportUse, day: date) -> dict:
    left = use.left_at
    back = use.returned_at
    day_start = datetime.combine(day, time.min)
    day_end = datetime.combine(day, time(23, 59))
    start = left if left.date() == day else day_start
    if back is None:
        if day < date.today():
            end = day_end
            end_label = "23:59"
        elif day == date.today():
            end = datetime.now().replace(second=0, microsecond=0)
            end_label = "sigue afuera"
        else:
            end = day_end
            end_label = "23:59"
    elif back.date() == day:
        end = back
        end_label = _clock_hm(back)
    else:
        end = day_end
        end_label = "23:59"
    return {
        "use_id": use.id,
        "from": _clock_hm(start),
        "to": end_label,
        "label": f"{_clock_hm(start)} → {end_label}",
        "left_at": _iso(left),
        "returned_at": _iso(back),
    }


def _build_use_report(
    db: Session,
    persona: Optional[str] = None,
    transport_id: Optional[int] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
) -> dict:
    person = " ".join((persona or "").split())
    start_day = _optional_day(desde, "La fecha desde")
    end_day = _optional_day(hasta, "La fecha hasta")
    if start_day and end_day and end_day < start_day:
        raise HTTPException(status_code=400, detail="La fecha hasta no puede ser anterior a la desde")
    query = (
        db.query(models.TransportUse, models.Transport)
        .join(models.Transport, models.Transport.id == models.TransportUse.transport_id)
        .filter(models.Transport.kind == "auto")
    )
    if person:
        query = query.filter(models.TransportUse.person == person)
    if transport_id:
        query = query.filter(models.TransportUse.transport_id == transport_id)
    rows = query.order_by(
        models.TransportUse.person.asc(),
        models.Transport.name.asc(),
        models.TransportUse.left_at.asc(),
        models.TransportUse.id.asc(),
    ).all()
    if not rows:
        raise HTTPException(status_code=400, detail="No hay usos con ese filtro")
    today = date.today()
    if not start_day:
        start_day = min(use.left_at.date() for use, _row in rows if use.left_at)
    if not end_day:
        end_candidates = []
        for use, _row in rows:
            if use.returned_at:
                end_candidates.append(use.returned_at.date())
            else:
                end_candidates.append(today)
        end_day = max(end_candidates) if end_candidates else today
    if end_day > today:
        end_day = today
    holidays, holidays_incomplete = holidays_in_range(start_day, end_day)
    habiles = working_days(start_day, end_day, holidays)
    groups: dict[tuple[str, int], dict] = {}
    for use, row in rows:
        key = ((use.person or "").strip(), row.id)
        group = groups.get(key)
        if not group:
            group = {
                "person": (use.person or "").strip() or "Sin nombre",
                "transport_id": row.id,
                "plate": row.plate or "",
                "name": row.name or "",
                "uses": [],
            }
            groups[key] = group
        group["uses"].append(use)
    groups_out = []
    for group in groups.values():
        used_days = []
        unused_days = []
        calendar = []
        for day in habiles:
            slots = [_hours_for_day(use, day) for use in group["uses"] if _use_covers_day(use, day)]
            entry = {
                "date": day.isoformat(),
                "label": _weekday_label(day),
                "used": bool(slots),
                "hours": slots,
                "hours_label": " · ".join(slot["label"] for slot in slots) if slots else "",
            }
            calendar.append(entry)
            if slots:
                used_days.append(entry)
            else:
                unused_days.append(entry)
        groups_out.append(
            {
                "person": group["person"],
                "transport_id": group["transport_id"],
                "plate": group["plate"],
                "name": group["name"],
                "working_days": len(habiles),
                "days_with_car": len(used_days),
                "days_without_car": len(unused_days),
                "summary": (
                    f"De {len(habiles)} días hábiles, {len(used_days)} se llevó el auto"
                    f" y {len(unused_days)} no."
                ),
                "used_days": used_days,
                "unused_days": unused_days,
                "calendar": calendar,
                "trips": [
                    {
                        "id": use.id,
                        "left_at": _iso(use.left_at),
                        "returned_at": _iso(use.returned_at),
                        "label": (
                            f"{_weekday_label(use.left_at.date())} {_clock_hm(use.left_at)}"
                            f" → "
                            f"{('sigue afuera' if not use.returned_at else _weekday_label(use.returned_at.date()) + ' ' + _clock_hm(use.returned_at))}"
                        ),
                    }
                    for use in group["uses"]
                ],
            }
        )
    groups_out.sort(key=lambda item: (item["person"].lower(), item["plate"] or item["name"]))
    return {
        "from": start_day.isoformat(),
        "to": end_day.isoformat(),
        "from_display": start_day.strftime("%d/%m/%Y"),
        "to_display": end_day.strftime("%d/%m/%Y"),
        "working_days": len(habiles),
        "holidays": [day.isoformat() for day in sorted(holidays)],
        "holidays_incomplete": holidays_incomplete,
        "groups": groups_out,
    }


@router.get("/usos")
def list_uses_on_day(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    fecha: str = "",
    transport_id: Optional[int] = None,
):
    day = _day(fecha)
    start = datetime.combine(day, time.min)
    end = start + timedelta(days=1)
    query = (
        db.query(models.TransportUse, models.Transport)
        .join(models.Transport, models.Transport.id == models.TransportUse.transport_id)
        .filter(
            models.Transport.kind == "auto",
            models.TransportUse.left_at < end,
            or_(
                models.TransportUse.returned_at.is_(None),
                models.TransportUse.returned_at >= start,
            ),
        )
    )
    if transport_id:
        query = query.filter(models.TransportUse.transport_id == transport_id)
    rows = query.order_by(models.TransportUse.left_at.asc(), models.TransportUse.id.asc()).all()
    return [
        {
            "id": use.id,
            "transport_id": row.id,
            "plate": row.plate or "",
            "name": row.name,
            "person": use.person,
            "left_at": _iso(use.left_at),
            "returned_at": _iso(use.returned_at),
        }
        for use, row in rows
    ]


@router.get("/usos/informe")
def use_report(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    persona: str = "",
    transport_id: Optional[int] = None,
    desde: str = "",
    hasta: str = "",
):
    return _build_use_report(
        db,
        persona=persona,
        transport_id=transport_id,
        desde=desde,
        hasta=hasta,
    )


@router.post("/usos/informe/export")
def export_use_report(
    body: UseReportBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    report = _build_use_report(
        db,
        persona=body.persona,
        transport_id=body.transport_id,
        desde=body.desde,
        hasta=body.hasta,
    )
    wb = Workbook()
    summary = wb.active
    summary.title = "Resumen"
    calendar = wb.create_sheet("Calendario")
    trips = wb.create_sheet("Salidas")
    header_fill = PatternFill("solid", fgColor="228BE6")
    header_font = Font(bold=True, color="FFFFFF")

    def write_header(sheet, headers):
        for col, header in enumerate(headers, start=1):
            cell = sheet.cell(1, col, header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")

    write_header(
        summary,
        ["Persona", "Patente", "Auto", "Días hábiles", "Con auto", "Sin auto", "Resumen"],
    )
    for index, group in enumerate(report["groups"], start=2):
        values = [
            group["person"],
            group["plate"],
            group["name"],
            group["working_days"],
            group["days_with_car"],
            group["days_without_car"],
            group["summary"],
        ]
        for col, value in enumerate(values, start=1):
            summary.cell(index, col, value)
    for col, width in enumerate((18, 12, 22, 12, 12, 12, 48), start=1):
        summary.column_dimensions[get_column_letter(col)].width = width
    summary.freeze_panes = "A2"

    write_header(
        calendar,
        ["Persona", "Patente", "Auto", "Día", "Fecha", "Se lo llevó", "Horarios"],
    )
    row_index = 2
    for group in report["groups"]:
        for day in group["calendar"]:
            values = [
                group["person"],
                group["plate"],
                group["name"],
                day["label"],
                day["date"],
                "Sí" if day["used"] else "No",
                day["hours_label"],
            ]
            for col, value in enumerate(values, start=1):
                calendar.cell(row_index, col, value)
            row_index += 1
    for col, width in enumerate((18, 12, 22, 22, 12, 12, 36), start=1):
        calendar.column_dimensions[get_column_letter(col)].width = width
    calendar.freeze_panes = "A2"

    write_header(
        trips,
        ["Persona", "Patente", "Auto", "Salida", "Devolución", "Detalle"],
    )
    trip_index = 2
    for group in report["groups"]:
        for trip in group["trips"]:
            values = [
                group["person"],
                group["plate"],
                group["name"],
                trip["left_at"] or "",
                trip["returned_at"] or "sigue afuera",
                trip["label"],
            ]
            for col, value in enumerate(values, start=1):
                trips.cell(trip_index, col, value)
            trip_index += 1
    for col, width in enumerate((18, 12, 22, 20, 20, 40), start=1):
        trips.column_dimensions[get_column_letter(col)].width = width
    trips.freeze_panes = "A2"

    if report["holidays_incomplete"]:
        note = wb.create_sheet("Aviso")
        note["A1"] = "No se pudieron cargar todos los feriados. El informe cuenta lunes a viernes igual."

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    filename = f"informe_usos_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("")
def create_transporte(
    body: CreateBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    kind = (body.kind or "").strip()
    if kind not in ("auto", "carro"):
        raise HTTPException(status_code=400, detail="Tiene que ser un auto o un carro")
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    plate = None
    if kind == "auto":
        plate = _plate(body.plate or "")
        taken = db.query(models.Transport).filter(models.Transport.plate == plate).first()
        if taken:
            raise HTTPException(status_code=400, detail="Esa patente ya está")
    row = models.Transport(kind=kind, name=name, plate=plate)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _summary(row, None, {row.id: row.name})


@router.get("/{transport_id}")
def read_transporte(
    transport_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    row = _get(db, transport_id)
    names = _names(db)
    open_use = _open_for(db, row.id)
    uses = (
        db.query(models.TransportUse)
        .filter(
            or_(
                models.TransportUse.transport_id == row.id,
                models.TransportUse.cart_id == row.id,
                models.TransportUse.with_transport_id == row.id,
            )
        )
        .order_by(models.TransportUse.left_at.desc(), models.TransportUse.id.desc())
        .all()
    )
    fines = (
        db.query(models.TransportFine)
        .filter(models.TransportFine.transport_id == row.id)
        .order_by(models.TransportFine.occurred_at.desc(), models.TransportFine.id.desc())
        .all()
    )
    notes = (
        db.query(models.TransportNote)
        .filter(models.TransportNote.transport_id == row.id)
        .order_by(models.TransportNote.created_at.desc(), models.TransportNote.id.desc())
        .all()
    )
    places = (
        db.query(models.TransportServicePlace)
        .filter(models.TransportServicePlace.transport_id == row.id)
        .order_by(models.TransportServicePlace.name.asc())
        .all()
    )
    joined = _joined_cart(db, row.id) if row.kind == "auto" else None
    data = _summary(row, open_use, names, joined)
    data.update({
        "last_service_at": _iso(row.last_service_at),
        "last_service_km": row.last_service_km,
        "damage_note": row.damage_note or "",
        "uses": [_use_row(use, names) for use in uses],
        "fines": [_fine_out(fine, row) for fine in fines],
        "notes": [
            {
                "id": note.id,
                "description": note.description,
                "observed_by": note.observed_by or "",
                "created_at": _iso(note.created_at),
            }
            for note in notes
        ],
        "service_places": [_place_row(place) for place in places],
    })
    return data


@router.put("/{transport_id}")
def update_transporte(
    transport_id: int,
    body: ProfileBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    row.name = name
    if row.kind == "auto":
        plate = _plate(body.plate or row.plate or "")
        taken = (
            db.query(models.Transport)
            .filter(models.Transport.plate == plate, models.Transport.id != row.id)
            .first()
        )
        if taken:
            raise HTTPException(status_code=400, detail="Esa patente ya está")
        row.plate = plate
        row.last_service_at = _moment(body.last_service_at) if (body.last_service_at or "").strip() else None
        row.last_service_km = _km(body.last_service_km)
        row.next_service_km = _km(body.next_service_km)
        row.is_broken = bool(body.is_broken)
        row.damage_note = (body.damage_note or "").strip() or None
        row.in_repair = bool(body.in_repair)
    db.commit()
    return {"ok": True}


@router.post("/{transport_id}/salida")
def leave_transporte(
    transport_id: int,
    body: LeaveBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    row = _get(db, transport_id)
    if _open_for(db, row.id):
        raise HTTPException(status_code=400, detail="Ya está afuera")
    person = (body.person or "").strip()
    obra_name = (body.obra or "").strip()
    external_text = (body.external_vehicle or "").strip()
    obra_only = row.kind == "carro" and bool(obra_name) and not body.with_transport_id and not external_text
    if obra_only:
        obra_name = require_active_obra(db, obra_name)
    elif not person:
        raise HTTPException(status_code=400, detail="Indicá quién lo lleva")
    left_at = _moment(body.left_at)
    km = _km(body.km)
    cart_id = None
    external = None
    with_transport_id = None
    if row.kind == "auto":
        if obra_name:
            raise HTTPException(status_code=400, detail="La obra sola es para un carro")
        if body.cart_id:
            cart = _get(db, body.cart_id)
            if cart.kind != "carro":
                raise HTTPException(status_code=400, detail="Eso no es un carro")
            if _open_for(db, cart.id):
                raise HTTPException(status_code=400, detail="Ese carro ya está afuera")
            cart_id = cart.id
    elif body.with_transport_id:
        auto = _get(db, body.with_transport_id)
        if auto.kind != "auto":
            raise HTTPException(status_code=400, detail="Elegí un auto")
        auto_use = _open_for(db, auto.id)
        if not auto_use or auto_use.transport_id != auto.id:
            raise HTTPException(status_code=400, detail=f"{auto.plate or auto.name} no está afuera")
        if auto_use.cart_id or _joined_cart(db, auto.id):
            raise HTTPException(status_code=400, detail=f"{auto.plate or auto.name} ya lleva un carro")
        if left_at < auto_use.left_at:
            raise HTTPException(status_code=400, detail="El carro no puede salir antes que el auto")
        with_transport_id = auto.id
        km = None
        obra_name = ""
    elif obra_only:
        km = None
    else:
        external = external_text
        if not external:
            raise HTTPException(status_code=400, detail="Indicá con qué auto de afuera sale")
        obra_name = ""
    use = models.TransportUse(
        transport_id=row.id,
        cart_id=cart_id,
        person=person,
        left_at=left_at,
        km=km,
        external_vehicle=external,
        with_transport_id=with_transport_id,
        obra=obra_name or None,
    )
    db.add(use)
    _apply_km(row, km)
    db.commit()
    return {"ok": True}


@router.post("/{transport_id}/devolucion")
def return_transporte(
    transport_id: int,
    body: ReturnBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    row = _get(db, transport_id)
    use = _open_for(db, row.id)
    if not use:
        raise HTTPException(status_code=400, detail="Está en depósito")
    returned_at = _moment(body.returned_at)
    if returned_at < use.left_at:
        raise HTTPException(status_code=400, detail="La devolución no puede ser anterior a la salida")
    km = _km(body.km)
    joined = None
    if row.kind == "auto" and use.transport_id == row.id and body.cart_too:
        joined = _joined_cart(db, row.id)
        if joined and returned_at < joined.left_at:
            raise HTTPException(status_code=400, detail="El carro no puede volver antes de haber salido")
    use.returned_at = returned_at
    if joined:
        joined.returned_at = returned_at
    if km is not None:
        use.km = km
        owner = row if use.transport_id == row.id else _get(db, use.transport_id)
        _apply_km(owner, km)
    db.commit()
    return {"ok": True, "cart_returned": bool(joined)}


@router.post("/{transport_id}/pase")
def hand_over_transporte(
    transport_id: int,
    body: HandoverBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    row = _get(db, transport_id)
    use = _open_for(db, row.id)
    if not use:
        raise HTTPException(status_code=400, detail="Está en depósito")
    if use.transport_id != row.id or use.with_transport_id:
        auto = _get(db, use.with_transport_id or use.transport_id)
        raise HTTPException(status_code=400, detail=f"Va con {auto.plate or auto.name}. Pasá el auto")
    person = (body.person or "").strip()
    if not person:
        raise HTTPException(status_code=400, detail="Indicá quién lo agarra")
    if person.casefold() == (use.person or "").strip().casefold():
        raise HTTPException(status_code=400, detail=f"Ya lo tiene {use.person}")
    at = _moment(body.at)
    if at < use.left_at:
        raise HTTPException(status_code=400, detail="El pase no puede ser antes de que saliera")
    km = _km(body.km)
    joined = _joined_cart(db, row.id) if row.kind == "auto" else None
    if joined and at < joined.left_at:
        raise HTTPException(status_code=400, detail="El carro salió después de esa hora")

    use.returned_at = at
    if km is not None:
        use.km = km
    db.add(models.TransportUse(
        transport_id=row.id,
        cart_id=use.cart_id if body.cart_too else None,
        person=person,
        left_at=at,
        km=km,
        external_vehicle=use.external_vehicle,
        obra=use.obra,
    ))
    if joined:
        joined.returned_at = at
        if body.cart_too:
            db.add(models.TransportUse(
                transport_id=joined.transport_id,
                person=person,
                left_at=at,
                with_transport_id=row.id,
            ))
    _apply_km(row, km)
    db.commit()
    return {"ok": True, "cart_passed": bool(use.cart_id or joined) and body.cart_too}


@router.post("/{transport_id}/uso-pasado")
def add_past_use(
    transport_id: int,
    body: PastUseBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    person = (body.person or "").strip()
    if not person:
        raise HTTPException(status_code=400, detail="Indicá quién lo tuvo")
    left_at = _moment(body.left_at)
    returned_at = _moment(body.returned_at)
    if returned_at <= left_at:
        raise HTTPException(status_code=400, detail="La vuelta tiene que ser después de la salida")
    if returned_at > datetime.now():
        raise HTTPException(
            status_code=400,
            detail="La vuelta no puede ser en el futuro. Si todavía lo tiene, usá Salir",
        )
    clash = _busy(db, row.id, left_at, returned_at)
    if clash:
        raise HTTPException(status_code=400, detail=_busy_detail(clash, row.plate or row.name))
    km = _km(body.km)
    cart_id = None
    external = None
    with_transport_id = None
    if row.kind == "auto":
        if body.cart_id:
            cart = _get(db, body.cart_id)
            if cart.kind != "carro":
                raise HTTPException(status_code=400, detail="Eso no es un carro")
            clash = _busy(db, cart.id, left_at, returned_at)
            if clash:
                raise HTTPException(status_code=400, detail=_busy_detail(clash, f"el carro {cart.name}"))
            cart_id = cart.id
    else:
        km = None
        if body.with_transport_id:
            auto = _get(db, body.with_transport_id)
            if auto.kind != "auto":
                raise HTTPException(status_code=400, detail="Elegí un auto")
            with_transport_id = auto.id
        else:
            external = (body.external_vehicle or "").strip()
            if not external:
                raise HTTPException(status_code=400, detail="Indicá con qué auto de afuera salió")
    db.add(models.TransportUse(
        transport_id=row.id,
        cart_id=cart_id,
        person=person,
        left_at=left_at,
        returned_at=returned_at,
        km=km,
        external_vehicle=external,
        with_transport_id=with_transport_id,
    ))
    if km is not None and (row.current_km is None or km > row.current_km):
        row.current_km = km
    db.commit()
    return {"ok": True}


@router.put("/{transport_id}/km")
def update_km(
    transport_id: int,
    body: KmBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    row = _get(db, transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="El carro no lleva kilómetros")
    km = _km(body.km)
    if row.current_km is not None and km < row.current_km and not has_admin_access(current_user):
        raise HTTPException(
            status_code=400,
            detail=f"Tiene {row.current_km} km. No puede tener menos. Si está mal, que lo corrija un admin",
        )
    row.current_km = km
    db.commit()
    return {"ok": True, "current_km": row.current_km}


@router.post("/{transport_id}/lugares")
def add_service_place(
    transport_id: int,
    body: ServicePlaceBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="El carro no lleva service")
    place = models.TransportServicePlace(transport_id=row.id)
    _apply_place(place, body)
    db.add(place)
    db.commit()
    db.refresh(place)
    return _place_row(place)


def _get_place(db: Session, place_id: int) -> models.TransportServicePlace:
    place = (
        db.query(models.TransportServicePlace)
        .filter(models.TransportServicePlace.id == place_id)
        .first()
    )
    if not place:
        raise HTTPException(status_code=404, detail="No está ese lugar")
    return place


@router.put("/lugares/{place_id}")
def update_service_place(
    place_id: int,
    body: ServicePlaceBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    place = _get_place(db, place_id)
    _apply_place(place, body)
    db.commit()
    return _place_row(place)


@router.delete("/lugares/{place_id}")
def delete_service_place(
    place_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    place = _get_place(db, place_id)
    db.delete(place)
    db.commit()
    return {"ok": True}


@router.post("/{transport_id}/notas")
def add_note(
    transport_id: int,
    body: NoteBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="El carro no lleva notas de ficha")
    description = (body.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="Escribí la nota")
    author = (body.observed_by or "").strip()
    if not author:
        try:
            author = get_user_name_by_id(db, current_user.get("user_id"))
        except HTTPException:
            author = current_user.get("username") or ""
    note = models.TransportNote(
        transport_id=row.id,
        description=description,
        observed_by=author,
        created_at=datetime.now(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "description": note.description,
        "observed_by": note.observed_by or "",
        "created_at": _iso(note.created_at),
    }


def _uses_at(db: Session, transport_id: int, moment: datetime):
    return (
        db.query(models.TransportUse)
        .filter(
            models.TransportUse.transport_id == transport_id,
            models.TransportUse.left_at <= moment,
            or_(
                models.TransportUse.returned_at.is_(None),
                models.TransportUse.returned_at >= moment,
            ),
        )
        .order_by(models.TransportUse.left_at.desc())
        .all()
    )


@router.post("/{transport_id}/multas/buscar")
def lookup_fine(
    transport_id: int,
    body: FineLookupBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="La multa es de un auto")
    moment = _moment(body.occurred_at)
    matches = _uses_at(db, row.id, moment)
    return {
        "matches": [
            {
                "id": use.id,
                "person": use.person,
                "left_at": _iso(use.left_at),
                "returned_at": _iso(use.returned_at),
            }
            for use in matches
        ]
    }


@router.post("/{transport_id}/multas")
def create_fine(
    transport_id: int,
    body: FineBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    row = _get(db, transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="La multa es de un auto")
    moment = _moment(body.occurred_at)
    person = (body.person or "").strip()
    use_id = None
    if body.use_id:
        use = (
            db.query(models.TransportUse)
            .filter(models.TransportUse.id == body.use_id, models.TransportUse.transport_id == row.id)
            .first()
        )
        if not use or use.left_at > moment or (use.returned_at and use.returned_at < moment):
            raise HTTPException(status_code=400, detail="Ese uso no cubre esa fecha")
        person = use.person
        use_id = use.id
    fine = models.TransportFine(
        transport_id=row.id,
        occurred_at=moment,
        person=person or "",
        paid=False,
        status="a_pagar",
        use_id=use_id,
    )
    db.add(fine)
    db.commit()
    db.refresh(fine)
    return {"ok": True, "id": fine.id}


@router.post("/multas/{fine_id}/pagar")
def pay_fine(
    fine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    fine = _get_fine(db, fine_id)
    _set_fine_status(fine, "pagada")
    db.commit()
    return {"ok": True}


@router.put("/multas/{fine_id}")
def update_fine(
    fine_id: int,
    body: FineUpdateBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    fine = _get_fine(db, fine_id)
    if body.status is not None:
        _set_fine_status(fine, body.status)
    if body.person is not None:
        fine.person = (body.person or "").strip()
    if "amount" in body.model_fields_set:
        if body.amount is not None and body.amount < 0:
            raise HTTPException(status_code=400, detail="El importe no puede ser negativo")
        fine.amount = body.amount
    if "voluntary" in body.model_fields_set:
        fine.voluntary = body.voluntary
    if body.acta is not None:
        fine.acta = (body.acta or "").strip() or None
    if body.infraccion is not None:
        fine.infraccion = (body.infraccion or "").strip() or None
    if body.lugar_infraccion is not None:
        fine.lugar_infraccion = (body.lugar_infraccion or "").strip() or None
    if body.municipal_section is not None:
        fine.municipal_section = (body.municipal_section or "").strip() or None
    if "issued_at" in body.model_fields_set:
        fine.issued_at = _optional_moment(body.issued_at, "La emisión")
    if "due_at" in body.model_fields_set:
        fine.due_at = _optional_moment(body.due_at, "El vencimiento")
    if "claim_reason" in body.model_fields_set:
        fine.claim_reason = (body.claim_reason or "").strip() or None
    if _fine_status(fine) == "a_reclamar" and not (fine.claim_reason or "").strip():
        raise HTTPException(status_code=400, detail="Indicá el motivo del reclamo")
    db.commit()
    db.refresh(fine)
    row = _get(db, fine.transport_id)
    return _fine_out(fine, row)


@router.put("/multas/{fine_id}/persona")
def set_fine_person(
    fine_id: int,
    body: FinePersonBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    fine = _get_fine(db, fine_id)
    person = (body.person or "").strip()
    if not person:
        raise HTTPException(status_code=400, detail="Escribí quién la hizo")
    fine.person = person
    db.commit()
    return {"ok": True}


@router.post("/multas/{fine_id}/rosario")
def consult_rosario(
    fine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    body: Optional[RosarioBody] = None,
):
    _admin(current_user)
    fine = _get_fine(db, fine_id)
    row = _get(db, fine.transport_id)
    if row.kind != "auto":
        raise HTTPException(status_code=400, detail="La multa es de un auto")
    plate = (row.plate or "").strip()
    if not plate:
        raise HTTPException(status_code=400, detail="Ese auto no tiene patente")
    payload = body or RosarioBody()
    if payload.apply:
        _apply_rosario_hit(fine, payload.model_dump())
        db.commit()
        db.refresh(fine)
        return {"matched": True, "fine": _fine_out(fine, row), "candidates": []}
    try:
        hits = fetch_hits(plate)
    except RosarioError as exc:
        raise HTTPException(status_code=502, detail=exc.message) from exc
    matched, candidates = match_hits(hits, fine.occurred_at)
    if matched:
        _apply_rosario_hit(fine, matched)
        db.commit()
        db.refresh(fine)
        return {"matched": True, "fine": _fine_out(fine, row), "candidates": []}
    return {
        "matched": False,
        "fine": _fine_out(fine, row),
        "candidates": candidates or hits,
    }


@router.post("/multas/{fine_id}/image")
async def upload_fine_image(
    fine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    _admin(current_user)
    fine = _get_fine(db, fine_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="El archivo no puede superar los 8 MB")
    delete_stored_image(fine)
    fine.image_filename = _save_fine_file(fine.id, data, file.filename, file.content_type)
    db.commit()
    kind = _fine_file_kind(fine.image_filename)
    return {
        "ok": True,
        "has_file": True,
        "has_image": kind == "image",
        "file_kind": kind,
        "image_filename": fine.image_filename,
    }


@router.get("/multas/{fine_id}/image")
def get_fine_image(fine_id: int, db: Annotated[Session, Depends(get_db)]):
    fine = _get_fine(db, fine_id)
    if not fine.image_filename:
        raise HTTPException(status_code=404, detail="No tiene archivo")
    path = stored_image_path(fine.image_filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No se encontró el archivo")
    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.post("/{transport_id}/image")
async def upload_image(
    transport_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    file: UploadFile = File(...),
):
    _admin(current_user)
    row = _get(db, transport_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo está vacío")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no puede superar los 8 MB")
    img = _load_image(data)
    delete_stored_image(row)
    row.image_filename = _save_processed(f"auto{transport_id}", img)
    db.commit()
    return {"ok": True, "has_image": True, "image_filename": row.image_filename}


@router.get("/{transport_id}/image")
def get_image(transport_id: int, db: Annotated[Session, Depends(get_db)]):
    row = _get(db, transport_id)
    if not row.image_filename:
        raise HTTPException(status_code=404, detail="No tiene foto")
    path = stored_image_path(row.image_filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No se encontró el archivo de imagen")
    media_type = MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)
