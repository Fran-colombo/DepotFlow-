import unicodedata
from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

import models


def fold(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    return normalized.encode("ascii", "ignore").decode("ascii").lower().strip()


@dataclass
class ResolvedLocation:
    shed: models.Shed | None = None
    zone: models.Zone | None = None
    remainder: str = ""


def parse_location(raw: str | None) -> tuple[str, str | None]:
    text = (raw or "").strip()
    if not text:
        return "", None
    for sep in (" / ", "/", " - ", ",", "|"):
        if sep in text:
            left, right = [part.strip() for part in text.split(sep, 1)]
            return left, right or None
    return text, None


def find_sheds(db: Session, name: str) -> list[models.Shed]:
    target = fold(name)
    if not target:
        return []
    sheds = db.query(models.Shed).all()
    exact = [shed for shed in sheds if fold(shed.name) == target]
    if exact:
        return exact
    return [
        shed
        for shed in sheds
        if target in fold(shed.name) or fold(shed.name) in target
    ]


def find_zones(db: Session, name: str, shed_id: int | None = None) -> list[models.Zone]:
    target = fold(name)
    if not target:
        return []
    query = db.query(models.Zone)
    if shed_id is not None:
        query = query.filter(models.Zone.shed_id == shed_id)
    zones = query.all()
    exact = [zone for zone in zones if fold(zone.name) == target]
    if exact:
        return exact
    return [
        zone
        for zone in zones
        if target in fold(zone.name) or fold(zone.name) in target
    ]


def resolve_from_location(db: Session, raw: str | None) -> ResolvedLocation:
    shed_name, extra = parse_location(raw)
    result = ResolvedLocation(remainder=extra or "")
    if not shed_name:
        return result

    sheds = find_sheds(db, shed_name)
    if len(sheds) == 1:
        result.shed = sheds[0]
    elif extra:
        extra_sheds = find_sheds(db, extra)
        if len(extra_sheds) == 1:
            result.shed = extra_sheds[0]
            extra = shed_name
            result.remainder = extra

    if result.shed and extra:
        zones = find_zones(db, extra, result.shed.id)
        if len(zones) == 1:
            result.zone = zones[0]
            result.remainder = ""
    elif extra:
        zones = find_zones(db, extra)
        if len(zones) == 1:
            result.zone = zones[0]
            result.shed = zones[0].shed
            result.remainder = ""
    elif result.shed is None:
        zones = find_zones(db, shed_name)
        if len(zones) == 1:
            result.zone = zones[0]
            result.shed = zones[0].shed
    return result


def find_items(
    db: Session,
    elemento: str,
    shed: models.Shed | None = None,
    zone: models.Zone | None = None,
) -> list[models.Item]:
    name = (elemento or "").strip()
    if not name:
        return []
    query = (
        db.query(models.Item)
        .options(joinedload(models.Item.shed), joinedload(models.Item.zone))
        .filter(models.Item.status == 1, models.Item.name.ilike(f"%{name}%"))
    )
    if zone:
        query = query.filter(models.Item.zone_id == zone.id)
    elif shed:
        query = query.filter(models.Item.shed_id == shed.id)
    items = query.order_by(models.Item.name.asc()).all()
    exact = [item for item in items if fold(item.name) == fold(name)]
    return exact or items


def item_label(item: models.Item) -> str:
    shed_name = item.shed.name if item.shed else "Sin galpón"
    zone_name = item.zone.name if item.zone else "Sin zona"
    return f"{item.name} | {shed_name} | {zone_name} | stock {item.actualAmount}"


def format_item_list(items: list[models.Item], limit: int = 30) -> str:
    lines = [f"- {item_label(item)}" for item in items[:limit]]
    if len(items) > limit:
        lines.append(f"... y {len(items) - limit} más")
    return "\n".join(lines)


def pending_outside_lines(
    db: Session,
    items: list[models.Item],
    elemento: str | None = None,
    limit: int = 30,
) -> list[str]:
    """Pending retiros (obra) for the given items / name, aggregated by place."""
    item_ids = [item.id for item in items] if items else []
    if not item_ids and elemento:
        item_ids = [item.id for item in find_items(db, elemento)]
    if not item_ids:
        return []

    rows = (
        db.query(models.History)
        .options(joinedload(models.History.item))
        .filter(
            models.History.itemId.in_(item_ids),
            models.History.action == models.ActionEnum.retiro,
            models.History.turnback == False,  # noqa: E712
            models.History.amountNotReturned > 0,
        )
        .order_by(models.History.place.asc(), models.History.date.asc())
        .all()
    )
    by_key: dict[tuple[str, str], dict] = {}
    for history in rows:
        place = (history.place or "").strip()
        if not place or "→" in place:
            continue
        item_name = history.item.name if history.item else (elemento or "Ítem")
        key = (item_name, place)
        entry = by_key.setdefault(
            key,
            {"name": item_name, "place": place, "amount": 0, "persons": []},
        )
        entry["amount"] += int(history.amountNotReturned or 0)
        person = (history.personWhoTook or history.userName or "").strip()
        if person and person not in entry["persons"]:
            entry["persons"].append(person)

    lines = []
    for entry in list(by_key.values())[:limit]:
        who = f" ({', '.join(entry['persons'])})" if entry["persons"] else ""
        lines.append(f"- {entry['name']} | en obra {entry['place']} | {entry['amount']}{who}")
    if len(by_key) > limit:
        lines.append(f"... y {len(by_key) - limit} más")
    return lines
