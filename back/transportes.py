from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models
from auth import get_current_user, get_user_name_by_id, has_admin_access
from database import get_db
from item_images import (
    MAX_BYTES,
    MEDIA_TYPES,
    _load_image,
    _save_processed,
    delete_stored_image,
    stored_image_path,
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
    }


def _summary(row: models.Transport, open_use, names: dict) -> dict:
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
        elif open_use.cart_id == row.id:
            place = "Con un auto"
            with_name = names.get(open_use.transport_id) or ""
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
    }


class CreateBody(BaseModel):
    kind: str
    name: str
    plate: Optional[str] = None


class LeaveBody(BaseModel):
    person: str
    left_at: str
    cart_id: Optional[int] = None
    km: Optional[int] = None
    external_vehicle: Optional[str] = None


class ReturnBody(BaseModel):
    returned_at: str
    km: Optional[int] = None


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
    for use in open_rows:
        open_by_id[use.transport_id] = use
        if use.cart_id:
            open_by_id[use.cart_id] = use
    return [_summary(row, open_by_id.get(row.id), names) for row in rows]


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
    return [
        {
            "id": fine.id,
            "transport_id": row.id,
            "plate": row.plate or "",
            "name": row.name,
            "occurred_at": _iso(fine.occurred_at),
            "person": fine.person or "",
            "paid": bool(fine.paid),
        }
        for fine, row in rows
    ]


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
    data = _summary(row, open_use, names)
    data.update({
        "last_service_at": _iso(row.last_service_at),
        "last_service_km": row.last_service_km,
        "damage_note": row.damage_note or "",
        "uses": [_use_row(use, names) for use in uses],
        "fines": [
            {
                "id": fine.id,
                "occurred_at": _iso(fine.occurred_at),
                "person": fine.person,
                "paid": bool(fine.paid),
            }
            for fine in fines
        ],
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
    if not person:
        raise HTTPException(status_code=400, detail="Indicá quién lo lleva")
    left_at = _moment(body.left_at)
    km = _km(body.km)
    cart_id = None
    external = None
    if row.kind == "auto":
        if body.cart_id:
            cart = _get(db, body.cart_id)
            if cart.kind != "carro":
                raise HTTPException(status_code=400, detail="Eso no es un carro")
            if _open_for(db, cart.id):
                raise HTTPException(status_code=400, detail="Ese carro ya está afuera")
            cart_id = cart.id
    else:
        external = (body.external_vehicle or "").strip()
        if not external:
            raise HTTPException(status_code=400, detail="Indicá con qué auto de afuera sale")
    use = models.TransportUse(
        transport_id=row.id,
        cart_id=cart_id,
        person=person,
        left_at=left_at,
        km=km,
        external_vehicle=external,
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
    use.returned_at = returned_at
    if km is not None:
        use.km = km
        owner = row if use.transport_id == row.id else _get(db, use.transport_id)
        _apply_km(owner, km)
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
        use_id=use_id,
    )
    db.add(fine)
    db.commit()
    return {"ok": True}


@router.post("/multas/{fine_id}/pagar")
def pay_fine(
    fine_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    fine = db.query(models.TransportFine).filter(models.TransportFine.id == fine_id).first()
    if not fine:
        raise HTTPException(status_code=404, detail="No está esa multa")
    fine.paid = True
    db.commit()
    return {"ok": True}


@router.put("/multas/{fine_id}/persona")
def set_fine_person(
    fine_id: int,
    body: FinePersonBody,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    _admin(current_user)
    fine = db.query(models.TransportFine).filter(models.TransportFine.id == fine_id).first()
    if not fine:
        raise HTTPException(status_code=404, detail="No está esa multa")
    person = (body.person or "").strip()
    if not person:
        raise HTTPException(status_code=400, detail="Escribí quién la hizo")
    fine.person = person
    db.commit()
    return {"ok": True}


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
