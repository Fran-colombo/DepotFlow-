# from sqlalchemy import create_engine
# from sqlalchemy.orm import sessionmaker
# from sqlalchemy.ext.declarative import declarative_base

# SQLALCHEMY_DATABASE_URL = "sqlite:///./shed.db"

# engine = create_engine(
#     SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
# )
# SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base = declarative_base()

# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

# database.py
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = "C:\\Users\\Francesco\\Desktop\\TUP\\gestorInventarioGalpon\\shed_data\\shed.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"


engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return False
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def ensure_zone_schema():
    """Apply additive schema changes create_all cannot do on existing SQLite tables."""
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS zones (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR NOT NULL,
                shed_id INTEGER NOT NULL,
                FOREIGN KEY(shed_id) REFERENCES sheds (id),
                CONSTRAINT uq_zone_shed_name UNIQUE (shed_id, name)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_zones_id ON zones (id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_zones_name ON zones (name)"
        ))

    if not _column_exists("items", "zone_id"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE items ADD COLUMN zone_id INTEGER REFERENCES zones(id)"))

    if not _column_exists("movements", "from_zone_id"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE movements ADD COLUMN from_zone_id INTEGER REFERENCES zones(id)"
            ))

    if not _column_exists("movements", "to_zone_id"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE movements ADD COLUMN to_zone_id INTEGER REFERENCES zones(id)"
            ))
