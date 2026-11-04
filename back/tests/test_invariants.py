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


def test_pending_email_groups_by_obra_then_name():
    from datetime import datetime
    from notifications import TIMEZONE, build_pending_body, report_is_due

    body = build_pending_body([
        {
            "obra": "Paraguay 500",
            "subcategory": "Herramientas de albañil",
            "label": "Amoladora",
            "code": "AM-1",
            "amount": 1,
            "person": "Franco Topa",
            "date": TIMEZONE.localize(datetime(2026, 10, 28, 9, 12)),
            "days": 7,
        },
        {
            "obra": "Paraguay 500",
            "subcategory": "Herramientas de albañil",
            "label": "Nivel",
            "code": "",
            "amount": 2,
            "person": "Franco Topa",
            "date": TIMEZONE.localize(datetime(2026, 10, 28, 9, 18)),
            "days": 7,
        },
    ])
    assert body.index("Obra: Paraguay 500") < body.index("Herramientas de albañil")
    assert body.index("Herramientas de albañil") < body.index("Amoladora")
    assert "Amoladora (AM-1)" in body
    assert "Ítem: Herramientas de albañil" not in body

    report = models.EmailReport(enabled=True, frequency="monthly", last_sent=None)
    first = TIMEZONE.localize(datetime(2026, 12, 1, 8, 0, 0))
    mid = TIMEZONE.localize(datetime(2026, 11, 4, 8, 0, 0))
    assert report_is_due(report, first)
    assert not report_is_due(report, mid)


def test_report_body_for_broken_and_no_stock():
    from notifications import build_report_body, build_report_html, parse_kinds

    broken = build_report_body("broken", [{
        "obra": "",
        "subcategory": "Amoladoras",
        "label": "Amoladora Bosch",
        "code": "AM-1",
        "amount": 1,
        "person": "Fuera de servicio",
        "date": None,
        "days": None,
        "note": "Cable cortado",
    }])
    assert "Elementos rotos" in broken
    assert "Amoladora Bosch (AM-1)" in broken
    assert "Cable cortado" in broken
    assert "Obra:" not in broken
    html = build_report_html("broken", [{
        "obra": "",
        "subcategory": "Amoladoras",
        "label": "Amoladora Bosch",
        "code": "AM-1",
        "amount": 1,
        "person": "Fuera de servicio",
        "date": None,
        "days": None,
        "note": "Cable cortado",
    }])
    assert "Amoladora Bosch" in html
    assert "AM-1" in html
    assert "<table" in html

    empty_stock = build_report_body("no_stock", [])
    assert "No hay productos sin stock" in empty_stock
    assert parse_kinds("broken,no_stock") == ["broken", "no_stock"]
