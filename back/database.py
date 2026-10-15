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

    if _column_exists("historal", "id") and not _column_exists("historal", "note"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE historal ADD COLUMN note VARCHAR"))

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
            CREATE TABLE IF NOT EXISTS obras (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR NOT NULL,
                active BOOLEAN NOT NULL DEFAULT 1,
                stage VARCHAR NOT NULL DEFAULT 'trabajando',
                CONSTRAINT uq_obras_name UNIQUE (name)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_obras_name ON obras (name)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS empleados (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR NOT NULL,
                active BOOLEAN NOT NULL DEFAULT 1,
                CONSTRAINT uq_empleados_name UNIQUE (name)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_empleados_name ON empleados (name)"
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
                amount INTEGER,
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
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS unit_depot_zones (
                id INTEGER NOT NULL PRIMARY KEY,
                unit_id INTEGER NOT NULL,
                zone_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(unit_id) REFERENCES item_units (id),
                FOREIGN KEY(zone_id) REFERENCES zones (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_unit_depot_zones_unit_id ON unit_depot_zones (unit_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS roturas (
                id INTEGER NOT NULL PRIMARY KEY,
                unit_id INTEGER NOT NULL,
                damage_note VARCHAR,
                repair_note VARCHAR,
                fix_note VARCHAR,
                broken_at DATETIME NOT NULL,
                fixed_at DATETIME,
                FOREIGN KEY(unit_id) REFERENCES item_units (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_roturas_unit_id ON roturas (unit_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS transportes (
                id INTEGER NOT NULL PRIMARY KEY,
                kind VARCHAR NOT NULL,
                name VARCHAR NOT NULL,
                plate VARCHAR,
                image_filename VARCHAR,
                last_service_at DATETIME,
                last_service_km INTEGER,
                next_service_km INTEGER,
                current_km INTEGER,
                is_broken BOOLEAN NOT NULL DEFAULT 0,
                damage_note VARCHAR,
                in_repair BOOLEAN NOT NULL DEFAULT 0
            )
        """))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_transportes_plate ON transportes (plate)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_transportes_kind ON transportes (kind)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS transporte_usos (
                id INTEGER NOT NULL PRIMARY KEY,
                transport_id INTEGER NOT NULL,
                cart_id INTEGER,
                person VARCHAR NOT NULL,
                left_at DATETIME NOT NULL,
                returned_at DATETIME,
                km INTEGER,
                external_vehicle VARCHAR,
                FOREIGN KEY(transport_id) REFERENCES transportes (id),
                FOREIGN KEY(cart_id) REFERENCES transportes (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_transporte_usos_transport_id ON transporte_usos (transport_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS transporte_multas (
                id INTEGER NOT NULL PRIMARY KEY,
                transport_id INTEGER NOT NULL,
                occurred_at DATETIME NOT NULL,
                person VARCHAR NOT NULL,
                paid BOOLEAN NOT NULL DEFAULT 0,
                use_id INTEGER,
                FOREIGN KEY(transport_id) REFERENCES transportes (id),
                FOREIGN KEY(use_id) REFERENCES transporte_usos (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_transporte_multas_transport_id ON transporte_multas (transport_id)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS transporte_notas (
                id INTEGER NOT NULL PRIMARY KEY,
                transport_id INTEGER NOT NULL,
                description VARCHAR NOT NULL,
                observed_by VARCHAR,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(transport_id) REFERENCES transportes (id)
            )
        """))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_transporte_notas_transport_id ON transporte_notas (transport_id)"
        ))

    if _column_exists("history_units", "id") and not _column_exists("history_units", "amount"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE history_units ADD COLUMN amount INTEGER"))

    if _column_exists("obras", "id") and not _column_exists("obras", "stage"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE obras ADD COLUMN stage VARCHAR NOT NULL DEFAULT 'trabajando'"
            ))

    if not _column_exists("items", "track_units"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE items ADD COLUMN track_units BOOLEAN NOT NULL DEFAULT 0"
            ))

    if _column_exists("items", "id") and not _column_exists("items", "inner_quantity"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE items ADD COLUMN inner_quantity BOOLEAN NOT NULL DEFAULT 0"
            ))

    if _column_exists("items", "id") and not _column_exists("items", "code_prefix"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE items ADD COLUMN code_prefix VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "image_filename"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN image_filename VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "quantity"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE item_units ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1"
            ))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "name"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN name VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "is_broken"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE item_units ADD COLUMN is_broken BOOLEAN NOT NULL DEFAULT 0"
            ))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "damage_note"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN damage_note VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "description"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN description VARCHAR"))

    if _column_exists("item_units", "id") and not _column_exists("item_units", "repair_note"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE item_units ADD COLUMN repair_note VARCHAR"))

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

    if _column_exists("categories", "id") and not _column_exists("categories", "unit"):
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE categories ADD COLUMN unit VARCHAR NOT NULL DEFAULT 'unidad'"
            ))

    if _column_exists("categories", "id") and not _column_exists("categories", "hint"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE categories ADD COLUMN hint VARCHAR"))


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
