from sqlalchemy.orm import Session

import models
from item_service import ItemServiceError
from unit_service import STATUS_EN_STOCK


def _rows_for_item(db: Session, item_id: int):
    return (
        db.query(models.ItemDepotZone)
        .filter(models.ItemDepotZone.item_id == item_id)
        .all()
    )


def materialize_item_zones(db: Session, item: models.Item) -> None:
    if item.track_units:
        return
    if _rows_for_item(db, item.id):
        return
    qty = int(item.actualAmount or 0)
    if qty <= 0 or not item.zone_id:
        return
    db.add(models.ItemDepotZone(item_id=item.id, zone_id=item.zone_id, quantity=qty))
    db.flush()


def zone_quantity(db: Session, item: models.Item, zone_id: int) -> int:
    if not zone_id:
        return 0
    rows = _rows_for_item(db, item.id)
    if not rows:
        return int(item.actualAmount or 0) if zone_id == item.zone_id else 0
    return sum(int(row.quantity or 0) for row in rows if row.zone_id == zone_id)


def _set_row_quantity(db: Session, item: models.Item, zone_id: int, quantity: int) -> None:
    row = (
        db.query(models.ItemDepotZone)
        .filter(
            models.ItemDepotZone.item_id == item.id,
            models.ItemDepotZone.zone_id == zone_id,
        )
        .first()
    )
    if quantity <= 0:
        if row:
            db.delete(row)
        return
    if row:
        row.quantity = quantity
        return
    db.add(models.ItemDepotZone(item_id=item.id, zone_id=zone_id, quantity=quantity))


def refresh_primary_zone(db: Session, item: models.Item) -> None:
    places = item_depot_places(db, item)
    if not places:
        return
    current = next((row for row in places if row["zone_id"] == item.zone_id), None)
    top = max(places, key=lambda row: (row["quantity"], 1 if row["zone_id"] == item.zone_id else 0))
    if current and current["quantity"] == top["quantity"]:
        return
    item.zone_id = top["zone_id"]


def add_item_zone_stock(db: Session, item: models.Item, zone_id: int, quantity: int) -> None:
    if item.track_units or quantity == 0:
        return
    if not zone_id:
        raise ItemServiceError("Elegí una zona", 400)
    zone = db.query(models.Zone).filter(models.Zone.id == zone_id).first()
    if not zone or zone.shed_id != item.shed_id:
        raise ItemServiceError("La zona no es de este depósito", 400)
    materialize_item_zones(db, item)
    next_qty = zone_quantity(db, item, zone_id) + quantity
    if next_qty < 0:
        raise ItemServiceError(
            f"En esa zona hay {zone_quantity(db, item, zone_id)}",
            400,
        )
    _set_row_quantity(db, item, zone_id, next_qty)
    db.flush()
    refresh_primary_zone(db, item)


def take_item_zone_stock(db: Session, item: models.Item, quantity: int, zone_id=None) -> None:
    if item.track_units or quantity <= 0:
        return
    materialize_item_zones(db, item)
    rows = [row for row in _rows_for_item(db, item.id) if int(row.quantity or 0) > 0]
    if not rows:
        return
    if zone_id:
        available = zone_quantity(db, item, zone_id)
        if available < quantity:
            raise ItemServiceError(f"En esa zona hay {available}", 400)
        _set_row_quantity(db, item, zone_id, available - quantity)
        db.flush()
        refresh_primary_zone(db, item)
        return
    if len(rows) == 1:
        row = rows[0]
        _set_row_quantity(db, item, row.zone_id, int(row.quantity or 0) - quantity)
        db.flush()
        refresh_primary_zone(db, item)
        return
    home = next((row for row in rows if row.zone_id == item.zone_id), rows[0])
    available = int(home.quantity or 0)
    if available < quantity:
        raise ItemServiceError("Elegí de qué zona sacar el stock", 400)
    _set_row_quantity(db, item, home.zone_id, available - quantity)
    db.flush()
    refresh_primary_zone(db, item)


def move_item_zone_stock(db: Session, item: models.Item, from_zone_id: int, to_zone_id: int, quantity: int) -> None:
    if quantity <= 0:
        return
    if from_zone_id == to_zone_id:
        raise ItemServiceError("El origen y el destino son iguales", 400)
    dest = db.query(models.Zone).filter(models.Zone.id == to_zone_id).first()
    if not dest or dest.shed_id != item.shed_id:
        raise ItemServiceError("La zona destino no pertenece a este depósito", 400)
    materialize_item_zones(db, item)
    available = zone_quantity(db, item, from_zone_id)
    if available < quantity:
        raise ItemServiceError(f"En esa zona hay {available}", 400)
    _set_row_quantity(db, item, from_zone_id, available - quantity)
    _set_row_quantity(db, item, to_zone_id, zone_quantity(db, item, to_zone_id) + quantity)
    db.flush()
    refresh_primary_zone(db, item)


def clear_item_depot_zones(db: Session, item: models.Item) -> None:
    db.query(models.ItemDepotZone).filter(models.ItemDepotZone.item_id == item.id).delete(
        synchronize_session=False
    )


def clear_unit_depot_zones(db: Session, units) -> None:
    ids = [unit.id for unit in (units or []) if unit is not None]
    if not ids:
        return
    db.query(models.UnitDepotZone).filter(models.UnitDepotZone.unit_id.in_(ids)).delete(
        synchronize_session=False
    )


def relocate_all_in_place(db: Session, item: models.Item, to_zone_id: int) -> None:
    item.zone_id = to_zone_id
    clear_item_depot_zones(db, item)
    stock_units = (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.item_id == item.id,
            models.ItemUnit.status == STATUS_EN_STOCK,
        )
        .all()
    )
    clear_unit_depot_zones(db, stock_units)


def _force_unit_zone(db: Session, item: models.Item, unit: models.ItemUnit, zone_id: int) -> None:
    expected = int(unit.quantity or 0) if item.inner_quantity else 1
    if expected <= 0:
        return
    db.query(models.UnitDepotZone).filter(models.UnitDepotZone.unit_id == unit.id).delete(
        synchronize_session=False
    )
    db.add(models.UnitDepotZone(unit_id=unit.id, zone_id=zone_id, quantity=expected))


def assign_units_to_zone(db: Session, item: models.Item, units, to_zone_id: int) -> None:
    dest = db.query(models.Zone).filter(models.Zone.id == to_zone_id).first()
    if not dest or dest.shed_id != item.shed_id:
        raise ItemServiceError("La zona destino no pertenece a este depósito", 400)
    old_home = item.zone_id
    moved_ids = set()
    for unit in units or []:
        if unit.status != STATUS_EN_STOCK:
            continue
        _force_unit_zone(db, item, unit, to_zone_id)
        moved_ids.add(unit.id)
    leftovers = (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.item_id == item.id,
            models.ItemUnit.status == STATUS_EN_STOCK,
        )
        .all()
    )
    if moved_ids and old_home:
        leftover_ids = [unit.id for unit in leftovers if unit.id not in moved_ids]
        already = set()
        if leftover_ids:
            already = {
                row.unit_id
                for row in db.query(models.UnitDepotZone.unit_id).filter(
                    models.UnitDepotZone.unit_id.in_(leftover_ids),
                    models.UnitDepotZone.quantity > 0,
                )
            }
        for unit in leftovers:
            if unit.id in moved_ids or unit.id in already:
                continue
            _force_unit_zone(db, item, unit, old_home)
    db.flush()
    refresh_coded_primary_zone(db, item)


def refresh_coded_primary_zone(db: Session, item: models.Item) -> None:
    if not item.track_units:
        return
    places = _coded_places(db, [item]).get(item.id) or []
    if not places:
        return
    current = next((row for row in places if row["zone_id"] == item.zone_id), None)
    top = max(places, key=lambda row: (row["quantity"], 1 if row["zone_id"] == item.zone_id else 0))
    if current and current["quantity"] == top["quantity"]:
        return
    item.zone_id = top["zone_id"]


def hide_empty_source(db: Session, item: models.Item) -> None:
    if int(item.actualAmount or 0) > 0 or int(item.totalAmount or 0) > 0:
        return
    sibling = (
        db.query(models.Item)
        .filter(
            models.Item.id != item.id,
            models.Item.name == item.name,
            models.Item.category == item.category,
            models.Item.shed_id == item.shed_id,
            models.Item.status == 1,
            models.Item.actualAmount > 0,
        )
        .first()
    )
    if sibling:
        item.status = 0
        item.is_available = False


def find_zone_twin(db: Session, item: models.Item, zone_id: int):
    return (
        db.query(models.Item)
        .filter(
            models.Item.id != item.id,
            models.Item.name == item.name,
            models.Item.category == item.category,
            models.Item.zone_id == zone_id,
            models.Item.status == 1,
        )
        .first()
    )


def item_depot_places(db: Session, item: models.Item) -> list:
    return places_by_item_ids(db, [item]).get(item.id) or []


def item_ids_in_zone(db: Session, zone_id: int):
    depot_ids = db.query(models.ItemDepotZone.item_id).filter(
        models.ItemDepotZone.zone_id == zone_id,
        models.ItemDepotZone.quantity > 0,
    )
    unit_ids = (
        db.query(models.ItemUnit.item_id)
        .join(models.UnitDepotZone, models.UnitDepotZone.unit_id == models.ItemUnit.id)
        .filter(
            models.UnitDepotZone.zone_id == zone_id,
            models.UnitDepotZone.quantity > 0,
        )
    )
    return depot_ids.union(unit_ids)


def empty_duplicate_filter():
    from sqlalchemy import and_, exists
    from sqlalchemy.orm import aliased

    sibling = aliased(models.Item)
    ghost = exists().where(
        sibling.id != models.Item.id,
        sibling.name == models.Item.name,
        sibling.category == models.Item.category,
        sibling.shed_id == models.Item.shed_id,
        sibling.status == 1,
        sibling.actualAmount > 0,
    )
    return ~and_(
        models.Item.actualAmount == 0,
        models.Item.totalAmount == 0,
        ghost,
    )


def _coded_places(db: Session, items) -> dict:
    coded = [item for item in items if item.track_units]
    grouped = {item.id: {} for item in coded}
    if not coded:
        return {item.id: [] for item in coded}
    ids = [item.id for item in coded]
    units = (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.item_id.in_(ids),
            models.ItemUnit.status == STATUS_EN_STOCK,
        )
        .all()
    )
    if not units:
        return {item.id: [] for item in coded}
    by_item = {item.id: item for item in coded}
    unit_ids = [unit.id for unit in units]
    depot_rows = (
        db.query(models.UnitDepotZone)
        .filter(
            models.UnitDepotZone.unit_id.in_(unit_ids),
            models.UnitDepotZone.quantity > 0,
        )
        .all()
    )
    by_unit = {}
    for row in depot_rows:
        by_unit.setdefault(row.unit_id, []).append(row)
    for unit in units:
        item = by_item.get(unit.item_id)
        if not item:
            continue
        rows = by_unit.get(unit.id) or []
        if rows:
            for row in rows:
                bucket = grouped[item.id].setdefault(row.zone_id, 0)
                grouped[item.id][row.zone_id] = bucket + int(row.quantity or 0)
            continue
        home = item.zone_id
        if not home:
            continue
        qty = int(unit.quantity or 0) if item.inner_quantity else 1
        if qty <= 0:
            continue
        grouped[item.id][home] = grouped[item.id].get(home, 0) + qty
    return {
        item_id: _named_places(db, buckets)
        for item_id, buckets in grouped.items()
    }


def _quantity_places(db: Session, items) -> dict:
    quantity_items = [item for item in items if not item.track_units]
    grouped = {item.id: {} for item in quantity_items}
    if not quantity_items:
        return grouped
    ids = [item.id for item in quantity_items]
    rows = (
        db.query(models.ItemDepotZone)
        .filter(
            models.ItemDepotZone.item_id.in_(ids),
            models.ItemDepotZone.quantity > 0,
        )
        .all()
    )
    seen = set()
    for row in rows:
        seen.add(row.item_id)
        grouped[row.item_id][row.zone_id] = grouped[row.item_id].get(row.zone_id, 0) + int(row.quantity or 0)
    for item in quantity_items:
        if item.id in seen:
            continue
        if item.zone_id and int(item.actualAmount or 0) > 0:
            grouped[item.id][item.zone_id] = int(item.actualAmount or 0)
    return grouped


def _named_places(db: Session, buckets: dict) -> list:
    if not buckets:
        return []
    zone_ids = [zone_id for zone_id in buckets.keys() if zone_id]
    names = {}
    if zone_ids:
        for zone in db.query(models.Zone).filter(models.Zone.id.in_(zone_ids)).all():
            names[zone.id] = zone.name or "Sin zona"
    places = [
        {
            "zone_id": zone_id,
            "zone_name": names.get(zone_id) or "Sin zona",
            "quantity": qty,
        }
        for zone_id, qty in buckets.items()
        if qty > 0
    ]
    places.sort(key=lambda row: ((row["zone_name"] or "").lower(), row["zone_id"]))
    return places


def places_by_item_ids(db: Session, items) -> dict:
    items = [item for item in (items or []) if item is not None]
    result = {item.id: [] for item in items}
    if not items:
        return result
    quantity = _quantity_places(db, items)
    coded = _coded_places(db, items)
    for item in items:
        if item.track_units:
            result[item.id] = coded.get(item.id) or []
        else:
            result[item.id] = _named_places(db, quantity.get(item.id) or {})
    return result


def location_zone_label(places, fallback="") -> str:
    names = [row["zone_name"] for row in (places or []) if row.get("zone_name")]
    if names:
        return " · ".join(names)
    return fallback or ""
