from datetime import timedelta

from fastapi.testclient import TestClient
from pydantic import ValidationError

from auth import bcrypt_context, create_access_token
from database import Base, SessionLocal, engine
from dtos.retiroDTO import RetiroDTO
from item_service import ItemServiceError
import models
from models import RoleEnum, User
from search_text import search_terms
from unit_service import STATUS_RETIRADA, restore_units


def _session():
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


def test_search_terms_includes_synonyms():
    terms = search_terms("tubo")
    assert "tubo" in terms
    assert "cano" in terms


def test_retiro_amount_must_be_positive():
    try:
        RetiroDTO(itemId=1, amount=0, place="Obra")
        assert False, "debería rechazar cantidad 0"
    except ValidationError:
        pass


def test_restore_units_does_not_mint_stock():
    db = _session()
    try:
        shed = models.Shed(name="Galpon test")
        db.add(shed)
        db.flush()
        zone = models.Zone(name="Zona test", shed_id=shed.id)
        db.add(zone)
        db.flush()
        item = models.Item(
            name="Amoladora test",
            category="Herramientas",
            description="",
            totalAmount=1,
            actualAmount=0,
            shed_id=shed.id,
            zone_id=zone.id,
            status=1,
            track_units=True,
        )
        db.add(item)
        db.flush()
        unit = models.ItemUnit(
            item_id=item.id,
            code="AM-T-26-1",
            status=STATUS_RETIRADA,
            quantity=1,
        )
        db.add(unit)
        db.commit()
        db.refresh(item)

        try:
            restore_units(db, item, 2, None, "Obra Norte")
            assert False, "no debería inventar piezas"
        except ItemServiceError as exc:
            assert "suficientes" in exc.message.lower()
    finally:
        db.close()


def test_unauthenticated_create_is_rejected():
    Base.metadata.create_all(bind=engine)
    from main import app

    with TestClient(app) as client:
        response = client.post(
            "/",
            json={
                "name": "Item libre",
                "description": "",
                "quantity": 1,
                "category": "Varios",
            },
        )
        assert response.status_code in (401, 403)


def test_inactive_user_cannot_login():
    Base.metadata.create_all(bind=engine)
    db = _session()
    try:
        user = User(
            name="Baja",
            surname="Test",
            email="baja@test.local",
            password=bcrypt_context.hash("secreto123"),
            role=RoleEnum.user,
            status=0,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()

    from main import app

    with TestClient(app) as client:
        response = client.post(
            "/login",
            data={"username": "baja@test.local", "password": "secreto123"},
        )
        assert response.status_code == 401


def test_delete_missing_item_returns_404():
    Base.metadata.create_all(bind=engine)
    db = _session()
    try:
        admin = User(
            name="Admin",
            surname="Test",
            email="admin-test@test.local",
            password=bcrypt_context.hash("secreto123"),
            role=RoleEnum.admin,
            status=1,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        token = create_access_token(admin.email, admin.id, admin.role.value, timedelta(minutes=30))
    finally:
        db.close()

    from main import app

    with TestClient(app) as client:
        response = client.request(
            "DELETE",
            "/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "item_id": 999999,
                "description": "prueba",
                "date": "2026-01-01T00:00:00",
            },
        )
        assert response.status_code == 404
