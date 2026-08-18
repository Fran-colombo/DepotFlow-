#!/usr/bin/env python3
"""Seed fictional data for the isolated DEMO database only.

Never reads or writes production data. Idempotent: skips if demo admin already exists.
Set DEMO_RESET=1 to wipe demo tables and re-seed (used by reset_demo.sh via fresh DB file).
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timedelta
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

        now = datetime.utcnow()
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
        db.flush()

        shed_norte = models.Shed(name="Galpón Norte Demo")
        shed_sur = models.Shed(name="Galpón Sur Demo")
        db.add_all([shed_norte, shed_sur])
        db.flush()

        zones_norte = [
            models.Zone(name="Zona A", shed_id=shed_norte.id),
            models.Zone(name="Zona B", shed_id=shed_norte.id),
        ]
        zones_sur = [
            models.Zone(name="Patio", shed_id=shed_sur.id),
            models.Zone(name="Taller", shed_id=shed_sur.id),
        ]
        db.add_all(zones_norte + zones_sur)
        db.flush()

        items_data = [
            ("Martillo demo", "Herramientas de obra general", "Martillo de carpintero", 8, 6, shed_norte.id, zones_norte[0].id),
            ("Pala demo", "Albañilería", "Pala ancha", 5, 3, shed_norte.id, zones_norte[1].id),
            ("Taladro demo", "Maq. y herramientas eléctricas de mano", "Taladro percutor", 4, 4, shed_norte.id, zones_norte[0].id),
            ("Cable demo", "Prolongación", "Cable 2.5mm", 20, 18, shed_sur.id, zones_sur[0].id),
            ("Clavos demo", "Materiales consumibles", "Clavos 2 pulgadas", 100, 85, shed_sur.id, zones_sur[1].id),
            ("Tornillos demo", "Materiales consumibles", "Tornillos drywall", 200, 200, shed_sur.id, zones_sur[1].id),
            ("Andamio demo", "Encofrados", "Tramo andamio", 6, 4, shed_norte.id, zones_norte[1].id),
            ("Nivel demo", "Herramientas de obra general", "Nivel aluminio", 3, 2, shed_sur.id, zones_sur[0].id),
            ("Amoladora demo", "Maq. y herramientas eléctricas de obra", "Amoladora 7\"", 3, 3, shed_sur.id, zones_sur[1].id),
            ("Casco demo", "Materiales consumibles", "Casco seguridad", 15, 12, shed_norte.id, zones_norte[0].id),
            ("Escalera demo", "Prolongación", "Escalera aluminio", 2, 1, shed_norte.id, zones_norte[1].id),
            ("Mezcladora demo", "Contrapisos", "Mezcladora portátil", 2, 2, shed_sur.id, zones_sur[0].id),
            ("Soga demo", "Materiales consumibles", "Soga polipropileno", 10, 10, shed_sur.id, zones_sur[1].id),
            ("Carretilla demo", "Albañilería", "Carretilla obra", 4, 3, shed_norte.id, zones_norte[0].id),
            ("Sierra demo", "Maq. y herramientas eléctricas de mano", "Sierra circular", 2, 2, shed_sur.id, zones_sur[1].id),
        ]

        created_items = []
        for name, category, desc, total, actual, shed_id, zone_id in items_data:
            item = models.Item(
                name=name,
                category=category,
                description=desc,
                totalAmount=total,
                actualAmount=actual,
                shed_id=shed_id,
                zone_id=zone_id,
                status=1,
            )
            db.add(item)
            created_items.append(item)
        db.flush()

        martillo = created_items[0]
        pala = created_items[1]
        clavos = created_items[4]

        db.add(
            models.Observation(
                item_id=martillo.id,
                description="Revisión demo: mango en buen estado.",
                date=now - timedelta(days=3),
                user_id=admin.id,
                user_name=f"{admin.name} {admin.surname}",
                observed_by="Inspector Demo",
            )
        )
        db.add(
            models.Observation(
                item_id=pala.id,
                description="Demo: punta desgastada, pendiente reemplazo.",
                date=now - timedelta(days=1),
                user_id=demo_user.id,
                user_name=f"{demo_user.name} {demo_user.surname}",
                observed_by="Supervisor Demo",
            )
        )

        db.add(
            models.History(
                itemId=martillo.id,
                userId=demo_user.id,
                userName=f"{demo_user.name} {demo_user.surname}",
                personWhoTook="Operario Demo",
                action=models.ActionEnum.retiro,
                amountRetired=2,
                amountNotReturned=2,
                date=now - timedelta(days=5),
                place="Obra Centro",
                turnback=False,
                hideFromHistorial=False,
            )
        )
        db.add(
            models.History(
                itemId=pala.id,
                userId=demo_user.id,
                userName=f"{demo_user.name} {demo_user.surname}",
                personWhoTook="Operario Demo",
                action=models.ActionEnum.retiro,
                amountRetired=1,
                amountNotReturned=1,
                date=now - timedelta(days=2),
                place="Obra Norte",
                turnback=False,
                hideFromHistorial=False,
            )
        )
        db.add(
            models.History(
                itemId=martillo.id,
                userId=admin.id,
                userName=f"{admin.name} {admin.surname}",
                personWhoTook="Operario Demo",
                action=models.ActionEnum.devolucion,
                amountRetired=1,
                amountNotReturned=0,
                date=now - timedelta(days=10),
                place="Obra Sur",
                turnback=True,
                turnbackDate=now - timedelta(days=10),
            )
        )
        db.add(
            models.History(
                itemId=pala.id,
                userId=admin.id,
                userName=f"{admin.name} {admin.surname}",
                personWhoTook="Operario Demo",
                action=models.ActionEnum.traslado,
                amountRetired=1,
                amountNotReturned=0,
                date=now - timedelta(days=4),
                place="Obra Norte → Obra Centro",
                turnback=True,
                turnbackDate=now - timedelta(days=4),
                hideFromHistorial=False,
            )
        )
        db.add(
            models.History(
                itemId=clavos.id,
                userId=demo_user.id,
                userName=f"{demo_user.name} {demo_user.surname}",
                personWhoTook="Operario Demo",
                action=models.ActionEnum.retiro,
                amountRetired=15,
                amountNotReturned=None,
                date=now - timedelta(days=7),
                place="Obra Centro",
                turnback=True,
            )
        )

        deleted_item = models.Item(
            name="Item eliminado demo",
            category="Materiales consumibles",
            description="Ejemplo de ítem dado de baja",
            totalAmount=0,
            actualAmount=0,
            shed_id=shed_sur.id,
            zone_id=zones_sur[0].id,
            status=0,
        )
        db.add(deleted_item)
        db.flush()

        db.add(
            models.DeletedItem(
                item_id=deleted_item.id,
                name=deleted_item.name,
                description=deleted_item.description,
                category=deleted_item.category,
                status=0,
                deletion_reason="Demo: baja por obsolescencia ficticia",
                deleted_at=now - timedelta(days=14),
            )
        )

        db.add(
            models.Movement(
                item_id=martillo.id,
                item_name=martillo.name,
                from_shed_id=shed_norte.id,
                to_shed_id=shed_sur.id,
                from_zone_id=zones_norte[0].id,
                to_zone_id=zones_sur[0].id,
                quantity=1,
                username=f"{admin.name} {admin.surname}",
                date=now - timedelta(days=20),
                user_id=admin.id,
            )
        )

        db.commit()
        logger.info(
            "Demo seed complete: users, 2 sheds, %d items, historial, observations.",
            len(created_items) + 1,
        )
    except Exception:
        db.rollback()
        logger.exception("Demo seed failed")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()
