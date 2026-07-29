from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload
from typing import List
from models import Item, Movement, Observation, Zone, Shed
from auth import get_current_user
from dtos.movementsDTO import MovementCreateDTO, MovementResponseDTO
from database import get_db
from contextlib import contextmanager
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
        if source_item.actualAmount < movement_data.quantity:
            raise HTTPException(status_code=400, detail="Stock insuficiente")

        source_item.actualAmount -= movement_data.quantity
        source_item.totalAmount -= movement_data.quantity

        has_observations = db.query(Observation).filter(
            Observation.item_id == source_item.id
        ).count() > 0

        target_item = db.query(Item).filter(
            Item.name == source_item.name,
            Item.category == source_item.category,
            Item.zone_id == movement_data.to_zone_id,
            Item.status == 1,
            exists().where(Observation.item_id == Item.id) if has_observations 
            else ~exists().where(Observation.item_id == Item.id)
        ).first()

        if target_item:
            target_item.actualAmount += movement_data.quantity
            target_item.totalAmount += movement_data.quantity
        else:
            target_item = Item(
                name=source_item.name,
                description=source_item.description,
                category=source_item.category,
                shed_id=movement_data.to_shed_id,
                zone_id=movement_data.to_zone_id,
                totalAmount=movement_data.quantity,
                actualAmount=movement_data.quantity,
                is_available=True,
                status=1
            )
            db.add(target_item)
            db.flush()

            if has_observations:
                observations = db.query(Observation).filter(
                    Observation.item_id == source_item.id
                ).all()
                for obs in observations:
                    new_obs = Observation(
                        item_id=target_item.id,
                        description=obs.description,
                        user_id=obs.user_id,
                        user_name=obs.user_name,
                        date=obs.date
                    )
                    db.add(new_obs)

        
        if source_item.actualAmount == 0 and has_observations:
            db.query(Observation).filter(
                Observation.item_id == source_item.id
            ).delete()

        
        movement = Movement(
            item_id=source_item.id,
            item_name=source_item.name,
            from_shed_id=movement_data.from_shed_id,
            to_shed_id=movement_data.to_shed_id,
            from_zone_id=from_zone_id,
            to_zone_id=movement_data.to_zone_id,
            quantity=movement_data.quantity,
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
