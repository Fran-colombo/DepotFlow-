from datetime import date, datetime
from types import SimpleNamespace

from transportes import _hours_for_day, _use_covers_day


def _use(left, returned=None):
    return SimpleNamespace(id=1, left_at=left, returned_at=returned)


def test_same_day_hours():
    use = _use(datetime(2026, 5, 18, 10, 0), datetime(2026, 5, 18, 16, 0))
    slot = _hours_for_day(use, date(2026, 5, 18))
    assert slot["from"] == "10:00"
    assert slot["to"] == "16:00"
    assert slot["label"] == "10:00 → 16:00"


def test_multi_day_hours_split():
    use = _use(datetime(2026, 5, 18, 10, 0), datetime(2026, 5, 19, 17, 0))
    first = _hours_for_day(use, date(2026, 5, 18))
    second = _hours_for_day(use, date(2026, 5, 19))
    assert first["from"] == "10:00"
    assert first["to"] == "23:59"
    assert second["from"] == "00:00"
    assert second["to"] == "17:00"
    assert _use_covers_day(use, date(2026, 5, 18))
    assert _use_covers_day(use, date(2026, 5, 19))
    assert not _use_covers_day(use, date(2026, 5, 20))
