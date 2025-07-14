from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload
from typing import List
from models import Item, Movement, Observation
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
    
    return source_item
def execute_movement(db: Session, movement_data: MovementCreateDTO, user_id: int, source_item: Item):
    try:
        # 1. Validación de stock
        if source_item.actualAmount < movement_data.quantity:
            raise HTTPException(status_code=400, detail="Stock insuficiente")

        # 2. Reducir stock en origen
        source_item.actualAmount -= movement_data.quantity
        source_item.totalAmount -= movement_data.quantity

        # 3. Verificar si el item origen tiene observaciones
        has_observations = db.query(Observation).filter(
            Observation.item_id == source_item.id
        ).count() > 0

        # 4. Buscar item destino compatible (mismo tipo y mismo estado de observaciones)
        target_item = db.query(Item).filter(
            Item.name == source_item.name,
            Item.category == source_item.category,
            Item.shed_id == movement_data.to_shed_id,
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
            quantity=movement_data.quantity,
            user_id=user_id,
            username=movement_data.username
        )
        db.add(movement)
        db.commit()

        return {
            "id": movement.id,
            "item_id_origen": movement.item_id,
            "item_id_destino": target_item.id,
            "item_name": movement.item_name,
            "quantity": movement.quantity,
            "date": movement.date.isoformat(),
            "from_shed_id": movement.from_shed_id,
            "from_shed_name": movement.from_shed.name if movement.from_shed else "Desconocido",
            "to_shed_id": movement.to_shed_id,
            "to_shed_name": movement.to_shed.name if movement.to_shed else "Desconocido",
            "user_id": movement.user_id,
            "username": movement.username
        }

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
        
        source_item = validate_movement(db, movement)
        
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
            source_item=source_item
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
        joinedload(Movement.to_shed)
    )

    movements = query.order_by(Movement.date.desc()).all()

    response = [
        MovementResponseDTO(
            id=m.id,
            item_id_origen=m.item_id,
            item_name=m.item_name,
            quantity=m.quantity,
            date=m.date.isoformat(),  
            from_shed_id=m.from_shed_id,
            from_shed_name=m.from_shed.name if m.from_shed else "Desconocido",
            to_shed_id=m.to_shed_id,
            to_shed_name=m.to_shed.name if m.to_shed else "Desconocido",
            user_id=m.user_id,
            username=m.username 
        )
        for m in movements
    ]

    return response




@router.get("/by-item/{item_id}", response_model=List[MovementResponseDTO])
def get_movements_by_item_id(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == item_id).first()
    print(item)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    items = db.query(Item).filter(Item.name == item.name, Item.category == item.category).all()
    item_ids = [i.id for i in items]

    movements = db.query(Movement).filter(Movement.item_id.in_(item_ids)).order_by(Movement.date.desc()).all()

    response = [
        MovementResponseDTO(
            id=m.id,
            item_id_origen=m.item_id,
            item_name=m.item_name,
            quantity=m.quantity,
            date=m.date.isoformat(),
            from_shed_id=m.from_shed_id,
            from_shed_name=m.from_shed.name if m.from_shed else "Desconocido",
            to_shed_id=m.to_shed_id,
            to_shed_name=m.to_shed.name if m.to_shed else "Desconocido",
            user_id=m.user_id,
            username=m.username
        ) for m in movements
    ]
    return response
