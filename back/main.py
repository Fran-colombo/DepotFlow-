from fastapi import FastAPI, HTTPException, Query, status, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
import models
import observations
import shed
import movements
import logging
import threading
import admin
from sqlalchemy.orm import Session, joinedload
from typing import Annotated, Optional
from datetime import datetime
from math import ceil
from database import get_db, engine
import pytz 
from dtos.itemResponseDTO import ItemResponseDTO
from dtos.deleteItemDTO import DeleteItemDTO, ResponseFakeDeleteDTO
import dtos.itemToCreateDTO as itemDTO
from historial import router
from auth import get_current_user, router as auth_router
from notifications import NotificationService, enviar_mail_fallo_borrado


logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)


app.include_router(router)
app.include_router(auth_router)
app.include_router(observations.router)
app.include_router(shed.router)
app.include_router(movements.router)
app.include_router(admin.router)

models.Base.metadata.create_all(bind=engine)


item_dependency = Annotated[Session, Depends(get_db)]

@app.on_event("startup")
def startup_event():
    if not hasattr(app, 'notification_thread'):
        app.notification_thread = threading.Thread(
            target=NotificationService.run_scheduler,
            daemon=True
        )
        app.notification_thread.start()

TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

def now():
    """Devuelve la fecha/hora actual en la zona horaria de Buenos Aires"""
    return datetime.now(TIMEZONE)



DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

@app.get("/", response_model=dict)
def read_items(
    db: Session = Depends(get_db),
    name: Optional[str] = None,
    category: Optional[str] = None,
    shed_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE)
):
    try:
        query = db.query(models.Item).filter(models.Item.status == 1)

        if name:
            query = query.filter(models.Item.name.ilike(f"%{name}%"))
        if category:
            query = query.filter(models.Item.category.ilike(f"%{category}%"))
        if shed_id:
            query = query.filter(models.Item.shed_id == shed_id)

        total_records = query.count()
        total_pages = ceil(total_records / page_size)

        items = query.order_by(models.Item.name.asc()) \
                     .offset((page - 1) * page_size) \
                     .limit(page_size) \
                     .all()

        return {
            "data": [ItemResponseDTO.model_validate(item) for item in items],
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
            detail=f"Error al obtener items: {str(e)}"
        )

@app.get("/search")
def searchItems(name: str, db: item_dependency):
    items = db.query(models.Item).filter(models.Item.name.ilike(f"%{name}%")).all()
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No items found with that name"
        )
    return items


def getItemById(item_id: int, db: item_dependency):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    return item.name


@app.post("/")
def createItem(item: itemDTO.ItemCreateDTO, db: item_dependency):
    nameWellWritten = item.name.lower().capitalize()
    existing = db.query(models.Item).filter(
        models.Item.name == nameWellWritten,
        models.Item.shed_id == item.shed_id
    ).first()

    if existing:
        if existing.status == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un elemento con el mismo nombre ya existe en ese galpón."
            )
        else:
            existing.name = f"{existing.name}__OLD_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            db.commit()

    deleted_with_same_name = db.query(models.DeletedItem).filter(
        models.DeletedItem.name == nameWellWritten
    ).order_by(models.DeletedItem.deleted_at.desc()).first()

    if deleted_with_same_name:
        logger.warning(f"Se está recreando un item previamente borrado: {nameWellWritten}")

    try:
        itemToAdd = models.Item(
            name=nameWellWritten,
            description=item.description,
            category=item.category,
            shed_id=item.shed_id,
            totalAmount=item.quantity,
            actualAmount=item.quantity,
            is_available=True,
            status=1,
        )
        db.add(itemToAdd)
        db.commit()
        db.refresh(itemToAdd)
        return itemToAdd
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating item: {str(e)}"
        )

@app.put("/items/by-id/{item_id}")
def update_item_by_id(
    item_id: int,
    item_update: itemDTO.ItemUpdateDTO,
    db: Session = Depends(get_db)
):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ítem con ID {item_id} no encontrado"
        )

    if item_update.quantity is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe especificar una cantidad"
        )

    if item_update.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La cantidad debe ser mayor a cero"
        )

    quantity_change = 0

    if item_update.action == itemDTO.ActionEnum.add:
        quantity_change = item_update.quantity
    elif item_update.action == itemDTO.ActionEnum.rest:
        quantity_change = -item_update.quantity
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Acción no válida"
        )

    new_total = item.totalAmount + quantity_change
    new_actual = item.actualAmount + quantity_change

    if new_total < 0 or new_actual < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay suficiente stock para realizar esta operación"
        )

    item.totalAmount = new_total
    item.actualAmount = new_actual
    db.commit()
    db.refresh(item)

    return item

@app.put("/")
def updateItem(name: str, quantity: int, db: item_dependency):
    item = db.query(models.Item).filter(models.Item.name == name).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    if quantity < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity cannot be negative"
        )
    item.totalAmount += quantity
    item.actualAmount += quantity
    db.commit()
    db.refresh(item)
    return item


@app.get("/items/{item_id}")
def get_item_details(
    item_id: int,
    db: item_dependency,
    current_user: Annotated[dict, Depends(get_current_user)]
):

    try:

        item = db.query(models.Item)\
            .options(
                joinedload(models.Item.observations),
                joinedload(models.Item.movements)
            )\
            .filter(models.Item.id == item_id)\
            .first()

        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item con ID {item_id} no encontrado"
            )

        is_deleted = item.status == 0

        deletion_history = None
        if is_deleted:
            deletion_history = db.query(models.DeletedItem)\
                .filter(models.DeletedItem.original_id == item_id)\
                .order_by(models.DeletedItem.deleted_at.desc())\
                .first()

        response_data = {
            "item": jsonable_encoder(item),
            "metadata": {
                "is_deleted": is_deleted,
                "deletion_info": {
                    "deletion_reason": deletion_history.deletion_reason if deletion_history else None,
                    "deleted_at": deletion_history.deleted_at if deletion_history else None
                } if is_deleted else None,
                "permissions": {
                    "can_edit": current_user["role"] in ["admin", "editor"],
                    "can_delete": current_user["role"] == "admin"
                }
            },
            "relations": {
                "observations_count": len(item.observations),
                "movements_count": len(item.movements),
                "last_movement": max([mov.date for mov in item.movements]) if item.movements else None
            }
        }

        return response_data



    except Exception as e:
        logger.error(f"Error obteniendo detalles del item {item_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al obtener detalles del ítem"
        )



@app.delete("/")
def delete_product(
    item_delete: DeleteItemDTO,
    db: item_dependency,
    current_user: Annotated[dict, Depends(get_current_user)]
):
    item = db.query(models.Item).filter(models.Item.id == item_delete.item_id).first()
    item_name = item.name if item else "desconocido"
    can_delete = item.actualAmount == item.totalAmount

    if current_user["role"] != "admin":
        fake_dto = ResponseFakeDeleteDTO(
            item_id=item_delete.item_id,
            description=item_delete.description,
            date=item_delete.date,
            username=current_user["username"]
        )
        enviar_mail_fallo_borrado(fake_dto, item_name)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenés permisos para borrar este ítem."
        )

    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    if not can_delete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Estas queriendo eliminar un producto cuando en este momento hay parte de ese producto en una obra."
        )

    # Registrar el borrado
    deleted_item = models.DeletedItem(
        item_id=item.id,
        name=item.name,
        description=item.description,
        category=item.category,
        status=item.status,
        deletion_reason=item_delete.description,
        deleted_at=now(),
        # original_id=item.id
    )
    db.add(deleted_item)

    # Eliminar todas las observaciones asociadas al item
    db.query(models.Observation).filter(
        models.Observation.item_id == item.id
    ).delete()

    # Marcar el item como borrado y cambiar su nombre
    item.status = 0
    item.name = f"{item.name}__DELETED_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    db.commit()

    return {"message": f"Item {item_delete.item_id} borrado exitosamente"}


@app.get("/deleted-items", response_model=dict)
def get_deleted_items(
    name: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, le=MAX_PAGE_SIZE),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.DeletedItem)

        if name:
            query = query.filter(models.DeletedItem.name.ilike(f"%{name}%"))

        if category:
            query = query.filter(models.DeletedItem.category.ilike(f"%{category}%"))

        if from_date:
            query = query.filter(models.DeletedItem.deleted_at >= from_date)

        if to_date:
            query = query.filter(models.DeletedItem.deleted_at <= to_date)

        total_records = query.count()
        total_pages = ceil(total_records / page_size)

        deleted_items = (
            query.order_by(models.DeletedItem.deleted_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        items_data = [
            {
                "id": item.id,
                "item_id": item.item_id,
                "name": item.name,
                "category": item.category,
                "description": item.description,
                "deletion_reason": item.deletion_reason,
                "deleted_at": item.deleted_at
            }
            for item in deleted_items
        ]

        return {
            "data": items_data,  # Ahora tiene la misma estructura que antes
            "pagination": {
                "total_records": total_records,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al obtener ítems eliminados: {str(e)}"
        )