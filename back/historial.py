from datetime import datetime
from fastapi import Depends, HTTPException, status, APIRouter
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Annotated, List, Optional
from dtos.historialDTO import HistoryResponseDTO
import models
from database import get_db
from auth import get_current_user, get_user_name_by_id
import dtos.retiroDTO as retiroDTO
import dtos.turnBackDTO as devolucionDTO
import dtos.trasladoDTO as trasladoDTO
from dtos.historialDTO import HistoryImageDTO, HistoryResponseWithDetailsDTO
from sqlalchemy import case, func, or_
from fastapi import Query
from math import ceil
from fastapi.responses import StreamingResponse
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from PIL import Image
import requests
from reportlab.lib.units import cm

import pytz
from item_categories import category_is_consumable
from item_images import stored_image_path
from obras import require_active_obra
from item_service import ItemServiceError, item_unplaced_amount
from unit_service import (
    REPAIR_PLACE,
    STATUS_FUERA_DE_SERVICIO,
    STATUS_RETIRADA,
    apply_inner_return,
    discard_unit,
    find_unit_by_code,
    link_history_units,
    piece_amount,
    restore_units,
    return_shares,
    align_depot_zones,
    sync_breakage,
    mark_inner_used_if_empty,
    mark_withdrawn_used,
    take_inner_quantity,
    take_units_out,
    unit_out_places,
    units_for_pending_place,
)

NO_VOLVIO_REASONS = {
    "gastado": "Se gastó",
    "perdido": "Se perdió",
    "roto": "Se rompió",
}



def _piece_label(code, name):
    if name:
        return f"{code} · {name}"
    return code or ""


def _existing_image(filename):
    if not filename:
        return None
    path = stored_image_path(filename)
    if path.is_file():
        return str(path)
    return None


def _history_image(item_id, item_name, item_description, item_filename, piece):
    if piece is not None and piece.get("image_filename") and _existing_image(piece["image_filename"]):
        return HistoryImageDTO(
            kind="unit",
            id=piece["unit_id"],
            image_filename=piece["image_filename"],
            name=(piece.get("name") or "").strip() or item_name,
            description=(piece.get("description") or "").strip() or None,
        )
    if item_filename and _existing_image(item_filename):
        return HistoryImageDTO(
            kind="item",
            id=item_id,
            image_filename=item_filename,
            name=item_name,
            description=(item_description or "").strip() or None,
        )
    return None


def split_grouped_returns(db):
    """Una devolución que juntó varios juegos pasa a un movimiento por juego."""
    grouped_ids = [
        history_id
        for (history_id,) in (
            db.query(models.HistoryUnit.history_id)
            .join(models.History, models.History.id == models.HistoryUnit.history_id)
            .filter(models.History.action == models.ActionEnum.devolucion)
            .group_by(models.HistoryUnit.history_id)
            .having(func.count(models.HistoryUnit.id) > 1)
            .all()
        )
    ]
    changed = False
    for history_id in grouped_ids:
        history = db.query(models.History).filter(models.History.id == history_id).first()
        if not history:
            continue
        links = (
            db.query(models.HistoryUnit)
            .filter(models.HistoryUnit.history_id == history.id)
            .order_by(models.HistoryUnit.id.asc())
            .all()
        )
        shares = return_shares(db, history)
        if len(shares) != len(links):
            continue
        if sum(int(amount) for amount in shares.values()) != int(history.amountRetired or 0):
            continue
        keep = links[0]
        history.amountRetired = int(shares[keep.unit_id])
        keep.amount = int(shares[keep.unit_id])
        for link in links[1:]:
            share = int(shares[link.unit_id])
            clone = models.History(
                itemId=history.itemId,
                userId=history.userId,
                userName=history.userName,
                personWhoTook=history.personWhoTook,
                action=history.action,
                amountRetired=share,
                amountNotReturned=history.amountNotReturned,
                date=history.date,
                place=history.place,
                note=history.note,
                turnback=history.turnback,
                turnbackDate=history.turnbackDate,
                lastNotification=history.lastNotification,
                hideFromHistorial=history.hideFromHistorial,
            )
            db.add(clone)
            db.flush()
            db.add(models.HistoryUnit(history_id=clone.id, unit_id=link.unit_id, amount=share))
            db.delete(link)
        changed = True
    if changed:
        db.commit()


router = APIRouter(
    prefix="/historical",
    tags=["historical"]
)


db_dependency = Annotated[Session, Depends(get_db)] 

TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

def now():
    """Devuelve la fecha/hora actual en la zona horaria de Buenos Aires"""
    return datetime.now(TIMEZONE)


def _history_with_codes(history, units):
    payload = jsonable_encoder(history)
    payload["unit_codes"] = [unit.code for unit in (units or [])]
    return payload


DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


@router.get("/", response_model=dict)
def read_history(
    db: db_dependency,
    item_name: Optional[str] = None,
    item_id: Optional[int] = None,
    item_ids: Optional[List[int]] = Query(None),
    user_name: Optional[str] = None,
    person_who_took: Optional[str] = None,
    place: Optional[str] = None,
    action: Optional[str] = None,
    item_category: Optional[str] = None,
    shedId: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    day: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE)
):
    try:
        split_grouped_returns(db)
        original_name = case(
            (models.Item.name.like("%__DELETED_%"), 
             func.substr(models.Item.name, 1, func.instr(models.Item.name, "__DELETED_") - 1)),
            else_=models.Item.name
        ).label("itemName")

        query = (
            db.query(
                models.History,
                original_name,
                models.Item.category.label("category"),
                models.Item.shed_id.label("shed_id"),
                models.Shed.name.label("shedName"),
                models.Item.description.label("itemDescription"),
                models.Item.image_filename.label("itemImage"),
            )
            .join(models.Item, models.History.itemId == models.Item.id)
            .join(models.Shed, models.Item.shed_id == models.Shed.id)
            .filter(
                (models.History.hideFromHistorial.is_(False))
                | (models.History.hideFromHistorial.is_(None))
            )
        )

        if item_name:
            piece_match = (
                db.query(models.HistoryUnit.id)
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(
                    models.HistoryUnit.history_id == models.History.id,
                    or_(
                        models.ItemUnit.name.ilike(f"%{item_name}%"),
                        models.ItemUnit.code.ilike(f"%{item_name}%"),
                    ),
                )
                .exists()
            )
            query = query.filter(
                or_(
                    models.Item.name.ilike(f"%{item_name}%"),
                    original_name.ilike(f"%{item_name}%"),
                    piece_match,
                )
            )
        if item_ids:
            query = query.filter(models.History.itemId.in_(item_ids))
        elif item_id is not None:
            query = query.filter(models.History.itemId == item_id)
        if user_name:
            query = query.filter(models.History.userName.ilike(f"%{user_name}%"))
        if place:
            query = query.filter(models.History.place.ilike(f"%{place}%"))
        if action:
            query = query.filter(models.History.action == action)
        if person_who_took:
            query = query.filter(
                or_(
                    models.History.personWhoTook.ilike(f"%{person_who_took}%"),
                    models.History.userName.ilike(f"%{person_who_took}%")
                )
            )
        if item_category:
            query = query.filter(models.Item.category.ilike(f"%{item_category}%"))
        if shedId:
            query = query.filter(models.Item.shed_id == shedId)
        if month and year:
            query = query.filter(
                func.strftime('%m', models.History.date) == f"{month:02d}",
                func.strftime('%Y', models.History.date) == str(year)
            )
            if day and 1 <= day <= 31:
                query = query.filter(
                    func.strftime('%d', models.History.date) == f"{day:02d}"
                )

        total_records = query.count()
        total_pages = ceil(total_records / page_size)

        records = query.order_by(models.History.date.desc()) \
                      .offset((page - 1) * page_size) \
                      .limit(page_size) \
                      .all()

        history_ids = [history.id for history, *_rest in records]
        history_by_id = {history.id: history for history, *_rest in records}
        pieces_by_history = {}
        if history_ids:
            links = (
                db.query(
                    models.HistoryUnit,
                    models.ItemUnit.id,
                    models.ItemUnit.code,
                    models.ItemUnit.name,
                    models.ItemUnit.image_filename,
                    models.ItemUnit.description,
                )
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(models.HistoryUnit.history_id.in_(history_ids))
                .order_by(models.ItemUnit.code.asc())
                .all()
            )
            shares_by_history = {}
            for link, unit_id, code, piece_name, image_filename, piece_description in links:
                history = history_by_id.get(link.history_id)
                if history is None:
                    continue
                if link.history_id not in shares_by_history:
                    shares_by_history[link.history_id] = return_shares(db, history)
                pieces_by_history.setdefault(link.history_id, []).append(
                    {
                        "unit_id": unit_id,
                        "code": code,
                        "name": piece_name,
                        "image_filename": image_filename,
                        "description": piece_description,
                        "amount": piece_amount(
                            db,
                            history,
                            link,
                            shares_by_history[link.history_id],
                        ),
                    }
                )

        data = []
        for history, item_name_db, category, shed_id, shed_name, item_description, item_image in records:
            pieces = pieces_by_history.get(history.id) or []
            amounts = [piece.get("amount") for piece in pieces]
            total = int(history.amountRetired or 0)
            real_split = (
                len(pieces) > 1
                and all(amount is not None for amount in amounts)
                and sum(int(amount) for amount in amounts) == total
                and any(int(amount) != total for amount in amounts)
            )
            shown = pieces if (len(pieces) == 1 or real_split) else [None]
            for piece in shown:
                label = item_name_db
                amount = history.amountRetired
                row_pieces = pieces
                if piece is not None:
                    label = _piece_label(piece["code"], piece["name"])
                    if piece.get("amount") is not None:
                        amount = piece["amount"]
                    row_pieces = [piece]
                image = _history_image(
                    history.itemId,
                    item_name_db,
                    item_description,
                    item_image,
                    piece,
                )
                data.append(
                    HistoryResponseWithDetailsDTO(
                        id=history.id,
                        itemId=history.itemId,
                        itemName=label,
                        userId=history.userId,
                        userName=history.userName,
                        personWhoTook=history.personWhoTook or history.userName,
                        action=history.action,
                        amountRetired=amount,
                        amountNotReturned=history.amountNotReturned,
                        date=history.date,
                        place=history.place,
                        note=history.note,
                        turnback=history.turnback,
                        turnbackDate=history.turnbackDate,
                        itemCategory=category,
                        shedId=shed_id,
                        shed_name=shed_name,
                        pieces=[
                            {
                                "code": row["code"],
                                "name": row["name"],
                                "amount": row.get("amount"),
                            }
                            for row in row_pieces
                        ],
                        image=image,
                    )
                )

        return {
            "data": data,
            "pagination": {
                "total_records": total_records,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
                "has_next": page < total_pages,
                "has_previous": page > 1
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener el historial: {str(e)}"
        )


@router.get("/pending", response_model=dict)
def read_pending_history(
    db: db_dependency,
    person_who_took: Optional[str] = None,
    place: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE)
):
    try:
        query = db.query(
            models.History,
            models.Item.name.label('itemName')
        ).join(
            models.Item,
            models.History.itemId == models.Item.id
        ).filter(
            models.History.turnback == False,
            models.History.place != REPAIR_PLACE,
        )

        if person_who_took:
            query = query.filter(
                (models.History.personWhoTook.ilike(f"%{person_who_took}%")) |
                (models.History.userName.ilike(f"%{person_who_took}%"))
            )

        if place:
            query = query.filter(models.History.place.ilike(f"%{place}%"))

        total_records = query.count()
        total_pages = ceil(total_records / page_size)

        results = query.order_by(models.History.date.desc()) \
                      .offset((page - 1) * page_size) \
                      .limit(page_size) \
                      .all()

        data = []
        for history, item_name in results:
            data.append({
                "id": history.id,
                "itemId": history.itemId,
                "itemName": item_name,
                "userId": history.userId,
                "userName": history.userName,
                "personWhoTook": history.personWhoTook or history.userName,
                "action": history.action,
                "amountRetired": history.amountRetired,
                "amountNotReturned": history.amountNotReturned,
                "date": history.date,
                "place": history.place,
                "turnback": history.turnback,
                "turnbackDate": history.turnbackDate,
                "lastNotification": history.lastNotification
            })

        return {
            "data": data,
            "pagination": {
                "total_records": total_records,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
                "has_next": page < total_pages,
                "has_previous": page > 1
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener los pendientes: {str(e)}"
        )


@router.get("/search")
def search_history(item_id: int, db: db_dependency):
    history = db.query(models.History).filter(models.History.itemId == item_id).all()
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No historical records found for that item"
        )
    return history


@router.get("/pending-places/{item_id}")
def get_pending_places(
    item_id: int,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )

    pending_rows = (
        db.query(models.History)
        .filter(
            models.History.itemId == item_id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
        )
        .order_by(models.History.place.asc(), models.History.date.asc())
        .all()
    )

    by_place = {}
    for history in pending_rows:
        place = (history.place or "").strip()
        if not place or place == REPAIR_PLACE:
            continue
        entry = by_place.setdefault(
            place,
            {"place": place, "pending_amount": 0, "persons": [], "date": history.date},
        )
        entry["pending_amount"] += int(history.amountNotReturned or 0)
        if history.date and (entry["date"] is None or history.date < entry["date"]):
            entry["date"] = history.date
        person = (history.personWhoTook or history.userName or "").strip()
        if person and person not in entry["persons"]:
            entry["persons"].append(person)

    return [
        {
            "place": data["place"],
            "pending_amount": data["pending_amount"],
            "personWhoTook": ", ".join(data["persons"]) if data["persons"] else None,
            "date": data["date"],
        }
        for data in by_place.values()
    ]


@router.get("/places")
def get_historial_places(
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rows = (
        db.query(models.History.place)
        .filter(
            models.History.place.isnot(None),
            models.History.place != "",
            ~models.History.place.contains("→"),
        )
        .distinct()
        .order_by(models.History.place.asc())
        .all()
    )
    return [{"place": place} for (place,) in rows if place]


@router.post("/retirar")
def retirar_item(dto: retiroDTO.RetiroDTO, db: db_dependency, 
                current_user: Annotated[dict, Depends(get_current_user)]):
    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(404, "Item not found")

    repair = bool(dto.repair)
    in_shed = bool(dto.inShed)
    if in_shed:
        if repair:
            raise HTTPException(400, "Elegí reparar o usado en el galpón, no las dos")
        if not category_is_consumable(db, item.category):
            raise HTTPException(400, "Solo los insumos que se gastan se marcan usados en el galpón")
        dto.place = item.shed.name if item.shed and item.shed.name else "Galpón"
    elif repair:
        dto.place = REPAIR_PLACE
    else:
        from obras import require_active_obra
        dto.place = require_active_obra(db, dto.place)

    if item.actualAmount < dto.amount:
        raise HTTPException(400, "No hay suficiente stock")
    

    quien_tomo = user_name  
    if dto.personWhoTook and dto.personWhoTook.strip():  
        quien_tomo = dto.personWhoTook.strip()

    no_return = in_shed or ((category_is_consumable(db, item.category) or bool(dto.noReturn)) and not repair)
    units = []
    if item.inner_quantity:
        if not dto.codes or len(dto.codes) != 1:
            raise HTTPException(400, "Elegí el código")
        try:
            unit = find_unit_by_code(db, dto.codes[0])
            if not unit or unit.item_id != item.id:
                raise ItemServiceError("El código no pertenece a este artículo")
            units = [take_inner_quantity(unit, dto.amount, consume=no_return)]
            align_depot_zones(db, units[0], item)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
    elif item.track_units:
        try:
            units = take_units_out(
                db,
                item,
                dto.amount,
                dto.codes,
                consume=no_return,
                out_status=STATUS_FUERA_DE_SERVICIO if repair else None,
            )
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
    
    if no_return:

        history = models.History(
            itemId=dto.itemId,
            userId=user_id,
            userName=user_name,
            action=models.ActionEnum.uso_galpon if in_shed else models.ActionEnum.retiro,
            personWhoTook=quien_tomo,  
            amountRetired=dto.amount,
            amountNotReturned=None ,
            date=now(),
            place=dto.place,
            note=(dto.note or "").strip() or None,
            turnback=True,
            lastNotification=None
        )
        item.actualAmount -= dto.amount
        item.totalAmount -= dto.amount
        
        db.add(history)
        db.flush()
        link_history_units(db, history.id, units)
        db.commit()
        db.refresh(history)
        return _history_with_codes(history, units)
    
    item.actualAmount -= dto.amount

    history = models.History(
    itemId=dto.itemId,
    userId=user_id,
    userName=user_name,
    action=models.ActionEnum.retiro,
    personWhoTook=quien_tomo,  
    amountRetired=dto.amount,
    amountNotReturned=dto.amount,  
    date=now(),
    place=dto.place,
    note=(dto.note or "").strip() or None,
    turnback=False,
    lastNotification=None
    )
    

    db.add(history)
    db.flush()
    link_history_units(db, history.id, units)
    db.commit()
    db.refresh(history)
    return _history_with_codes(history, units)


def _validate_repair_return(dto):
    if dto.fixed is None:
        raise HTTPException(400, "Indicá si se arregló")
    if dto.fixed:
        if not (dto.fix_note or "").strip():
            raise HTTPException(400, "Contá qué le hicieron")
        return
    if not (dto.damage_note or "").strip():
        raise HTTPException(400, "Contá cuál es el error")
    if (dto.outcome or "") not in ("depot", "discard"):
        raise HTTPException(400, "Indicá si se puede reparar o se tira")
    if dto.outcome == "discard" and not (dto.authorized_by or "").strip():
        raise HTTPException(400, "Indicá quién autoriza tirarla")


def _repair_units(db, item, dto):
    chosen = [code for code in (dto.codes or []) if code and str(code).strip()]
    if not chosen:
        raise HTTPException(400, "Elegí el código")
    units = []
    for code in chosen:
        try:
            unit = find_unit_by_code(db, code)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        if not unit or unit.item_id != item.id:
            raise HTTPException(400, "No hay una pieza con ese código")
        units.append(unit)
    return units


def _remember_repair_note(dto, text):
    extra = (text or "").strip()
    if not extra:
        return
    note = (dto.note or "").strip()
    dto.note = f"{note}\n{extra}".strip() if note else extra


def _mark_repaired(db, units, dto):
    done = (dto.fix_note or "").strip()
    for unit in units:
        was_broken = bool(unit.is_broken)
        previous_damage = unit.damage_note
        previous_repair = unit.repair_note
        unit.is_broken = False
        unit.damage_note = None
        unit.repair_note = None
        if was_broken:
            sync_breakage(db, unit, True, previous_damage, previous_repair, done)
    _remember_repair_note(dto, done)


def _mark_still_broken(db, units, dto):
    why = (dto.damage_note or "").strip()
    for unit in units:
        was_broken = bool(unit.is_broken)
        unit.is_broken = True
        unit.damage_note = why
        sync_breakage(db, unit, was_broken)
    _remember_repair_note(dto, why)


def _discard_from_repair(db, item, dto, user_id, user_name):
    units = _repair_units(db, item, dto)
    for unit in units:
        in_repair = unit.status == STATUS_FUERA_DE_SERVICIO or any(
            row.get("place") == REPAIR_PLACE and int(row.get("quantity") or 0) > 0
            for row in unit_out_places(db, unit)
        )
        if not in_repair:
            raise HTTPException(400, f"{unit.code} no está en reparación")
    who = (dto.personWhoReturned or "").strip() or user_name
    _mark_still_broken(db, units, dto)
    for unit in units:
        discard_unit(db, item, unit, who, (dto.authorized_by or "").strip(), user_id, user_name)
    db.commit()
    return {"discarded": True, "codes": [unit.code for unit in units]}


@router.post("/devolver")
def devolver_item(dto: devolucionDTO.DevolucionDTO, db: db_dependency, current_user: Annotated[dict, Depends(get_current_user)]):
    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(404, "Item not found")

    from_repair = (dto.place or "").strip() == REPAIR_PLACE
    if from_repair:
        _validate_repair_return(dto)
        if dto.fixed is False and dto.outcome == "discard":
            try:
                return _discard_from_repair(db, item, dto, user_id, user_name)
            except ItemServiceError as exc:
                db.rollback()
                raise HTTPException(status_code=exc.status_code, detail=exc.message)

    units = []
    return_amounts = None
    if item.inner_quantity:
        chosen = [code for code in (dto.codes or []) if code and str(code).strip()]
        if len(chosen) > 1:
            raise HTTPException(400, "Elegí un solo código")
        pending = (
            db.query(models.History, models.ItemUnit)
            .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
            .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
            .filter(
                models.History.itemId == item.id,
                models.ItemUnit.item_id == item.id,
                models.History.action == models.ActionEnum.retiro,
                models.History.turnback == False,
                models.History.amountNotReturned > 0,
            )
        )
        if chosen:
            try:
                unit = find_unit_by_code(db, chosen[0])
            except ItemServiceError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.message)
            if not unit or unit.item_id != item.id:
                raise HTTPException(400, "No hay una pieza con ese código")
            pending = pending.filter(models.HistoryUnit.unit_id == unit.id)
        if dto.place:
            pending = pending.filter(models.History.place == dto.place)
        pending_rows = pending.order_by(models.History.date.asc(), models.History.id.asc()).all()
        total_pending = sum(row.amountNotReturned or 0 for row, _unit in pending_rows)
        if dto.amount > total_pending:
            where = "En reparación" if (dto.place or "").strip() == REPAIR_PLACE else "En esa obra"
            raise HTTPException(
                status_code=400,
                detail=f"{where} hay {total_pending}",
            )
        remaining = dto.amount
        taken_by_unit = {}
        for row, unit in pending_rows:
            if remaining <= 0:
                break
            pending_amount = row.amountNotReturned or 0
            take = pending_amount if remaining >= pending_amount else remaining
            row.amountNotReturned = pending_amount - take
            remaining -= take
            if row.amountNotReturned == 0:
                row.turnback = True
                row.turnbackDate = now()
            taken_by_unit[unit.id] = taken_by_unit.get(unit.id, 0) + take
        units = []
        try:
            for unit_id, taken in taken_by_unit.items():
                unit = db.query(models.ItemUnit).filter(models.ItemUnit.id == unit_id).first()
                apply_inner_return(unit, taken)
                align_depot_zones(db, unit, item)
                units.append(unit)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        item.actualAmount = (item.actualAmount or 0) + dto.amount
        return_amounts = taken_by_unit
    elif item.track_units and dto.codes:
        try:
            units = restore_units(db, item, dto.amount, dto.codes, dto.place)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        for unit in units:
            history = (
                db.query(models.History)
                .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
                .filter(
                    models.HistoryUnit.unit_id == unit.id,
                    models.History.action == models.ActionEnum.retiro,
                    models.History.turnback == False,
                    models.History.amountNotReturned > 0,
                )
            )
            if dto.place:
                history = history.filter(models.History.place == dto.place)
            history = history.order_by(models.History.date.asc()).first()
            if not history:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No hay una salida pendiente de {unit.code} en reparación"
                        if (dto.place or "").strip() == REPAIR_PLACE
                        else f"No hay una salida pendiente de {unit.code} en esa obra"
                    ),
                )
            history.amountNotReturned -= 1
            if history.amountNotReturned == 0:
                history.turnback = True
                history.turnbackDate = now()
            home = db.query(models.Item).filter(models.Item.id == unit.item_id).first()
            if home:
                home.actualAmount = (home.actualAmount or 0) + 1
    else:
        pendientes_query = db.query(models.History).filter(
            models.History.itemId == dto.itemId,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False
        )

        if dto.place:
            pendientes_query = pendientes_query.filter(
                models.History.place == dto.place
            )

        pendientes = pendientes_query.order_by(models.History.date.asc()).all()

        total_pendiente = sum(p.amountNotReturned or 0 for p in pendientes)
        if dto.amount > total_pendiente:
            raise HTTPException(
                status_code=400,
                detail=f"No se pueden devolver {dto.amount} unidades. Solo {total_pendiente} están pendientes en este lugar."
            )

        if item.track_units:
            try:
                units = restore_units(db, item, dto.amount, dto.codes, dto.place)
            except ItemServiceError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.message)

        if units:
            for unit in units:
                home = db.query(models.Item).filter(models.Item.id == unit.item_id).first()
                if home:
                    home.actualAmount = (home.actualAmount or 0) + 1
        else:
            item.actualAmount += dto.amount
        restante = dto.amount

        for p in pendientes:
            if restante <= 0:
                break

            if restante >= p.amountNotReturned:
                restante -= p.amountNotReturned
                p.amountNotReturned = 0
            else:
                p.amountNotReturned -= restante
                restante = 0

            if p.amountNotReturned == 0:
                p.turnback = True
                p.turnbackDate = now()

    if from_repair:
        try:
            if dto.fixed:
                _mark_repaired(db, units, dto)
            else:
                _mark_still_broken(db, units, dto)
        except ItemServiceError as exc:
            db.rollback()
            raise HTTPException(status_code=exc.status_code, detail=exc.message)

    quien_devuelve = dto.personWhoReturned.strip() if dto.personWhoReturned and dto.personWhoReturned.strip() else user_name

    shares = []
    if return_amounts and len(return_amounts) > 1:
        for unit in units:
            shares.append((unit, int(return_amounts[unit.id])))
    else:
        shares.append((None, dto.amount))

    moment = now()
    created = None
    for unit, share in shares:
        history = models.History(
            itemId=dto.itemId,
            userId=user_id,
            userName=user_name,
            action=models.ActionEnum.devolucion,
            amountRetired=share,
            date=moment,
            turnback=True,
            turnbackDate=moment,
            place=dto.place,
            note=(dto.note or "").strip() or None,
            personWhoTook=quien_devuelve,
            lastNotification=None
        )
        db.add(history)
        db.flush()
        if unit is not None:
            link_history_units(db, history.id, [unit], {unit.id: share})
        else:
            link_history_units(db, history.id, units, return_amounts)
        created = history

    db.commit()
    db.refresh(created)

    return _history_with_codes(created, units)


def _pending_label(total):
    if total == 1:
        return "En esa obra hay 1 pendiente"
    return f"En esa obra hay {total} pendientes"


def _close_pending_amount(rows, amount):
    total = sum(row.amountNotReturned or 0 for row in rows)
    if amount > total:
        raise HTTPException(status_code=400, detail=_pending_label(total))
    remaining = amount
    for row in rows:
        if remaining <= 0:
            break
        pending_amount = row.amountNotReturned or 0
        take = pending_amount if remaining >= pending_amount else remaining
        row.amountNotReturned = pending_amount - take
        remaining -= take
        if row.amountNotReturned == 0:
            row.turnback = True
            row.turnbackDate = now()


def _lower_total(item, amount):
    total = int(item.totalAmount or 0)
    if amount > total:
        raise HTTPException(
            status_code=400,
            detail=f"El total del producto es {total} y no alcanza para cerrar {amount}",
        )
    item.totalAmount = total - amount


def _units_pending_at(db, item, place, codes=None):
    rows = (
        db.query(models.ItemUnit)
        .join(models.HistoryUnit, models.HistoryUnit.unit_id == models.ItemUnit.id)
        .join(models.History, models.History.id == models.HistoryUnit.history_id)
        .filter(
            models.ItemUnit.item_id == item.id,
            models.ItemUnit.status == STATUS_RETIRADA,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.place == place,
            models.History.amountNotReturned > 0,
        )
        .order_by(models.History.date.asc(), models.History.id.asc(), models.ItemUnit.id.asc())
        .all()
    )
    ordered = []
    seen = set()
    for unit in rows:
        if unit.id in seen:
            continue
        seen.add(unit.id)
        ordered.append(unit)
    if not codes:
        return ordered
    by_code = {unit.code: unit for unit in ordered}
    chosen = []
    for code in codes:
        unit = by_code.get(code)
        if not unit:
            raise HTTPException(
                status_code=400,
                detail=f"No hay una salida pendiente de {code} en esa obra",
            )
        chosen.append(unit)
    return chosen


def _close_unit_pending(db, unit, place):
    history = (
        db.query(models.History)
        .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
        .filter(
            models.HistoryUnit.unit_id == unit.id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.amountNotReturned > 0,
            models.History.place == place,
        )
        .order_by(models.History.date.asc(), models.History.id.asc())
        .first()
    )
    if not history or (history.amountNotReturned or 0) < 1:
        raise HTTPException(
            status_code=400,
            detail=f"No hay una salida pendiente de {unit.code} en esa obra",
        )
    history.amountNotReturned -= 1
    if history.amountNotReturned == 0:
        history.turnback = True
        history.turnbackDate = now()


@router.post("/no-volvio")
def no_volvio_item(
    dto: devolucionDTO.NoVolvioDTO,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    if dto.amount < 1:
        raise HTTPException(status_code=400, detail="La cantidad tiene que ser mayor a 0")
    reason = NO_VOLVIO_REASONS.get((dto.reason or "").strip())
    if not reason:
        raise HTTPException(status_code=400, detail="Indicá si se gastó, se perdió o se rompió")
    place = (dto.place or "").strip()
    if not place:
        raise HTTPException(status_code=400, detail="Elegí la obra")
    if place == REPAIR_PLACE:
        raise HTTPException(
            status_code=400,
            detail="Lo que está en reparación se devuelve o se tira desde Fuera de servicio",
        )

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)
    who = (dto.personWhoConfirmed or "").strip() or user_name
    raw_codes = [str(code).strip() for code in (dto.codes or []) if code and str(code).strip()]
    units = []
    link_amounts = None

    try:
        if item.inner_quantity:
            if len(raw_codes) > 1:
                raise HTTPException(status_code=400, detail="Elegí un solo código")
            pending = (
                db.query(models.History, models.ItemUnit)
                .join(models.HistoryUnit, models.HistoryUnit.history_id == models.History.id)
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(
                    models.History.itemId == item.id,
                    models.ItemUnit.item_id == item.id,
                    models.History.action == models.ActionEnum.retiro,
                    models.History.turnback == False,
                    models.History.amountNotReturned > 0,
                    models.History.place == place,
                )
            )
            if raw_codes:
                unit = find_unit_by_code(db, raw_codes[0])
                if not unit or unit.item_id != item.id:
                    raise HTTPException(status_code=400, detail="No hay una pieza con ese código")
                pending = pending.filter(models.HistoryUnit.unit_id == unit.id)
            pending_rows = pending.order_by(models.History.date.asc(), models.History.id.asc()).all()
            unique_rows = []
            seen_pairs = set()
            for row, unit in pending_rows:
                key = (row.id, unit.id)
                if key in seen_pairs:
                    continue
                seen_pairs.add(key)
                unique_rows.append((row, unit))
            pending_rows = unique_rows
            total_pending = sum(row.amountNotReturned or 0 for row, _unit in pending_rows)
            if dto.amount > total_pending:
                raise HTTPException(status_code=400, detail=_pending_label(total_pending))
            remaining = dto.amount
            taken_by_unit = {}
            seen_units = {}
            for row, unit in pending_rows:
                if remaining <= 0:
                    break
                pending_amount = row.amountNotReturned or 0
                take = pending_amount if remaining >= pending_amount else remaining
                row.amountNotReturned = pending_amount - take
                remaining -= take
                if row.amountNotReturned == 0:
                    row.turnback = True
                    row.turnbackDate = now()
                taken_by_unit[unit.id] = taken_by_unit.get(unit.id, 0) + take
                seen_units[unit.id] = unit
            db.flush()
            units = []
            for unit_id in taken_by_unit:
                unit = seen_units[unit_id]
                mark_inner_used_if_empty(db, unit)
                units.append(unit)
            link_amounts = taken_by_unit
        elif item.track_units:
            if raw_codes and len(raw_codes) != dto.amount:
                raise HTTPException(
                    status_code=400,
                    detail="La cantidad tiene que coincidir con las piezas elegidas",
                )
            normalized = []
            for raw in raw_codes:
                unit = find_unit_by_code(db, raw)
                if not unit or unit.item_id != item.id:
                    raise HTTPException(status_code=400, detail="No hay una pieza con ese código")
                normalized.append(unit.code)
            available = _units_pending_at(db, item, place, normalized or None)
            if normalized:
                units = available
            elif len(available) < dto.amount:
                raise HTTPException(status_code=400, detail=_pending_label(len(available)))
            else:
                units = available[: dto.amount]
            for unit in units:
                _close_unit_pending(db, unit, place)
                mark_withdrawn_used(unit)
            link_amounts = {unit.id: 1 for unit in units}
        else:
            pendientes = (
                db.query(models.History)
                .filter(
                    models.History.itemId == item.id,
                    models.History.action == models.ActionEnum.retiro,
                    models.History.turnback == False,
                    models.History.place == place,
                )
                .order_by(models.History.date.asc(), models.History.id.asc())
                .all()
            )
            _close_pending_amount(pendientes, dto.amount)

        _lower_total(item, dto.amount)
        moment = now()
        history = models.History(
            itemId=item.id,
            userId=user_id,
            userName=user_name,
            personWhoTook=who,
            action=models.ActionEnum.no_volvio,
            amountRetired=dto.amount,
            amountNotReturned=0,
            date=moment,
            place=place,
            note=reason,
            turnback=True,
            turnbackDate=moment,
            lastNotification=None,
        )
        db.add(history)
        db.flush()
        if units:
            link_history_units(db, history.id, units, link_amounts)
        db.commit()
    except ItemServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    return {"ok": True, "amount": dto.amount, "reason": reason, "codes": [unit.code for unit in units]}


UNPLACED_PLACE = "Sin ubicar"


@router.post("/sin-ubicar")
def close_unplaced(
    dto: devolucionDTO.SinUbicarDTO,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    reason = NO_VOLVIO_REASONS.get((dto.reason or "").strip())
    if not reason:
        raise HTTPException(status_code=400, detail="Indicá si se gastó, se perdió o se rompió")
    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.track_units or item.inner_quantity:
        raise HTTPException(status_code=400, detail="Los productos con códigos se cierran pieza por pieza")
    missing = item_unplaced_amount(db, item)
    if missing < 1:
        raise HTTPException(status_code=400, detail="No hay nada sin ubicar")

    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)
    who = (dto.personWhoConfirmed or "").strip() or user_name
    moment = now()

    _lower_total(item, missing)
    stale = (
        db.query(models.History)
        .filter(
            models.History.itemId == item.id,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            or_(models.History.amountNotReturned == None, models.History.amountNotReturned <= 0),
        )
        .all()
    )
    for row in stale:
        row.amountNotReturned = 0
        row.turnback = True
        row.turnbackDate = moment

    db.add(models.History(
        itemId=item.id,
        userId=user_id,
        userName=user_name,
        personWhoTook=who,
        action=models.ActionEnum.no_volvio,
        amountRetired=missing,
        amountNotReturned=0,
        date=moment,
        place=UNPLACED_PLACE,
        note=reason,
        turnback=True,
        turnbackDate=moment,
        lastNotification=None,
    ))
    db.commit()
    return {"ok": True, "amount": missing, "reason": reason}


@router.post("/trasladar")
def trasladar_item(
    dto: trasladoDTO.TrasladoDTO,
    db: db_dependency,
    current_user: Annotated[dict, Depends(get_current_user)],
):
    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)

    from_place = (dto.fromPlace or "").strip()
    to_place = (dto.toPlace or "").strip()

    if from_place == REPAIR_PLACE or to_place == REPAIR_PLACE:
        raise HTTPException(400, "La reparación no es una obra")
    if not from_place or not to_place:
        raise HTTPException(400, "Origen y destino son obligatorios")
    to_place = require_active_obra(db, to_place)
    if from_place.lower() == to_place.lower():
        raise HTTPException(400, "El origen y el destino deben ser distintos")
    if dto.amount <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a 0")

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(404, "Item not found")

    if category_is_consumable(db, item.category):
        raise HTTPException(
            400,
            "Los materiales consumibles no se pueden trasladar entre obras",
        )

    chosen_unit = None
    code = (dto.code or "").strip()
    if code:
        try:
            chosen_unit = find_unit_by_code(db, code)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        if not chosen_unit or chosen_unit.item_id != item.id:
            raise HTTPException(400, "El código no pertenece a este artículo")

    if chosen_unit is not None:
        moved_units = [chosen_unit] if item.track_units else []
    else:
        moved_units = units_for_pending_place(db, item, from_place, dto.amount) if item.track_units else []

    pendientes_query = (
        db.query(models.History)
        .filter(
            models.History.itemId == dto.itemId,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.place == from_place,
            models.History.amountNotReturned > 0,
        )
    )
    if chosen_unit is not None:
        linked_ids = (
            db.query(models.HistoryUnit.history_id)
            .filter(models.HistoryUnit.unit_id == chosen_unit.id)
        )
        pendientes_query = pendientes_query.filter(models.History.id.in_(linked_ids))
    pendientes = pendientes_query.order_by(models.History.date.asc()).all()

    total_pendiente = sum(p.amountNotReturned or 0 for p in pendientes)
    if dto.amount > total_pendiente:
        raise HTTPException(
            status_code=400,
            detail=(
                f"No se pueden trasladar {dto.amount} unidades. "
                f"Solo {total_pendiente} están pendientes en {from_place}."
            ),
        )

    restante = dto.amount
    for p in pendientes:
        if restante <= 0:
            break
        if restante >= p.amountNotReturned:
            restante -= p.amountNotReturned
            p.amountNotReturned = 0
        else:
            p.amountNotReturned -= restante
            restante = 0
        if p.amountNotReturned == 0:
            p.turnback = True
            p.turnbackDate = now()

    quien_mueve = (
        dto.personWhoMoved.strip()
        if dto.personWhoMoved and dto.personWhoMoved.strip()
        else user_name
    )

    nuevo_retiro = models.History(
        itemId=dto.itemId,
        userId=user_id,
        userName=user_name,
        action=models.ActionEnum.retiro,
        personWhoTook=quien_mueve,
        amountRetired=dto.amount,
        amountNotReturned=dto.amount,
        date=now(),
        place=to_place,
        turnback=False,
        lastNotification=None,
        hideFromHistorial=True,
    )
    db.add(nuevo_retiro)
    db.flush()
    link_history_units(db, nuevo_retiro.id, moved_units)

    traslado = models.History(
        itemId=dto.itemId,
        userId=user_id,
        userName=user_name,
        action=models.ActionEnum.traslado,
        personWhoTook=quien_mueve,
        amountRetired=dto.amount,
        amountNotReturned=0,
        date=now(),
        place=f"{from_place} → {to_place}",
        turnback=True,
        turnbackDate=now(),
        lastNotification=None,
        hideFromHistorial=False,
    )
    db.add(traslado)
    db.flush()
    link_history_units(db, traslado.id, moved_units)

    db.commit()
    db.refresh(traslado)
    return traslado


@router.post("/remito", response_class=StreamingResponse)
def generate_remito(
    history_ids: list[int],
    db: db_dependency,
    with_image: bool = Query(False),
):
    split_grouped_returns(db)
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    logo_url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSaURTEFHsQ9YD0w_LhYjgHna9Hg-myPBBH3w&s"
    logo = None
    try:
        response = requests.get(logo_url)
        logo = Image.open(BytesIO(response.content))
    except Exception:
        pass

    def joined(values):
        seen = []
        for value in values:
            text = (value or "").strip()
            if text and text not in seen:
                seen.append(text)
        return " · ".join(seen) if seen else "—"

    def clip(text, font, size, max_width):
        raw = str(text or "")
        if p.stringWidth(raw, font, size) <= max_width:
            return raw
        trimmed = raw
        while trimmed and p.stringWidth(trimmed + "…", font, size) > max_width:
            trimmed = trimmed[:-1]
        return (trimmed + "…") if trimmed else ""

    def wrap_lines(text, font, size, max_width):
        raw = " ".join(str(text or "").split())
        if not raw:
            return [""]
        if max_width <= 0 or p.stringWidth(raw, font, size) <= max_width:
            return [raw]
        lines = []
        current = ""
        for word in raw.split(" "):
            while word and p.stringWidth(word, font, size) > max_width:
                cut = len(word)
                while cut > 1 and p.stringWidth(word[:cut], font, size) > max_width:
                    cut -= 1
                if current:
                    lines.append(current)
                    current = ""
                lines.append(word[:cut])
                word = word[cut:]
            if not word:
                continue
            trial = word if not current else f"{current} {word}"
            if p.stringWidth(trial, font, size) <= max_width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    def draw_document(rows, label):
        left = 1.6 * cm
        right = width - 1.6 * cm
        table_w = right - left
        head_h = 0.75 * cm
        thumb = 1.2 * cm
        photo_slot = (thumb + 0.15 * cm) if with_image else 0
        row_h = 1.7 * cm if with_image else 1.55 * cm
        columns = [1.1 * cm, 3.2 * cm, table_w - 12.1 * cm, 2.0 * cm, 5.8 * cm]
        headers = ["Nº", "Código", "Descripción", "Cantidad", "Quién, fecha y obra"]

        def header_block():
            y = height - 1.6 * cm
            if logo:
                p.drawInlineImage(logo, right - 2.4 * cm, height - 2.6 * cm, width=2.2 * cm, height=1.6 * cm, preserveAspectRatio=True, anchor="c")
            p.setFillColorRGB(0, 0, 0)
            p.setFont("Helvetica-Bold", 18)
            p.drawString(left, y, "REMITO")
            p.setFont("Helvetica", 10)
            p.drawRightString(right - (2.8 * cm if logo else 0), y, label)
            y -= 0.9 * cm
            dates = []
            for row in rows:
                if row["date"]:
                    dates.append(row["date"].strftime("%d/%m/%Y"))
            dates = sorted(set(dates))
            if len(dates) <= 1:
                when = dates[0] if dates else "—"
            else:
                when = f"{dates[0]} al {dates[-1]}"
            p.setFont("Helvetica", 10)
            p.drawString(left, y, f"Fecha: {when}")
            y -= 0.55 * cm
            p.drawString(left, y, f"Origen: {joined(row['shedName'] for row in rows)}")
            y -= 0.55 * cm
            discarded = bool(rows) and all(row.get("action") == "descarte" for row in rows)
            if discarded:
                def authorized(place):
                    text = (place or "").strip()
                    prefix = "Autorizado por "
                    if text.lower().startswith(prefix.lower()):
                        return text[len(prefix):].strip() or text
                    return text
                p.drawString(left, y, f"Tiró: {joined(row['personWhoTook'] for row in rows)}")
                y -= 0.55 * cm
                p.drawString(left, y, f"Autorizó: {joined(authorized(row['place']) for row in rows)}")
            else:
                p.drawString(left, y, f"Destino: {joined(row['place'] for row in rows)}")
                y -= 0.55 * cm
                p.drawString(left, y, f"Retira: {joined(row['personWhoTook'] for row in rows)}")
            y -= 0.8 * cm
            return y

        def draw_header_row(y):
            p.setFillColorRGB(0.93, 0.94, 0.95)
            p.rect(left, y - head_h, table_w, head_h, fill=1, stroke=0)
            p.setFillColorRGB(0, 0, 0)
            p.setFont("Helvetica-Bold", 8)
            x = left
            for index, title in enumerate(headers):
                p.drawString(x + 0.12 * cm, y - 0.48 * cm, clip(title, "Helvetica-Bold", 8, columns[index] - 0.24 * cm))
                x += columns[index]
            p.setStrokeColorRGB(0.75, 0.75, 0.75)
            p.rect(left, y - head_h, table_w, head_h, fill=0, stroke=1)
            return y - head_h

        y = header_block()
        y = draw_header_row(y)
        line_step = 0.38 * cm
        for index, row in enumerate(rows, start=1):
            when = row["date"].strftime("%d/%m/%Y") if row["date"] else "—"
            detail = [
                (row["personWhoTook"] or "").strip() or "—",
                when,
                (row["place"] or "").strip() or "—",
            ]
            desc_width = columns[2] - 0.24 * cm - photo_slot
            desc_lines = wrap_lines(row["description"], "Helvetica", 9, desc_width)
            text_height = 0.28 * cm + len(desc_lines) * line_step + 0.18 * cm
            this_h = max(row_h, text_height)
            if y - this_h < 3.2 * cm:
                p.showPage()
                y = header_block()
                y = draw_header_row(y)
            values = [
                str(index),
                clip(row["code"], "Helvetica", 9, columns[1] - 0.24 * cm),
                None,
                clip(str(row["amountRetired"] if row["amountRetired"] is not None else ""), "Helvetica", 9, columns[3] - 0.24 * cm),
            ]
            p.setFont("Helvetica", 9)
            x = left
            for col, value in enumerate(values):
                text_x = x + 0.12 * cm
                if col == 2:
                    if with_image:
                        image_path = row.get("image_path")
                        if image_path:
                            image_y = y - 0.22 * cm - thumb
                            if image_y < (y - this_h) + 0.12 * cm:
                                image_y = (y - this_h) + 0.12 * cm
                            try:
                                p.drawImage(
                                    image_path,
                                    text_x,
                                    image_y,
                                    width=thumb,
                                    height=thumb,
                                    preserveAspectRatio=True,
                                    anchor="c",
                                    mask="auto",
                                )
                            except Exception:
                                pass
                        text_x += photo_slot
                    for line_index, line in enumerate(desc_lines):
                        p.drawString(text_x, y - 0.45 * cm - line_index * line_step, line)
                elif value:
                    p.drawString(text_x, y - 0.48 * cm, value)
                x += columns[col]
            p.setFont("Helvetica", 8)
            for line, text in enumerate(detail):
                p.drawString(
                    x + 0.12 * cm,
                    y - 0.42 * cm - line * 0.42 * cm,
                    clip(text, "Helvetica", 8, columns[4] - 0.24 * cm),
                )
            p.setStrokeColorRGB(0.75, 0.75, 0.75)
            p.rect(left, y - this_h, table_w, this_h, fill=0, stroke=1)
            y -= this_h

        if y < 4.2 * cm:
            p.showPage()
            y = header_block()
        y -= 1.2 * cm
        p.setFont("Helvetica", 10)
        p.drawString(left, y, "Recibí conforme")
        y -= 1.3 * cm
        p.line(left, y, left + 7 * cm, y)
        p.setFont("Helvetica", 8)
        p.drawString(left, y - 0.45 * cm, "Firma y aclaración")
        p.showPage()

    histories = []
    for history_id in history_ids:
        record = (
            db.query(
                models.History,
                models.Item.name.label("itemName"),
                models.Shed.name.label("shedName"),
                models.Item.image_filename,
            )
            .join(models.Item, models.History.itemId == models.Item.id)
            .join(models.Shed, models.Item.shed_id == models.Shed.id)
            .filter(models.History.id == history_id)
            .first()
        )
        if record:
            history, item_name, shed_name, item_image = record
            link = (
                db.query(models.HistoryUnit, models.ItemUnit)
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(models.HistoryUnit.history_id == history.id)
                .all()
            )
            code = ""
            description = item_name
            if len(link) == 1:
                history_link, unit = link[0]
                code = unit.code or ""
                description = unit.name or item_name
                if history_link.amount is not None:
                    amount = history_link.amount
                else:
                    amount = piece_amount(db, history, history_link)
            else:
                amount = history.amountRetired
                if link:
                    code = ", ".join(unit.code for _, unit in link if unit.code)
            image_path = None
            if with_image:
                if len(link) == 1:
                    image_path = _existing_image(link[0][1].image_filename) or _existing_image(item_image)
                else:
                    image_path = _existing_image(item_image)
            histories.append({
                "code": code,
                "description": description,
                "personWhoTook": history.personWhoTook or history.userName,
                "amountRetired": amount,
                "place": history.place,
                "shedName": shed_name,
                "date": history.date,
                "action": history.action.value if history.action else None,
                "image_path": image_path,
            })

    draw_document(histories, "ORIGINAL")
    draw_document(histories, "COPIA")
    p.save()
    buffer.seek(0)

    return StreamingResponse(
        content=buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=remito.pdf", "Access-Control-Allow-Origin": "*" }
    )
