from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from auth import get_current_user, require_admin
from database import get_db
from notifications import (
    REPORT_KINDS,
    dump_item_ids,
    dump_kinds,
    parse_item_ids,
    parse_kinds,
    seed_default_report,
    send_report,
)

router = APIRouter(prefix="/admin", tags=["reports"])
db_dependency = Annotated[Session, Depends(get_db)]


class ReportWriteDTO(BaseModel):
    name: str = Field(..., min_length=1)
    enabled: bool = True
    frequency: str = "monthly"
    combine: bool = True
    item_ids: list[int] = []
    kind: list[str] = ["pending"]


def _normalize_frequency(value: str) -> str:
    frequency = (value or "monthly").strip().lower()
    if frequency not in ("weekly", "monthly"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La frecuencia tiene que ser weekly o monthly",
        )
    return frequency


def _normalize_kinds(values) -> str:
    kinds = parse_kinds(values if isinstance(values, str) else dump_kinds(values))
    if not kinds or any(kind not in REPORT_KINDS for kind in kinds):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Elegí pendientes, rotos y/o sin stock",
        )
    return dump_kinds(kinds)


def _serialize(report: models.EmailReport) -> dict:
    last_sent = report.last_sent
    return {
        "id": report.id,
        "name": report.name,
        "enabled": bool(report.enabled),
        "frequency": report.frequency,
        "combine": bool(report.combine),
        "item_ids": parse_item_ids(report.item_ids),
        "kind": parse_kinds(report.kind),
        "last_sent": last_sent.isoformat() if last_sent else None,
    }


@router.get("/reports")
def list_reports(
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    seed_default_report(db)
    rows = db.query(models.EmailReport).order_by(models.EmailReport.id.asc()).all()
    return {"data": [_serialize(row) for row in rows]}


@router.get("/reports/subcategories")
def list_report_subcategories(
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    rows = (
        db.query(models.Item)
        .filter(models.Item.status == 1)
        .order_by(models.Item.category.asc(), models.Item.name.asc())
        .all()
    )
    return {
        "data": [
            {"id": item.id, "name": item.name, "category": item.category or ""}
            for item in rows
        ]
    }


@router.post("/reports")
def create_report(
    dto: ReportWriteDTO,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    report = models.EmailReport(
        name=dto.name.strip(),
        enabled=bool(dto.enabled),
        frequency=_normalize_frequency(dto.frequency),
        combine=bool(dto.combine),
        item_ids=dump_item_ids(dto.item_ids),
        kind=_normalize_kinds(dto.kind),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _serialize(report)


@router.put("/reports/{report_id}")
def update_report(
    report_id: int,
    dto: ReportWriteDTO,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    report = db.query(models.EmailReport).filter(models.EmailReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No está ese reporte")
    report.name = dto.name.strip()
    report.enabled = bool(dto.enabled)
    report.frequency = _normalize_frequency(dto.frequency)
    report.combine = bool(dto.combine)
    report.item_ids = dump_item_ids(dto.item_ids)
    report.kind = _normalize_kinds(dto.kind)
    db.commit()
    db.refresh(report)
    return _serialize(report)


@router.delete("/reports/{report_id}")
def delete_report(
    report_id: int,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    report = db.query(models.EmailReport).filter(models.EmailReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No está ese reporte")
    db.delete(report)
    db.commit()
    return {"ok": True}


@router.post("/reports/{report_id}/send")
def send_report_now(
    report_id: int,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    require_admin(current_user)
    report = db.query(models.EmailReport).filter(models.EmailReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No está ese reporte")
    try:
        result = send_report(db, report, force=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc) or "No se pudo enviar") from exc
    if result.get("reason") == "email":
        raise HTTPException(
            status_code=400,
            detail="Falta configurar el mail (EMAIL_ADDRESS / EMAIL_PASSWORD / ADMIN_EMAIL)",
        )
    db.refresh(report)
    return {"report": _serialize(report), **result}
