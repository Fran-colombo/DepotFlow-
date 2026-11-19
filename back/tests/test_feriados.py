from datetime import date

from feriados import working_days


def test_working_days_skips_weekend_and_holiday():
    holidays = {date(2026, 5, 25)}
    days = working_days(date(2026, 5, 22), date(2026, 5, 26), holidays)
    assert days == [
        date(2026, 5, 22),
        date(2026, 5, 26),
    ]


def test_working_days_empty_when_inverted_still_sorted():
    days = working_days(date(2026, 5, 26), date(2026, 5, 22), set())
    assert days == [
        date(2026, 5, 22),
        date(2026, 5, 25),
        date(2026, 5, 26),
    ]
