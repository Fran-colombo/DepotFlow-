from datetime import datetime
from io import BytesIO

import pytz
import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

import models
from auth import get_current_user
from database import get_db
from unit_service import REPAIR_PLACE, STATUS_RETIRADA

router = APIRouter(tags=["existencias"])
TIMEZONE = pytz.timezone("America/Argentina/Buenos_Aires")
LOGO_URL = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSaURTEFHsQ9YD0w_LhYjgHna9Hg-myPBBH3w&s"


def _clean_name(name: str) -> str:
    raw = name or ""
    marker = "__DELETED_"
    if marker in raw:
        return raw.split(marker, 1)[0]
    return raw


def _person(history: models.History) -> str:
    return (history.personWhoTook or history.userName or "").strip()


def _bucket():
    return {}


def _add(rows, key, code, description, quantity, person="", zone="", item_id=None, zone_id=None, shed_id=None):
    amount = int(quantity or 0)
    if amount <= 0:
        return
    row = rows.get(key)
    if row is None:
        row = {
            "code": code or "",
            "description": description or "",
            "quantity": 0,
            "people": [],
            "zone": zone or "",
            "itemId": item_id,
            "zoneId": zone_id,
            "shedId": shed_id,
        }
        rows[key] = row
    row["quantity"] += amount
    text = (person or "").strip()
    if text and text not in row["people"]:
        row["people"].append(text)
    if zone and not row["zone"]:
        row["zone"] = zone


def _sorted_rows(rows):
    values = list(rows.values())
    for row in values:
        row["people"] = " · ".join(row["people"])
    values.sort(key=lambda row: (row["code"].lower(), row["description"].lower()))
    return values


def _item_label(item: models.Item) -> str:
    if item is None:
        return ""
    return _clean_name(item.name) or (item.description or "")


def _unit_label(unit: models.ItemUnit, item: models.Item) -> str:
    if unit is not None and (unit.name or "").strip():
        return unit.name.strip()
    return _item_label(item)


def stock_at_obra(db: Session, obra: models.Obra):
    place = (obra.name or "").strip()
    if not place or place == REPAIR_PLACE:
        return []
    histories = (
        db.query(models.History)
        .filter(
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
            models.History.place == place,
        )
        .all()
    )
    rows = _bucket()
    for history in histories:
        remaining = int(history.amountNotReturned or 0)
        if remaining <= 0:
            continue
        item = db.query(models.Item).filter(models.Item.id == history.itemId).first()
        if item is not None and item.status == 0:
            continue
        links = (
            db.query(models.HistoryUnit, models.ItemUnit)
            .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
            .filter(models.HistoryUnit.history_id == history.id)
            .all()
        )
        person = _person(history)
        label = _item_label(item)
        if not links or (item is not None and item.inner_quantity) or len(links) == 1:
            if links:
                _link, unit = links[0]
                _add(
                    rows,
                    ("unit", unit.id),
                    unit.code,
                    _unit_label(unit, item),
                    remaining,
                    person,
                    item_id=item.id if item is not None else history.itemId,
                )
            else:
                _add(rows, ("item", history.itemId), "", label, remaining, person, item_id=history.itemId)
            continue
        still_out = [unit for _link, unit in links if unit.status == STATUS_RETIRADA]
        if not still_out:
            _add(rows, ("item", history.itemId), "", label, remaining, person, item_id=history.itemId)
            continue
        chosen = still_out
        if len(still_out) > remaining:
            chosen = sorted(still_out, key=lambda unit: unit.code or "")[:remaining]
        for unit in chosen:
            _add(
                rows,
                ("unit", unit.id),
                unit.code,
                _unit_label(unit, item),
                1,
                person,
                item_id=item.id if item is not None else history.itemId,
            )
        if remaining > len(chosen):
            _add(rows, ("item", history.itemId), "", label, remaining - len(chosen), person, item_id=history.itemId)
    return _sorted_rows(rows)


def stock_at_deposito(db: Session, shed: models.Shed):
    rows = _bucket()
    units = (
        db.query(models.ItemUnit, models.Item, models.Zone)
        .join(models.Item, models.Item.id == models.ItemUnit.item_id)
        .outerjoin(models.Zone, models.Zone.id == models.Item.zone_id)
        .filter(
            models.Item.shed_id == shed.id,
            models.Item.status == 1,
            models.ItemUnit.status == "en_stock",
        )
        .all()
    )
    for unit, item, zone in units:
        if item.inner_quantity:
            amount = int(unit.quantity or 0)
            if amount <= 0:
                continue
        else:
            amount = 1
        zone_name = zone.name if zone is not None else ""
        _add(
            rows,
            ("unit", unit.id),
            unit.code,
            _unit_label(unit, item),
            amount,
            zone=zone_name,
            item_id=item.id,
            zone_id=zone.id if zone is not None else item.zone_id,
            shed_id=shed.id,
        )
    bulk = (
        db.query(models.Item, models.Zone)
        .outerjoin(models.Zone, models.Zone.id == models.Item.zone_id)
        .filter(
            models.Item.shed_id == shed.id,
            models.Item.status == 1,
            models.Item.track_units == False,
            models.Item.actualAmount > 0,
        )
        .all()
    )
    for item, zone in bulk:
        _add(
            rows,
            ("item", item.id),
            "",
            _item_label(item),
            int(item.actualAmount or 0),
            zone=zone.name if zone is not None else "",
            item_id=item.id,
            zone_id=zone.id if zone is not None else item.zone_id,
            shed_id=shed.id,
        )
    return _sorted_rows(rows)


def resolve_place(db: Session, kind: str, place_id: int):
    if kind == "obra":
        obra = db.query(models.Obra).filter(models.Obra.id == place_id).first()
        if not obra:
            raise HTTPException(status_code=404, detail="Obra no encontrada")
        return obra.name, stock_at_obra(db, obra)
    if kind == "deposito":
        shed = db.query(models.Shed).filter(models.Shed.id == place_id).first()
        if not shed:
            raise HTTPException(status_code=404, detail="Depósito no encontrado")
        return shed.name, stock_at_deposito(db, shed)
    raise HTTPException(status_code=400, detail="Elegí una obra o un depósito")


def _payload(kind: str, place: str, rows):
    return {
        "kind": kind,
        "place": place,
        "rows": [
            {
                "code": row["code"],
                "description": row["description"],
                "quantity": row["quantity"],
                "people": row["people"],
                "zone": row["zone"],
                "itemId": row["itemId"],
                "zoneId": row["zoneId"],
                "shedId": row["shedId"],
            }
            for row in rows
        ],
    }


@router.get("/existencias/lugares")
def list_lugares(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    obras = db.query(models.Obra).order_by(models.Obra.name.asc()).all()
    sheds = db.query(models.Shed).order_by(models.Shed.name.asc()).all()
    return {
        "obras": [{"id": obra.id, "name": obra.name} for obra in obras],
        "depositos": [{"id": shed.id, "name": shed.name} for shed in sheds],
    }


@router.get("/existencias")
def list_existencias(
    kind: str = Query(...),
    id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    place, rows = resolve_place(db, kind, id)
    return _payload(kind, place, rows)


def _load_logo():
    try:
        response = requests.get(LOGO_URL, timeout=8)
        response.raise_for_status()
        return Image.open(BytesIO(response.content))
    except Exception:
        return None


def build_existencias_pdf(kind: str, place: str, rows) -> BytesIO:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    logo = _load_logo()
    when = datetime.now(TIMEZONE).strftime("%d/%m/%Y")
    place_label = "Obra" if kind == "obra" else "Depósito"

    def clip(text, font, size, max_width):
        raw = str(text or "")
        if pdf.stringWidth(raw, font, size) <= max_width:
            return raw
        trimmed = raw
        while trimmed and pdf.stringWidth(trimmed + "…", font, size) > max_width:
            trimmed = trimmed[:-1]
        return (trimmed + "…") if trimmed else ""

    left = 1.6 * cm
    right = width - 1.6 * cm
    table_w = right - left
    head_h = 0.75 * cm
    row_h = 0.75 * cm
    if kind == "obra":
        columns = [1.4 * cm, 3.4 * cm, table_w - 11.6 * cm, 2.2 * cm, 4.6 * cm]
        headers = ["", "Código", "Descripción", "Cantidad", "Quién lo tiene"]
    else:
        columns = [1.4 * cm, 3.4 * cm, table_w - 10.4 * cm, 2.2 * cm, 3.4 * cm]
        headers = ["", "Código", "Descripción", "Cantidad", "Zona"]

    def header_block():
        y = height - 1.6 * cm
        if logo:
            pdf.drawInlineImage(
                logo,
                right - 2.4 * cm,
                height - 2.6 * cm,
                width=2.2 * cm,
                height=1.6 * cm,
                preserveAspectRatio=True,
                anchor="c",
            )
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(left, y, "EXISTENCIAS")
        y -= 0.9 * cm
        pdf.setFont("Helvetica", 10)
        pdf.drawString(left, y, f"Fecha: {when}")
        y -= 0.55 * cm
        pdf.drawString(left, y, f"{place_label}: {place}")
        y -= 0.8 * cm
        return y

    def draw_box(x, top):
        box = 0.34 * cm
        pdf.setStrokeColorRGB(0.2, 0.2, 0.2)
        pdf.setLineWidth(0.6)
        pdf.rect(
            x + (columns[0] - box) / 2,
            top - row_h + (row_h - box) / 2,
            box,
            box,
            fill=0,
            stroke=1,
        )

    def draw_header_row(y):
        pdf.setFillColorRGB(0.93, 0.94, 0.95)
        pdf.rect(left, y - head_h, table_w, head_h, fill=1, stroke=0)
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica-Bold", 8)
        x = left
        for index, title in enumerate(headers):
            if title:
                pdf.drawString(
                    x + 0.12 * cm,
                    y - 0.48 * cm,
                    clip(title, "Helvetica-Bold", 8, columns[index] - 0.24 * cm),
                )
            x += columns[index]
        pdf.setStrokeColorRGB(0.75, 0.75, 0.75)
        pdf.setLineWidth(0.4)
        pdf.rect(left, y - head_h, table_w, head_h, fill=0, stroke=1)
        return y - head_h

    y = header_block()
    y = draw_header_row(y)
    for row in rows:
        if y - row_h < 2.2 * cm:
            pdf.showPage()
            y = header_block()
            y = draw_header_row(y)
        extra = row["people"] if kind == "obra" else row["zone"]
        values = [
            row["code"],
            row["description"],
            str(row["quantity"]),
            extra or "",
        ]
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica", 9)
        x = left + columns[0]
        for col, value in enumerate(values, start=1):
            pdf.drawString(
                x + 0.12 * cm,
                y - 0.48 * cm,
                clip(value, "Helvetica", 9, columns[col] - 0.24 * cm),
            )
            x += columns[col]
        draw_box(left, y)
        pdf.setStrokeColorRGB(0.75, 0.75, 0.75)
        pdf.setLineWidth(0.4)
        pdf.rect(left, y - row_h, table_w, row_h, fill=0, stroke=1)
        y -= row_h
    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer


@router.get("/existencias/pdf")
def existencias_pdf(
    kind: str = Query(...),
    id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    place, rows = resolve_place(db, kind, id)
    buffer = build_existencias_pdf(kind, place, rows)
    filename = "existencias.pdf"
    return StreamingResponse(
        content=buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )
