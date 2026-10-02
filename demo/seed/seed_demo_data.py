#!/usr/bin/env python3
"""Create demo login users only. Inventory starts empty so it can be loaded by hand.

Never reads or writes production data. Idempotent: skips if demo admin already exists.
Set DEMO_RESET=1 to wipe demo tables and recreate the users.
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from passlib.context import CryptContext

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("demo_seed")

bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_MARKER_EMAIL = "demo.admin@example.com"


def _resolve_back_root() -> Path:
    docker_app = Path("/app")
    if (docker_app / "models.py").exists():
        return docker_app
    return Path(__file__).resolve().parents[2] / "back"


def _setup_imports() -> None:
    back_root = _resolve_back_root()
    if str(back_root) not in sys.path:
        sys.path.insert(0, str(back_root))
    os.chdir(back_root)


def _hash_password(password: str) -> str:
    return bcrypt_context.hash(password)


def _is_seeded(db, User) -> bool:
    return db.query(User).filter(User.email == DEMO_MARKER_EMAIL).first() is not None


def _clear_demo_data(db, models) -> None:
    """Remove all rows (demo DB only — never run against production)."""
    from sqlalchemy import text

    if os.getenv("DEMO_MODE") != "1":
        logger.warning("DEMO_MODE is not 1; refusing to clear data.")
        return

    for table in (
        "history_units",
        "item_units",
        "historal",
        "observations",
        "movements",
        "deleted_items",
        "items",
        "zones",
        "sheds",
        "users",
    ):
        db.execute(text(f"DELETE FROM {table}"))
    db.commit()
    logger.info("Demo tables cleared for re-seed.")


def seed_demo_data() -> None:
    if os.getenv("DEMO_MODE") != "1":
        logger.info("DEMO_MODE not set; skipping demo seed.")
        return

    _setup_imports()

    import models  # noqa: E402
    from database import SessionLocal, engine, ensure_zone_schema  # noqa: E402

    models.Base.metadata.create_all(bind=engine)
    ensure_zone_schema()

    db = SessionLocal()
    try:
        if os.getenv("DEMO_RESET") == "1":
            _clear_demo_data(db, models)

        if _is_seeded(db, models.User):
            logger.info("Demo already seeded (%s exists). Skipping.", DEMO_MARKER_EMAIL)
            return

        admin_email = os.getenv("ADMIN_USER_EMAIL", DEMO_MARKER_EMAIL)
        admin_password = os.getenv("ADMIN_USER_PASSWORD", "Demo123!")
        user_email = os.getenv("DEMO_USER_EMAIL", "demo.user@example.com")
        user_password = os.getenv("DEMO_USER_PASSWORD", "Demo123!")

        admin = models.User(
            name=os.getenv("ADMIN_USER_NAME", "Demo"),
            surname=os.getenv("ADMIN_USER_SURNAME", "Admin"),
            email=admin_email,
            password=_hash_password(admin_password),
            role=models.RoleEnum.admin,
            status=1,
        )
        demo_user = models.User(
            name="Demo",
            surname="Usuario",
            email=user_email,
            password=_hash_password(user_password),
            role=models.RoleEnum.user,
            status=1,
        )
        db.add_all([admin, demo_user])
        db.commit()
        logger.info("Demo listo: solo usuarios de acceso. El inventario arranca vacío.")
    except Exception:
        db.rollback()
        logger.exception("Demo seed failed")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
