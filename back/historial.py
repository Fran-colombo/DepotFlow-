from datetime import datetime
from fastapi import Depends, HTTPException, status, APIRouter
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import Annotated, Optional
from dtos.historialDTO import HistoryResponseDTO
import models
from database import get_db
from auth import get_current_user, get_user_name_by_id
import dtos.retiroDTO as retiroDTO
import dtos.turnBackDTO as devolucionDTO
import dtos.trasladoDTO as trasladoDTO
from dtos.historialDTO import HistoryResponseWithDetailsDTO
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
from item_service import ItemServiceError
from unit_service import (
    apply_inner_return,
    find_unit_by_code,
    link_history_units,
    restore_units,
    take_inner_quantity,
    take_units_out,
    units_for_pending_place,
)



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
    user_name: Optional[str] = None,
    person_who_took: Optional[str] = None,
    place: Optional[str] = None,
    action: Optional[str] = None,
    item_category: Optional[str] = None,
    shedId: Optional[int] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE)
):
    try:
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
                models.Shed.name.label("shedName")
            )
            .join(models.Item, models.History.itemId == models.Item.id)
            .join(models.Shed, models.Item.shed_id == models.Shed.id)
            .filter(
                (models.History.hideFromHistorial.is_(False))
                | (models.History.hideFromHistorial.is_(None))
            )
        )

        if item_name:
            query = query.filter(
                or_(
                    models.Item.name.ilike(f"%{item_name}%"),
                    original_name.ilike(f"%{item_name}%")
                )
            )
        if item_id is not None:
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

        total_records = query.count()
        total_pages = ceil(total_records / page_size)

        records = query.order_by(models.History.date.desc()) \
                      .offset((page - 1) * page_size) \
                      .limit(page_size) \
                      .all()

        history_ids = [history.id for history, *_rest in records]
        pieces_by_history = {}
        if history_ids:
            links = (
                db.query(models.HistoryUnit.history_id, models.ItemUnit.code, models.ItemUnit.name)
                .join(models.ItemUnit, models.ItemUnit.id == models.HistoryUnit.unit_id)
                .filter(models.HistoryUnit.history_id.in_(history_ids))
                .order_by(models.ItemUnit.code.asc())
                .all()
            )
            for history_id, code, piece_name in links:
                pieces_by_history.setdefault(history_id, []).append(
                    {"code": code, "name": piece_name}
                )

        return {
            "data": [
                HistoryResponseWithDetailsDTO(
                    id=history.id,
                    itemId=history.itemId,
                    itemName=item_name_db,
                    userId=history.userId,
                    userName=history.userName,
                    personWhoTook=history.personWhoTook or history.userName,
                    action=history.action,
                    amountRetired=history.amountRetired,
                    amountNotReturned=history.amountNotReturned,
                    date=history.date,
                    place=history.place,
                    turnback=history.turnback,
                    turnbackDate=history.turnbackDate,
                    itemCategory=category,
                    shedId=shed_id,
                    shed_name=shed_name,
                    pieces=pieces_by_history.get(history.id) or [],
                )
                for history, item_name_db, category, shed_id, shed_name in records
            ],
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
            models.History.turnback == False
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
        if not place:
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

    from obras import require_active_obra
    dto.place = require_active_obra(db, dto.place)

    if item.actualAmount < dto.amount:
        raise HTTPException(400, "No hay suficiente stock")
    

    quien_tomo = user_name  
    if dto.personWhoTook and dto.personWhoTook.strip():  
        quien_tomo = dto.personWhoTook.strip()

    no_return = category_is_consumable(db, item.category) or bool(dto.noReturn)
    units = []
    if item.inner_quantity:
        if not dto.codes or len(dto.codes) != 1:
            raise HTTPException(400, "Elegí el código")
        try:
            unit = find_unit_by_code(db, dto.codes[0])
            if not unit or unit.item_id != item.id:
                raise ItemServiceError("El código no pertenece a este artículo")
            units = [take_inner_quantity(unit, dto.amount, consume=no_return)]
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
    elif item.track_units:
        try:
            units = take_units_out(db, item, dto.amount, dto.codes, consume=no_return)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
    
    if no_return:

        history = models.History(
            itemId=dto.itemId,
            userId=user_id,
            userName=user_name,
            action=models.ActionEnum.retiro,
            personWhoTook=quien_tomo,  
            amountRetired=dto.amount,
            amountNotReturned=None ,
            date=now(),
            place=dto.place,
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
    turnback=False,
    lastNotification=None
    )
    

    db.add(history)
    db.flush()
    link_history_units(db, history.id, units)
    db.commit()
    db.refresh(history)
    return _history_with_codes(history, units)

@router.post("/devolver")
def devolver_item(dto: devolucionDTO.DevolucionDTO, db: db_dependency, current_user: Annotated[dict, Depends(get_current_user)]):
    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(404, "Item not found")

    units = []
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
            raise HTTPException(
                status_code=400,
                detail=f"En esa obra hay {total_pending}",
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
                units.append(unit)
        except ItemServiceError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message)
        item.actualAmount = (item.actualAmount or 0) + dto.amount
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
                    detail=f"No hay una salida pendiente de {unit.code} en esa obra",
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

    quien_devuelve = dto.personWhoReturned.strip() if dto.personWhoReturned and dto.personWhoReturned.strip() else user_name

    
    history = models.History(
        itemId=dto.itemId,
        userId=user_id,
        userName=user_name,
        action=models.ActionEnum.devolucion,
        amountRetired=dto.amount,
        date=now(),
        turnback=True,
        turnbackDate=now(),
        place=dto.place,
        personWhoTook=quien_devuelve,
        lastNotification=None
    )

    db.add(history)
    db.flush()
    link_history_units(db, history.id, units)
    db.commit()
    db.refresh(history)
    
    return _history_with_codes(history, units)


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

    if not from_place or not to_place:
        raise HTTPException(400, "Origen y destino son obligatorios")
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

    moved_units = units_for_pending_place(db, item, from_place, dto.amount) if item.track_units else []

    pendientes = (
        db.query(models.History)
        .filter(
            models.History.itemId == dto.itemId,
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,
            models.History.place == from_place,
            models.History.amountNotReturned > 0,
        )
        .order_by(models.History.date.asc())
        .all()
    )

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
    db: db_dependency
):
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

    def draw_page(histories, label):
        y = height - 2 * cm
        if logo:
            p.drawInlineImage(logo, width - 5*cm, height - 6*cm, width=3.5*cm, preserveAspectRatio=True)

        p.setFont("Helvetica-Bold", 16)
        p.drawString(2*cm, y, f"Remito de Entrega de Materiales - {label}")
        y -= 2 * cm

        p.setFont("Helvetica", 10)
        for history in histories:
            p.drawString(2*cm, y, f"Ítem: {history['itemName']}")
            y -= 0.5 * cm
            p.drawString(2*cm, y, f"Entregado por: {history['personWhoTook']}")
            y -= 0.5 * cm
            p.drawString(2*cm, y, f"Cantidad: {history['amountRetired']}")
            y -= 0.5 * cm
            p.drawString(2*cm, y, f"Lugar: {history['place']}")
            y -= 0.5 * cm
            p.drawString(2*cm, y, f"Depósito: {history['shedName']}")
            y -= 0.5 * cm
            p.drawString(2*cm, y, f"Fecha: {history['date'].strftime('%d/%m/%Y %H:%M')}")
            y -= 1 * cm

        p.drawString(2*cm, y, "Firma y Aclaración: ________________________________")

    # Obtener datos de los historiales
    histories = []
    for history_id in history_ids:
        record = (
            db.query(
                models.History,
                models.Item.name.label("itemName"),
                models.Shed.name.label("shedName")
            )
            .join(models.Item, models.History.itemId == models.Item.id)
            .join(models.Shed, models.Item.shed_id == models.Shed.id)
            .filter(models.History.id == history_id)
            .first()
        )
        if record:
            history, item_name, shed_name = record
            histories.append({
                "itemName": item_name,
                "personWhoTook": history.personWhoTook,
                "amountRetired": history.amountRetired,
                "place": history.place,
                "shedName": shed_name,
                "date": history.date,
            })

    draw_page(histories, "ORIGINAL")
    p.showPage()
    draw_page(histories, "COPIA")
    p.save()
    buffer.seek(0)

    return StreamingResponse(
        content=buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=remito.pdf", "Access-Control-Allow-Origin": "*" }
    )
