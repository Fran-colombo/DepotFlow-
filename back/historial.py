from datetime import datetime
from fastapi import Depends, HTTPException, status, APIRouter
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



router = APIRouter(
    prefix="/historical",
    tags=["historical"]
)


db_dependency = Annotated[Session, Depends(get_db)] 

TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

def now():
    """Devuelve la fecha/hora actual en la zona horaria de Buenos Aires"""
    return datetime.now(TIMEZONE)


DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100


@router.get("/", response_model=dict)
def read_history(
    db: db_dependency,
    item_name: Optional[str] = None,
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
        )

        if item_name:
            query = query.filter(
                or_(
                    models.Item.name.ilike(f"%{item_name}%"),
                    original_name.ilike(f"%{item_name}%")
                )
            )
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
                    shed_name=shed_name
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
            place, {"place": place, "pending_amount": 0, "persons": []}
        )
        entry["pending_amount"] += int(history.amountNotReturned or 0)
        person = (history.personWhoTook or history.userName or "").strip()
        if person and person not in entry["persons"]:
            entry["persons"].append(person)

    return [
        {
            "place": data["place"],
            "pending_amount": data["pending_amount"],
            "personWhoTook": ", ".join(data["persons"]) if data["persons"] else None,
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
    
    if item.actualAmount < dto.amount:
        raise HTTPException(400, "No hay suficiente stock")
    

    quien_tomo = user_name  
    if dto.personWhoTook and dto.personWhoTook.strip():  
        quien_tomo = dto.personWhoTook.strip()
    
    if item.category == "Materiales consumibles":

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
        db.commit()
        db.refresh(history)
        return history
    
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
    db.commit()
    db.refresh(history)
    return history

@router.post("/devolver")
def devolver_item(dto: devolucionDTO.DevolucionDTO, db: db_dependency, current_user: Annotated[dict, Depends(get_current_user)]):
    user_id = current_user["user_id"]
    user_name = get_user_name_by_id(db, user_id)

    item = db.query(models.Item).filter(models.Item.id == dto.itemId).first()
    if not item:
        raise HTTPException(404, "Item not found")

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

    total_pendiente = sum(p.amountNotReturned for p in pendientes)
    if dto.amount > total_pendiente:
        raise HTTPException(
            status_code=400,
            detail=f"No se pueden devolver {dto.amount} unidades. Solo {total_pendiente} están pendientes en este lugar."
        )

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
    db.commit()
    db.refresh(history)
    
    return history


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

    if item.category == "Materiales consumibles":
        raise HTTPException(
            400,
            "Los materiales consumibles no se pueden trasladar entre obras",
        )

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
    )
    db.add(nuevo_retiro)

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
    )
    db.add(traslado)

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
