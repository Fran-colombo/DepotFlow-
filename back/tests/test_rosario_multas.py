from datetime import datetime

from rosario_multas import match_hits, parse_amount, parse_datetime, parse_hits

SAMPLE = """
<html><body>
<h2>Sin juzgar</h2>
<table>
  <tr><td>Acta:</td><td>37-642063-B</td></tr>
  <tr><td>Cedula</td><td>-429577626</td></tr>
  <tr><td colspan="2">NO ADMITE PAGO VOLUNTARIO</td></tr>
  <tr><td>Lugar</td><td>SAN MARTIN GRAL. JOSE 2652</td></tr>
  <tr><td>Fecha de Infracción</td><td>05/08/2026 14:41</td></tr>
  <tr><td>Infracción</td><td>294-01-03/B: DETENERSE EN DOBLE O MULTIPLE FILA</td></tr>
</table>
<h2>Pago voluntario</h2>
<table>
  <tr><td>Acta</td><td>12-111-A</td></tr>
  <tr><td>Fecha de Infracción</td><td>06/08/2026 14:40</td></tr>
  <tr><td>Fecha de emisión</td><td>07/08/2026</td></tr>
  <tr><td>Vencimiento</td><td>21/08/2026</td></tr>
  <tr><td>Infracción</td><td>EXCESO DE VELOCIDAD</td></tr>
  <tr><td>Importe pago voluntario</td><td>$ 12.345,50</td></tr>
</table>
</body></html>
"""


def test_parse_hits_and_voluntary():
    hits = parse_hits(SAMPLE)
    assert len(hits) == 2
    first = next(hit for hit in hits if hit["acta"] == "37-642063-B")
    assert first["voluntary"] is False
    assert first["section"] == "Sin juzgar"
    assert first["lugar"].startswith("SAN MARTIN")
    assert parse_datetime(first["occurred_display"]) == datetime(2026, 8, 5, 14, 41)
    second = next(hit for hit in hits if hit["acta"] == "12-111-A")
    assert second["voluntary"] is True
    assert second["amount"] == 12346
    assert parse_datetime(second["issued_at"]) == datetime(2026, 8, 7)
    assert parse_datetime(second["due_at"]) == datetime(2026, 8, 21)


def test_match_same_day_closest():
    hits = parse_hits(SAMPLE)
    matched, candidates = match_hits(hits, datetime(2026, 8, 5, 14, 41))
    assert matched is not None
    assert matched["acta"] == "37-642063-B"
    assert candidates == []


def test_match_no_day_returns_all():
    hits = parse_hits(SAMPLE)
    matched, candidates = match_hits(hits, datetime(2026, 1, 1, 10, 0))
    assert matched is None
    assert len(candidates) == 2


def test_parse_amount_and_iso():
    assert parse_amount("$ 1.200,00") == 1200
    assert parse_datetime("2026-08-05T14:41:00") == datetime(2026, 8, 5, 14, 41)
