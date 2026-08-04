"""Create initial admin user from env vars if it does not exist.

Called on app startup so Docker/deploy always has a first login.
"""
import os
import logging
from passlib.context import CryptContext
from database import SessionLocal
from models import User, RoleEnum

logger = logging.getLogger(__name__)
bcrypt_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_admin_from_env() -> None:
    email = (os.getenv("ADMIN_USER_EMAIL") or os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip()
    password = (os.getenv("ADMIN_USER_PASSWORD") or os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or "").strip()

    if not email or not password:
        logger.info(
            "Bootstrap admin omitido: definí ADMIN_USER_EMAIL y ADMIN_USER_PASSWORD en el entorno."
        )
        return

    name = (os.getenv("ADMIN_USER_NAME") or "Admin").strip()
    surname = (os.getenv("ADMIN_USER_SURNAME") or "Sistema").strip()

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.role != RoleEnum.admin or existing.status != 1:
                existing.role = RoleEnum.admin
                existing.status = 1
                db.commit()
                logger.info("Usuario existente %s marcado como admin activo", email)
            else:
                logger.info("Admin %s ya existe", email)
            return

        db.add(
            User(
                name=name,
                surname=surname,
                email=email,
                password=bcrypt_context.hash(password),
                role=RoleEnum.admin,
                status=1,
            )
        )
        db.commit()
        logger.info("Admin bootstrap creado: %s", email)
    except Exception:
        db.rollback()
        logger.exception("Error creando admin bootstrap")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_admin_from_env()
