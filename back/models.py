from datetime import datetime
from sqlalchemy import Boolean, Column, Integer, String, DateTime, Enum, ForeignKey
from database import Base
import enum
from sqlalchemy.orm import relationship


class ActionEnum(enum.Enum):
    retiro = "retiro"
    devolucion = "devolucion"
    carga = "carga"

class RoleEnum(enum.Enum):
     admin = "admin"
     user = "user"

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    category = Column(String, index=True)
    description = Column(String, index=True)
    totalAmount = Column(Integer, index=True)
    actualAmount = Column(Integer, nullable=False)
    is_available = Column(Boolean, default=True)
    shed_id = Column(Integer, ForeignKey("sheds.id"))
    shed = relationship("Shed", back_populates="items")
    status = Column(Integer, default=1)  

    
    observations = relationship("Observation", back_populates="item")
    movements = relationship("Movement", back_populates="item")

class Observation(Base):
    __tablename__ = "observations"
    
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"))
    description = Column(String, nullable=False)
    date = Column(DateTime, nullable=False, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"))
    user_name = Column(String, index=True)
    
    item = relationship("Item", back_populates="observations")
    user = relationship("User")

class User(Base):
        __tablename__ = "users"

        id = Column(Integer, primary_key=True, index=True)
        name = Column(String, index=True)
        surname = Column(String, index=True)
        email = Column(String, unique=True, index=True)
        password = Column(String, index=True)
        role = Column(Enum(RoleEnum), index=True)
        status = Column(Integer, default=1)

class History(Base):
    __tablename__ = "historal"

    id = Column(Integer, primary_key=True, index=True)
    itemId = Column(Integer, ForeignKey("items.id"))
    userId = Column(Integer, ForeignKey("users.id"))
    userName = Column(String, index=True)
    personWhoTook = Column(String, nullable=True)  
    action = Column(Enum(ActionEnum), index=True)
    amountRetired = Column(Integer, nullable=True)
    amountNotReturned = Column(Integer, index=True)
    date = Column(DateTime, nullable=False)
    place = Column(String, index=True)
    turnback = Column(Boolean, default=False)
    turnbackDate = Column(DateTime, nullable=True)
    lastNotification = Column(DateTime, nullable=True)
    item = relationship("Item") 

class Movement(Base):
    __tablename__ = "movements"
    
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("items.id"))
    item_name = Column(String)
    from_shed_id = Column(Integer, ForeignKey("sheds.id"))
    to_shed_id = Column(Integer, ForeignKey("sheds.id"))
    quantity = Column(Integer)
    username = Column(String)
    date = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"))  
    
    item = relationship("Item", back_populates="movements")
    user = relationship("User")
    from_shed = relationship("Shed", foreign_keys=[from_shed_id])
    to_shed = relationship("Shed", foreign_keys=[to_shed_id])


class Shed(Base):
    __tablename__ = "sheds"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    items = relationship("Item", back_populates="shed")

class DeletedItem(Base):
    __tablename__ = "deleted_items"
    
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, index=True)
    name = Column(String)
    description = Column(String)
    category = Column(String)
    status = Column(Integer)  
    deletion_reason = Column(String)
    deleted_at = Column(DateTime, default=datetime.utcnow)