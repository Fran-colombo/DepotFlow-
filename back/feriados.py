from datetime import date, timedelta

import httpx

FERIADOS_URL = "https://api.argentinadatos.com/v1/feriados/{year}"
TIMEOUT = 15.0

_cache: dict[int, set[date] | None] = {}
_failed_years: set[int] = set()


class FeriadosError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _parse_holiday(raw) -> date | None:
    if isinstance(raw, dict):
        text = raw.get("fecha") or raw.get("date") or ""
    else:
        text = str(raw or "")
    text = text.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def holidays_for_year(year: int) -> set[date]:
    if year in _cache and _cache[year] is not None:
        return set(_cache[year])
    if year in _failed_years and year not in _cache:
        raise FeriadosError("No se pudieron cargar los feriados")
    try:
        with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
            response = client.get(FERIADOS_URL.format(year=year))
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        _failed_years.add(year)
        raise FeriadosError("No se pudieron cargar los feriados") from exc
    rows = payload if isinstance(payload, list) else payload.get("holidays") or payload.get("feriados") or []
    holidays = set()
    for item in rows:
        day = _parse_holiday(item)
        if day:
            holidays.add(day)
    _cache[year] = holidays
    _failed_years.discard(year)
    return set(holidays)


def holidays_in_range(start: date, end: date) -> tuple[set[date], bool]:
    if end < start:
        start, end = end, start
    holidays: set[date] = set()
    incomplete = False
    for year in range(start.year, end.year + 1):
        try:
            holidays |= holidays_for_year(year)
        except FeriadosError:
            incomplete = True
    return {day for day in holidays if start <= day <= end}, incomplete


def working_days(start: date, end: date, holidays: set[date] | None = None) -> list[date]:
    if end < start:
        start, end = end, start
    holidays = holidays or set()
    days = []
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in holidays:
            days.append(current)
        current += timedelta(days=1)
    return days
