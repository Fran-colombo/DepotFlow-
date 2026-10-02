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

    if not _column_exists("users", "phone"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR"))

    if not _column_exists("items", "image_filename"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE items ADD COLUMN image_filename VARCHAR"))

    if not _column_exists("users", "telegram_id"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN telegram_id VARCHAR"))

    if not _column_exists("users", "telegram_link_token"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN telegram_link_token VARCHAR"))

    if not _column_exists("users", "telegram_link_expires"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN telegram_link_expires DATETIME"))

def ensure_inventory_schema():
    """Additive columns and tables for unit codes and editable categories."""
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR NOT NULL,
                label VARCHAR NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                active BOOLEAN NOT NULL DEFAULT 1,
                is_consumable BOOLEAN NOT NULL DEFAULT 0,
                seed_key VARCHAR,
                CONSTRAINT uq_categories_name UNIQUE (name),
                CONSTRAINT uq_categories_seed_key UNIQUE (seed_key)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_categories_id ON categories (id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_categories_name ON categories (name)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS item_units (
                id INTEGER NOT NULL PRIMARY KEY,
                item_id INTEGER NOT NULL,
                code VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'en_stock',
                created_at DATETIME NOT NULL,
                consumed_at DATETIME,
                FOREIGN KEY(item_id) REFERENCES items (id),
                CONSTRAINT uq_item_units_code UNIQUE (code)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_item_units_item_id ON item_units (item_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_item_units_code ON item_units (code)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_item_units_status ON item_units (status)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS history_units (
                id INTEGER NOT NULL PRIMARY KEY,
                history_id INTEGER NOT NULL,
                unit_id INTEGER NOT NULL,
                FOREIGN KEY(history_id) REFERENCES historal (id),
                FOREIGN KEY(unit_id) REFERENCES item_units (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_history_units_history_id ON history_units (history_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_history_units_unit_id ON history_units (unit_id)"
        ))

    if not _column_exists("items", "track_units"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE items ADD COLUMN track_units BOOLEAN NOT NULL DEFAULT 0"
            ))

    if _column_exists("items", "id") and not _column_exists("items", "code_prefix"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE items ADD COLUMN code_prefix VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "image_filename"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN image_filename VARCHAR"))

    if _column_exists("observations", "id") and not _column_exists("observations", "unit_id"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE observations ADD COLUMN unit_id INTEGER REFERENCES item_units(id)"
            ))

    if _column_exists("observations", "unit_id"):
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_observations_unit_id ON observations (unit_id)"
            ))

    if _column_exists("categories", "id") and not _column_exists("categories", "seed_key"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE categories ADD COLUMN seed_key VARCHAR"))


def ensure_phone_unique_index():
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return
    if not _column_exists("users", "phone"):
        return
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users (phone)"
            ))
    except Exception:
        pass


def ensure_telegram_unique_index():
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return
    try:
        with engine.begin() as conn:
            if _column_exists("users", "telegram_id"):
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_telegram_id ON users (telegram_id)"
                ))
            if _column_exists("users", "telegram_link_token"):
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_telegram_link_token "
                    "ON users (telegram_link_token)"
                ))
    except Exception:
        pass
