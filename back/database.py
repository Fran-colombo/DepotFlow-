from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent


def _default_db_path() -> Path:
    # Docker volume mount (see docker-compose)
    docker_path = Path("/app/shed_data/shed.db")
    if Path("/app/shed_data").is_dir() or os.getenv("DOCKER", "").lower() in ("1", "true"):
        return docker_path
    return PROJECT_ROOT / "shed_data" / "shed.db"


DB_PATH = Path(os.getenv("DB_PATH", str(_default_db_path()))).resolve()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DB_PATH.as_posix()}",
)

connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=connect_args)
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
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

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

    if not _column_exists("observations", "observed_by"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE observations ADD COLUMN observed_by VARCHAR"
            ))

    if not _column_exists("historal", "hideFromHistorial"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE historal ADD COLUMN hideFromHistorial BOOLEAN DEFAULT 0"
            ))
            conn.execute(text("""
                UPDATE historal
                SET hideFromHistorial = 1
                WHERE id IN (
                    SELECT r.id
                    FROM historal AS r
                    INNER JOIN historal AS t
                        ON t.itemId = r.itemId
                        AND t.action = 'traslado'
                        AND t.amountRetired = r.amountRetired
                        AND t.place LIKE '% → ' || r.place
                    WHERE r.action = 'retiro'
                      AND IFNULL(r.hideFromHistorial, 0) = 0
                )
            """))
