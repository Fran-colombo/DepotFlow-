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


def _move_item(db, item, from_zone, to_zone, quantity, codes=None):
    from dtos.movementsDTO import MovementCreateDTO
    from movements import execute_movement, validate_movement

    data = MovementCreateDTO(
        item_id=item.id,
        from_shed_id=item.shed_id,
        to_shed_id=item.shed_id,
        from_zone_id=from_zone.id,
        to_zone_id=to_zone.id,
        quantity=quantity,
        username="test",
        codes=codes,
    )
    source, from_zone_id = validate_movement(db, data)
    return execute_movement(db, data, 1, source, from_zone_id)


def test_same_shed_full_move_keeps_item_id():
    db = _session()
    try:
        shed = models.Shed(name="Galpon zona full")
        db.add(shed)
        db.flush()
        office = models.Zone(name="Oficina", shed_id=shed.id)
        upstairs = models.Zone(name="Oficina Arriba", shed_id=shed.id)
        db.add_all([office, upstairs])
        db.flush()
        item = models.Item(
            name="Vestimenta full",
            category="Ropa",
            description="",
            totalAmount=10,
            actualAmount=10,
            shed_id=shed.id,
            zone_id=office.id,
            status=1,
            track_units=False,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id

        _move_item(db, item, office, upstairs, 10)
        db.refresh(item)

        assert item.id == item_id
        assert item.zone_id == upstairs.id
        assert item.actualAmount == 10
        assert item.status == 1
        clones = (
            db.query(models.Item)
            .filter(models.Item.name == "Vestimenta full", models.Item.status == 1)
            .all()
        )
        assert len(clones) == 1
    finally:
        db.close()


def test_same_shed_partial_move_splits_zones_on_one_item():
    db = _session()
    try:
        from zone_stock import item_depot_places

        shed = models.Shed(name="Galpon zona split")
        db.add(shed)
        db.flush()
        office = models.Zone(name="Oficina", shed_id=shed.id)
        upstairs = models.Zone(name="Oficina Arriba", shed_id=shed.id)
        db.add_all([office, upstairs])
        db.flush()
        item = models.Item(
            name="Vestimenta split",
            category="Ropa",
            description="",
            totalAmount=10,
            actualAmount=10,
            shed_id=shed.id,
            zone_id=office.id,
            status=1,
            track_units=False,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id

        _move_item(db, item, office, upstairs, 4)
        db.refresh(item)

        assert item.id == item_id
        assert item.actualAmount == 10
        assert item.status == 1
        places = {row["zone_id"]: row["quantity"] for row in item_depot_places(db, item)}
        assert places[office.id] == 6
        assert places[upstairs.id] == 4
        clones = (
            db.query(models.Item)
            .filter(models.Item.name == "Vestimenta split", models.Item.status == 1)
            .all()
        )
        assert len(clones) == 1
    finally:
        db.close()


def test_same_shed_full_move_merges_into_existing_twin():
    db = _session()
    try:
        shed = models.Shed(name="Galpon zona merge")
        db.add(shed)
        db.flush()
        office = models.Zone(name="Oficina", shed_id=shed.id)
        upstairs = models.Zone(name="Oficina Arriba", shed_id=shed.id)
        db.add_all([office, upstairs])
        db.flush()
        source = models.Item(
            name="Vestimenta merge",
            category="Ropa",
            description="",
            totalAmount=10,
            actualAmount=10,
            shed_id=shed.id,
            zone_id=office.id,
            status=1,
            track_units=False,
        )
        twin = models.Item(
            name="Vestimenta merge",
            category="Ropa",
            description="",
            totalAmount=2,
            actualAmount=2,
            shed_id=shed.id,
            zone_id=upstairs.id,
            status=1,
            track_units=False,
        )
        db.add_all([source, twin])
        db.commit()
        db.refresh(source)
        db.refresh(twin)

        _move_item(db, source, office, upstairs, 10)
        db.refresh(source)
        db.refresh(twin)

        assert twin.actualAmount == 12
        assert source.actualAmount == 0
        assert source.status == 0
        active = (
            db.query(models.Item)
            .filter(models.Item.name == "Vestimenta merge", models.Item.status == 1)
            .all()
        )
        assert [row.id for row in active] == [twin.id]
    finally:
        db.close()


def test_adjust_stock_asks_existing_zone_when_split():
    db = _session()
    try:
        from item_service import adjust_item_stock
        from zone_stock import item_depot_places

        shed = models.Shed(name="Galpon zona add")
        db.add(shed)
        db.flush()
        office = models.Zone(name="Oficina", shed_id=shed.id)
        upstairs = models.Zone(name="Oficina Arriba", shed_id=shed.id)
        db.add_all([office, upstairs])
        db.flush()
        item = models.Item(
            name="Vestimenta add",
            category="Ropa",
            description="",
            totalAmount=10,
            actualAmount=10,
            shed_id=shed.id,
            zone_id=office.id,
            status=1,
            track_units=False,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        _move_item(db, item, office, upstairs, 4)
        db.refresh(item)

        adjust_item_stock(db, item, 3, zone_id=upstairs.id)
        db.refresh(item)

        places = {row["zone_id"]: row["quantity"] for row in item_depot_places(db, item)}
        assert item.actualAmount == 13
        assert places[office.id] == 6
        assert places[upstairs.id] == 7
    finally:
        db.close()


def test_same_shed_partial_coded_keeps_one_item():
    db = _session()
    try:
        from zone_stock import places_by_item_ids
        from unit_service import STATUS_EN_STOCK

        shed = models.Shed(name="Galpon zona coded")
        db.add(shed)
        db.flush()
        office = models.Zone(name="Oficina", shed_id=shed.id)
        upstairs = models.Zone(name="Oficina Arriba", shed_id=shed.id)
        db.add_all([office, upstairs])
        db.flush()
        item = models.Item(
            name="Amoladora coded",
            category="Herramientas",
            description="",
            totalAmount=2,
            actualAmount=2,
            shed_id=shed.id,
            zone_id=office.id,
            status=1,
            track_units=True,
        )
        db.add(item)
        db.flush()
        db.add_all([
            models.ItemUnit(item_id=item.id, code="AM-Z-26-1", status=STATUS_EN_STOCK, quantity=1),
            models.ItemUnit(item_id=item.id, code="AM-Z-26-2", status=STATUS_EN_STOCK, quantity=1),
        ])
        db.commit()
        db.refresh(item)
        item_id = item.id

        _move_item(db, item, office, upstairs, 1, codes=["AM-Z-26-1"])
        db.refresh(item)

        assert item.id == item_id
        assert item.actualAmount == 2
        clones = (
            db.query(models.Item)
            .filter(models.Item.name == "Amoladora coded", models.Item.status == 1)
            .all()
        )
        assert len(clones) == 1
        places = {row["zone_id"]: row["quantity"] for row in places_by_item_ids(db, [item]).get(item.id)}
        assert places[office.id] == 1
        assert places[upstairs.id] == 1
        assert db.query(models.ItemUnit).filter(models.ItemUnit.item_id == item_id).count() == 2
    finally:
        db.close()
