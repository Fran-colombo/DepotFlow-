import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Integer, String, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from auth import bcrypt_context, get_current_user
from database import get_db

router = APIRouter(prefix="/admin/sysadmin", tags=["sysadmin"])

HIDDEN = {
    "users": {"password", "telegram_link_token", "telegram_link_expires"},
}

TABLES = (
    ("items", "Subcategorías", models.Item),
    ("units", "Códigos", models.ItemUnit),
    ("history", "Historial", models.History),
    ("history_units", "Vínculo historial-código", models.HistoryUnit),
    ("observations", "Observaciones", models.Observation),
    ("movements", "Movimientos", models.Movement),
    ("sheds", "Depósitos", models.Shed),
    ("zones", "Zonas", models.Zone),
    ("obras", "Obras", models.Obra),
    ("categories", "Categorías", models.Category),
    ("users", "Usuarios", models.User),
    ("deleted_items", "Eliminados", models.DeletedItem),
)

COLUMN_LABELS = {
    "id": "Id",
    "name": "Nombre",
    "surname": "Apellido",
    "email": "Email",
    "role": "Rol",
    "status": "Estado",
    "phone": "Teléfono",
    "telegram_id": "Telegram",
    "description": "Descripción",
    "category": "Categoría",
    "totalAmount": "Cantidad total",
    "actualAmount": "Cantidad en depósito",
    "is_available": "Disponible",
    "shed_id": "Depósito",
    "zone_id": "Zona",
    "image_filename": "Archivo de foto",
    "track_units": "Código por pieza",
    "inner_quantity": "Cantidad dentro del código",
    "code_prefix": "Prefijo",
    "code": "Código",
    "quantity": "Cantidad",
    "created_at": "Creado",
    "consumed_at": "Consumido",
    "is_broken": "Rota",
    "damage_note": "Qué le pasó",
    "repair_note": "Qué habría que hacer",
    "item_id": "Subcategoría",
    "itemId": "Subcategoría",
    "user_id": "Usuario",
    "userId": "Usuario",
    "user_name": "Nombre de usuario",
    "userName": "Nombre de usuario",
    "personWhoTook": "Persona",
    "action": "Acción",
    "amountRetired": "Cantidad",
    "amountNotReturned": "Pendiente de volver",
    "date": "Fecha",
    "place": "Lugar",
    "turnback": "Ya volvió",
    "turnbackDate": "Fecha de devolución",
    "lastNotification": "Último aviso",
    "hideFromHistorial": "Oculto del historial",
    "history_id": "Historial",
    "unit_id": "Código",
    "observed_by": "Observado por",
    "item_name": "Nombre",
    "from_shed_id": "Depósito origen",
    "to_shed_id": "Depósito destino",
    "from_zone_id": "Zona origen",
    "to_zone_id": "Zona destino",
    "username": "Usuario",
    "active": "Activa",
    "stage": "Estado de obra",
    "label": "Etiqueta",
    "sort_order": "Orden",
    "is_consumable": "No vuelve",
    "seed_key": "Clave interna",
    "deletion_reason": "Motivo",
    "deleted_at": "Borrado",
}

SUMMARY_KEYS = (
    "name",
    "code",
    "email",
    "label",
    "place",
    "item_name",
    "username",
    "description",
)


def _require_admin(current_user: dict) -> None:
    if not current_user or current_user.get("role") != "sysadmin":
        raise HTTPException(status_code=403, detail="Solo sysadmin puede usar este panel")


def _table(key: str):
    for table_key, label, model in TABLES:
        if table_key == key:
            return label, model
    raise HTTPException(status_code=404, detail="Esa tabla no existe")


def _columns(key: str, model):
    hidden = HIDDEN.get(key, set())
    described = []
    for column in model.__table__.columns:
        if column.name in hidden or column.name == "id":
            continue
        kind = "string"
        options = None
        if isinstance(column.type, Boolean):
            kind = "boolean"
        elif isinstance(column.type, Integer):
            kind = "integer"
        elif isinstance(column.type, DateTime):
            kind = "datetime"
        elif isinstance(column.type, SqlEnum):
            kind = "enum"
            options = list(column.type.enums)
        described.append({
            "name": column.name,
            "label": COLUMN_LABELS.get(column.name, column.name),
            "type": kind,
            "nullable": bool(column.nullable),
            "options": options,
        })
    return described


def _enum_member(column, raw):
    enum_class = column.type.enum_class
    if enum_class is None:
        return raw
    for member in enum_class:
        if raw == member.value or raw == member.name:
            return member
    raise HTTPException(status_code=400, detail=f"Valor inválido para {column.name}")


def _parse(column, raw):
    if isinstance(raw, str):
        raw = raw.strip()
    if raw is None or raw == "":
        return None
    if isinstance(column.type, Boolean):
        if isinstance(raw, bool):
            return raw
        return str(raw).lower() in ("1", "true", "si", "sí")
    if isinstance(column.type, Integer):
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"{column.name} tiene que ser un número")
    if isinstance(column.type, DateTime):
        text = str(raw).replace("Z", "")
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"{column.name} no es una fecha válida")
    if isinstance(column.type, SqlEnum):
        return _enum_member(column, raw)
    return str(raw)


def _dump(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if hasattr(value, "value"):
        return value.value
    return value


def _values(key: str, row) -> dict:
    hidden = HIDDEN.get(key, set())
    data = {"id": row.id}
    for column in row.__table__.columns:
        if column.name in hidden or column.name == "id":
            continue
        data[column.name] = _dump(getattr(row, column.name))
    return data


def _summary(values: dict) -> str:
    for key in SUMMARY_KEYS:
        if values.get(key) not in (None, ""):
            return str(values[key])
    return ""


def _apply(key: str, model, row, payload: dict) -> None:
    hidden = HIDDEN.get(key, set())
    columns = {column.name: column for column in model.__table__.columns}
    for name, raw in (payload or {}).items():
        if name in hidden or name == "id" or name not in columns:
            continue
        column = columns[name]
        parsed = _parse(column, raw)
        if parsed is None and not column.nullable and column.default is not None:
            continue
        setattr(row, name, parsed)


def _null_where(db: Session, model, column, ids):
    if not ids:
        return
    db.query(model).filter(column.in_(list(ids))).update({column: None}, synchronize_session=False)


def _delete_ids(db: Session, model, column, ids):
    if not ids:
        return
    db.query(model).filter(column.in_(list(ids))).delete(synchronize_session=False)


def _prepare_delete(db: Session, key: str, row) -> None:
    row_id = row.id
    if key == "items":
        unit_ids = [value for (value,) in db.query(models.ItemUnit.id).filter(models.ItemUnit.item_id == row_id)]
        history_ids = [value for (value,) in db.query(models.History.id).filter(models.History.itemId == row_id)]
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.unit_id, unit_ids)
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.history_id, history_ids)
        _null_where(db, models.Observation, models.Observation.unit_id, unit_ids)
        _null_where(db, models.Observation, models.Observation.item_id, [row_id])
        _null_where(db, models.Movement, models.Movement.item_id, [row_id])
        _null_where(db, models.History, models.History.itemId, [row_id])
        _delete_ids(db, models.ItemUnit, models.ItemUnit.id, unit_ids)
    elif key == "units":
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.unit_id, [row_id])
        _null_where(db, models.Observation, models.Observation.unit_id, [row_id])
    elif key == "history":
        _delete_ids(db, models.HistoryUnit, models.HistoryUnit.history_id, [row_id])
    elif key == "sheds":
        zone_ids = [value for (value,) in db.query(models.Zone.id).filter(models.Zone.shed_id == row_id)]
        _null_where(db, models.Item, models.Item.zone_id, zone_ids)
        _null_where(db, models.Movement, models.Movement.from_zone_id, zone_ids)
        _null_where(db, models.Movement, models.Movement.to_zone_id, zone_ids)
        _delete_ids(db, models.Zone, models.Zone.id, zone_ids)
        _null_where(db, models.Item, models.Item.shed_id, [row_id])
        _null_where(db, models.Movement, models.Movement.from_shed_id, [row_id])
        _null_where(db, models.Movement, models.Movement.to_shed_id, [row_id])
    elif key == "zones":
        _null_where(db, models.Item, models.Item.zone_id, [row_id])
        _null_where(db, models.Movement, models.Movement.from_zone_id, [row_id])
        _null_where(db, models.Movement, models.Movement.to_zone_id, [row_id])
    elif key == "users":
        _null_where(db, models.Observation, models.Observation.user_id, [row_id])
        _null_where(db, models.History, models.History.userId, [row_id])
        _null_where(db, models.Movement, models.Movement.user_id, [row_id])


def _integrity_message(exc: IntegrityError) -> str:
    text = str(getattr(exc, "orig", exc))
    return f"La base no dejó guardar esa fila. {text}"


@router.get("/tables")
def list_tables(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    return [
        {
            "key": key,
            "label": label,
            "columns": _columns(key, model),
        }
        for key, label, model in TABLES
    ]


@router.get("/{table}")
def list_rows(
    table: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    q: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    _require_admin(current_user)
    _, model = _table(table)
    query = db.query(model)
    term = (q or "").strip()
    if term:
        filters = []
        if term.isdigit():
            filters.append(model.id == int(term))
        for column in model.__table__.columns:
            if isinstance(column.type, String):
                filters.append(column.ilike(f"%{term}%"))
        if filters:
            query = query.filter(or_(*filters))
    total = query.count()
    rows = (
        query.order_by(model.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    data = []
    for row in rows:
        values = _values(table, row)
        data.append({
            "id": row.id,
            "summary": _summary(values),
            "values": values,
        })
    return {
        "rows": data,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
        },
    }


@router.post("/{table}", status_code=201)
def create_row(
    table: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = model()
    _apply(table, model, row, payload)
    if table == "users" and not getattr(row, "password", None):
        row.password = bcrypt_context.hash(secrets.token_urlsafe(24))
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    db.refresh(row)
    values = _values(table, row)
    return {"id": row.id, "summary": _summary(values), "values": values}


@router.put("/{table}/{row_id}")
def update_row(
    table: str,
    row_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No se encontró esa fila")
    _apply(table, model, row, payload)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    db.refresh(row)
    values = _values(table, row)
    return {"id": row.id, "summary": _summary(values), "values": values}


@router.delete("/{table}/{row_id}")
def delete_row(
    table: str,
    row_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    _, model = _table(table)
    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No se encontró esa fila")
    _prepare_delete(db, table, row)
    db.delete(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=_integrity_message(exc))
    return {"ok": True}
