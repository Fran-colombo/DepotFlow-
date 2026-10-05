from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
from models import ActionEnum, History, Item, Movement, Observation, Shed, User, Zone
from auth import get_current_user
from dtos.movementsDTO import MovementCreateDTO, MovementResponseDTO
from database import get_db
from contextlib import contextmanager
from item_images import copy_item_image
from item_service import ItemServiceError
from unit_service import (
    STATUS_EN_STOCK,
    link_history_units,
    move_stock_units,
    select_relocatable_units,
    unit_out_quantity,
)
import logging

router = APIRouter(prefix="/movements", tags=["movements"])

logger = logging.getLogger(__name__)

@contextmanager
def transaction_manager(db: Session):
    """Manejador de transacciones seguro"""
    if db.in_transaction():
        yield  
    else:
        with db.begin():
            yield 


def _zone_label(zone) -> str:
    return zone.name if zone else "Sin zona"


def _location_label(db: Session, shed_id, zone_id) -> str:
    shed = db.query(Shed).filter(Shed.id == shed_id).first() if shed_id else None
    zone = db.query(Zone).filter(Zone.id == zone_id).first() if zone_id else None
    shed_name = shed.name if shed else "Sin galpón"
    zone_name = zone.name if zone else "Sin zona"
    return f"{shed_name} / {zone_name}"


def _movement_response(m: Movement, item_id_destino=None) -> MovementResponseDTO:
    return MovementResponseDTO(
        id=m.id,
        item_id_origen=m.item_id,
        item_id_destino=item_id_destino,
        item_name=m.item_name,
        quantity=m.quantity,
        date=m.date.isoformat() if m.date else "",
        from_shed_id=m.from_shed_id,
        from_shed_name=m.from_shed.name if m.from_shed else "Desconocido",
        to_shed_id=m.to_shed_id,
        to_shed_name=m.to_shed.name if m.to_shed else "Desconocido",
        from_zone_id=m.from_zone_id,
        to_zone_id=m.to_zone_id,
        from_zone_name=_zone_label(m.from_zone),
        to_zone_name=_zone_label(m.to_zone),
        user_id=m.user_id,
        username=m.username,
    )


def validate_movement(db: Session, movement_data: MovementCreateDTO):
    """Valida que el movimiento sea posible"""
    source_item = db.query(Item).filter(
        Item.id == movement_data.item_id,
        Item.shed_id == movement_data.from_shed_id
    ).first()
    
    if not source_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ítem no encontrado en el galpón {movement_data.from_shed_id}"
        )
    
    if source_item.actualAmount < movement_data.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stock insuficiente. Disponible: {source_item.actualAmount}"
        )

    to_shed = db.query(Shed).filter(Shed.id == movement_data.to_shed_id).first()
    if not to_shed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Galpón destino no encontrado",
        )

    to_zone = db.query(Zone).filter(Zone.id == movement_data.to_zone_id).first()
    if not to_zone:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Zona destino no encontrada",
        )

    if to_zone.shed_id != movement_data.to_shed_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La zona destino no pertenece al galpón destino",
        )

    from_zone_id = movement_data.from_zone_id
    if from_zone_id is None:
        from_zone_id = source_item.zone_id

    if (
        movement_data.from_shed_id == movement_data.to_shed_id
        and from_zone_id == movement_data.to_zone_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El origen y el destino son iguales",
        )
    
    return source_item, from_zone_id


def execute_movement(db: Session, movement_data: MovementCreateDTO, user_id: int, source_item: Item, from_zone_id):
    try:
        moved_units = []
        depot_count = movement_data.quantity
        moved_count = movement_data.quantity
        if source_item.inner_quantity and not movement_data.codes:
            raise HTTPException(status_code=400, detail="Elegí los códigos a mover")
        if source_item.track_units and movement_data.codes:
            moved_units = select_relocatable_units(db, source_item, movement_data.codes)
            if source_item.inner_quantity:
                depot_count = sum(int(unit.quantity or 0) for unit in moved_units)
                moved_count = depot_count + sum(unit_out_quantity(db, unit) for unit in moved_units)
            else:
                depot_count = sum(1 for unit in moved_units if unit.status == STATUS_EN_STOCK)
                moved_count = len(moved_units)
            if len(moved_units) != movement_data.quantity:
                raise HTTPException(
                    status_code=400,
                    detail="La cantidad no coincide con las piezas elegidas",
                )
            if (source_item.actualAmount or 0) < depot_count or (source_item.totalAmount or 0) < moved_count:
                raise HTTPException(status_code=400, detail="Stock insuficiente")
        elif (source_item.actualAmount or 0) < movement_data.quantity:
            raise HTTPException(status_code=400, detail="Stock insuficiente")

        source_item.actualAmount -= depot_count
        source_item.totalAmount -= moved_count

        has_observations = db.query(Observation).filter(
            Observation.item_id == source_item.id
        ).count() > 0

        target_query = db.query(Item).filter(
            Item.name == source_item.name,
            Item.category == source_item.category,
            Item.zone_id == movement_data.to_zone_id,
            Item.status == 1,
        )
        if not moved_units:
            target_query = target_query.filter(
                exists().where(Observation.item_id == Item.id) if has_observations
                else ~exists().where(Observation.item_id == Item.id)
            )
        target_item = target_query.first()

        if target_item:
            target_item.actualAmount += depot_count
            target_item.totalAmount += moved_count
            if moved_units:
                target_item.track_units = True
            if source_item.inner_quantity:
                target_item.inner_quantity = True
            db.refresh(source_item, attribute_names=["image_filename"])
            copy_item_image(source_item, target_item)
        else:
            target_item = Item(
                name=source_item.name,
                description=source_item.description,
                category=source_item.category,
                shed_id=movement_data.to_shed_id,
                zone_id=movement_data.to_zone_id,
                totalAmount=moved_count,
                actualAmount=depot_count,
                is_available=True,
                status=1,
                track_units=bool(source_item.track_units),
                inner_quantity=bool(source_item.inner_quantity),
                code_prefix=source_item.code_prefix,
            )
            db.add(target_item)
            db.flush()
            db.refresh(target_item)
            db.refresh(source_item, attribute_names=["image_filename"])
            copy_item_image(source_item, target_item)

            if has_observations:
                observations = db.query(Observation).filter(
                    Observation.item_id == source_item.id,
                    Observation.unit_id.is_(None),
                ).all()
                for obs in observations:
                    new_obs = Observation(
                        item_id=target_item.id,
                        description=obs.description,
                        user_id=obs.user_id,
                        user_name=obs.user_name,
                        observed_by=obs.observed_by,
                        date=obs.date
                    )
                    db.add(new_obs)

        
        if source_item.actualAmount == 0 and has_observations and not moved_units:
            db.query(Observation).filter(
                Observation.item_id == source_item.id
            ).delete()

        relocated = moved_units
        if moved_units:
            for unit in moved_units:
                unit.item_id = target_item.id
                db.query(Observation).filter(Observation.unit_id == unit.id).update(
                    {Observation.item_id: target_item.id},
                    synchronize_session=False,
                )
        else:
            relocated = move_stock_units(db, source_item, target_item, movement_data.quantity) or []

        if relocated:
            user = db.query(User).filter(User.id == user_id).first()
            user_name = f"{user.name} {user.surname}".strip() if user else (movement_data.username or "")
            moment = datetime.utcnow()
            origin = _location_label(db, movement_data.from_shed_id, from_zone_id)
            destination = _location_label(db, movement_data.to_shed_id, movement_data.to_zone_id)
            piece_history = History(
                itemId=source_item.id,
                userId=user_id,
                userName=user_name,
                personWhoTook=(movement_data.username or "").strip() or user_name,
                action=ActionEnum.traslado,
                amountRetired=len(relocated),
                amountNotReturned=0,
                date=moment,
                place=f"{origin} → {destination}",
                turnback=True,
                turnbackDate=moment,
                hideFromHistorial=False,
            )
            db.add(piece_history)
            db.flush()
            link_history_units(db, piece_history.id, relocated)

        movement = Movement(
            item_id=source_item.id,
            item_name=source_item.name,
            from_shed_id=movement_data.from_shed_id,
            to_shed_id=movement_data.to_shed_id,
            from_zone_id=from_zone_id,
            to_zone_id=movement_data.to_zone_id,
            quantity=moved_count,
            user_id=user_id,
            username=movement_data.username
        )
        db.add(movement)
        db.commit()

        movement = (
            db.query(Movement)
            .options(
                joinedload(Movement.from_shed),
                joinedload(Movement.to_shed),
                joinedload(Movement.from_zone),
                joinedload(Movement.to_zone),
            )
            .filter(Movement.id == movement.id)
            .first()
        )

        return _movement_response(movement, item_id_destino=target_item.id)

    except HTTPException:
        db.rollback()
        raise
    except ItemServiceError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        db.rollback()
        logger.error(f"Error en movimiento: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar movimiento: {str(e)}"
        )

@router.post("/", response_model=MovementResponseDTO)
def create_movement(
    movement: MovementCreateDTO,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        logger.debug(f"Datos recibidos: {movement.dict()}")
        logger.debug(f"Usuario actual: {current_user}")
        
        source_item, from_zone_id = validate_movement(db, movement)
        
        user_id = current_user.get('user_id')
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se pudo identificar al usuario"
            )
        
        result = execute_movement(
            db=db,
            movement_data=movement,
            user_id=user_id,
            source_item=source_item,
            from_zone_id=from_zone_id,
        )
        
        logger.debug(f"Resultado del movimiento: {result}")
        return result
        
    except HTTPException as he:
        raise
    except Exception as e:
        logger.error(f"Error inesperado en create_movement: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al procesar la solicitud"
        )



@router.get("/", response_model=List[MovementResponseDTO])
def get_movements(db: Session = Depends(get_db)):
    query = db.query(Movement).options(
        joinedload(Movement.from_shed),
        joinedload(Movement.to_shed),
        joinedload(Movement.from_zone),
        joinedload(Movement.to_zone),
    )

    movements = query.order_by(Movement.date.desc()).all()
    return [_movement_response(m) for m in movements]



@router.get("/by-item/{item_id}", response_model=List[MovementResponseDTO])
def get_movements_by_item_id(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    items = db.query(Item).filter(Item.name == item.name, Item.category == item.category).all()
    item_ids = [i.id for i in items]

    movements = (
        db.query(Movement)
        .options(
            joinedload(Movement.from_shed),
            joinedload(Movement.to_shed),
            joinedload(Movement.from_zone),
            joinedload(Movement.to_zone),
        )
        .filter(Movement.item_id.in_(item_ids))
        .order_by(Movement.date.desc())
        .all()
    )

    return [_movement_response(m) for m in movements]
