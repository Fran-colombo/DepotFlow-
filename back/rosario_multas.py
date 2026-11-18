import re
from datetime import datetime, timedelta
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

FORM_URL = "https://www.rosario.gob.ar/gdm/patente.do?accion=ir"
TIMEOUT = 25.0
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
MATCH_MINUTES = 15

_LABELS = {
    "acta": ("acta",),
    "lugar": ("lugar",),
    "fecha": ("fecha de infracción", "fecha de infraccion", "fecha infracción", "fecha infraccion"),
    "infraccion": ("infracción", "infraccion"),
    "emision": ("fecha de emision", "fecha emision", "emision"),
    "vencimiento": ("fecha de vencimiento", "fecha vencimiento", "vencimiento", "vence"),
}
_HEADING_TAGS = ("h1", "h2", "h3", "h4", "legend", "caption")


class RosarioError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html or "", "html.parser")


def _clean(text: str) -> str:
    return " ".join((text or "").replace("\xa0", " ").split()).strip(" :")


def _norm(text: str) -> str:
    return (
        _clean(text)
        .lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
    )


def parse_datetime(text: str) -> datetime | None:
    raw = _clean(text)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        pass
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    match = re.search(r"(\d{1,2}/\d{1,2}/\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?", raw)
    if not match:
        return None
    stamp = match.group(1)
    if match.group(2):
        stamp = f"{stamp} {match.group(2)}"
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(stamp, fmt)
        except ValueError:
            continue
    return None


def parse_amount(text: str) -> int | None:
    if not text:
        return None
    match = re.search(
        r"\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)",
        text.replace("\xa0", " "),
    )
    if not match:
        match = re.search(
            r"(?:importe|monto|total|pago voluntario)\D{0,20}(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)",
            _norm(text),
        )
        if not match:
            return None
        raw = match.group(1)
    else:
        raw = match.group(1)
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(".", "")
    try:
        return int(round(float(raw)))
    except ValueError:
        return None


def _label_key(label: str) -> str | None:
    n = _norm(label).rstrip(":")
    for key, aliases in _LABELS.items():
        if n in aliases or any(n.startswith(alias) for alias in aliases):
            return key
    return None


def _voluntary(text: str) -> bool | None:
    n = _norm(text)
    if "no admite pago voluntario" in n:
        return False
    if "pago voluntario" in n:
        return True
    return None


def _hit_from_pairs(pairs: list[tuple[str, str]], section: str, extra: str) -> dict | None:
    data = {
        "acta": "",
        "lugar": "",
        "fecha": "",
        "infraccion": "",
        "emision": "",
        "vencimiento": "",
    }
    blob = " ".join(value for _, value in pairs) + " " + extra
    for label, value in pairs:
        key = _label_key(label)
        if key and value:
            data[key] = value
    if not data["acta"] and not data["fecha"]:
        return None
    occurred = parse_datetime(data["fecha"]) if data["fecha"] else None
    issued = parse_datetime(data["emision"]) if data["emision"] else None
    due = parse_datetime(data["vencimiento"]) if data["vencimiento"] else None
    voluntary = _voluntary(blob)
    amount = parse_amount(blob) if voluntary is not False else None
    return {
        "acta": data["acta"],
        "occurred_at": occurred.isoformat() if occurred else None,
        "occurred_display": data["fecha"],
        "infraccion": data["infraccion"],
        "lugar": data["lugar"],
        "section": section,
        "voluntary": voluntary,
        "amount": amount,
        "issued_at": issued.isoformat() if issued else None,
        "due_at": due.isoformat() if due else None,
    }


def _pairs_from_table(table) -> list[tuple[str, str]]:
    pairs = []
    for row in table.find_all("tr"):
        cells = [_clean(cell.get_text(" ", strip=True)) for cell in row.find_all(["th", "td"])]
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2:
            pairs.append((cells[0], " ".join(cells[1:])))
        elif len(cells) == 1:
            pairs.append((cells[0], cells[0]))
    return pairs


def parse_hits(html: str) -> list[dict]:
    soup = _soup(html)
    hits = []
    seen = set()
    current_section = ""
    for node in soup.find_all([*_HEADING_TAGS, "table"]):
        if node.name in _HEADING_TAGS:
            title = _clean(node.get_text(" ", strip=True))
            if title:
                current_section = title
            continue
        extra = _clean(node.get_text(" ", strip=True))
        hit = _hit_from_pairs(_pairs_from_table(node), current_section, extra)
        if not hit:
            continue
        key = (hit["acta"], hit["occurred_at"], hit["infraccion"])
        if key in seen:
            continue
        seen.add(key)
        hits.append(hit)
    return hits


def _find_form(soup: BeautifulSoup):
    for form in soup.find_all("form"):
        names = [(_clean(tag.get("name") or "")).lower() for tag in form.find_all(["input", "select", "textarea"])]
        if any("patente" in name or "dominio" in name for name in names):
            return form
    return soup.find("form")


def _form_payload(form, plate: str) -> tuple[str, dict[str, str]]:
    action = form.get("action") if form else None
    payload: dict[str, str] = {}
    plate_key = None
    for tag in (form.find_all(["input", "select", "textarea"]) if form else []):
        name = tag.get("name")
        if not name:
            continue
        itype = (tag.get("type") or "text").lower()
        if itype in ("submit", "button", "image", "file"):
            continue
        if itype in ("checkbox", "radio") and not tag.has_attr("checked"):
            continue
        value = tag.get("value") or ""
        if tag.name == "select":
            selected = tag.find("option", selected=True) or tag.find("option")
            value = selected.get("value", "") if selected else ""
        elif tag.name == "textarea":
            value = tag.get_text() or ""
        payload[name] = value
        n = name.lower()
        if "patente" in n or "dominio" in n:
            plate_key = name
    if not plate_key:
        plate_key = "patente"
    payload[plate_key] = plate
    if "accion" not in payload:
        payload["accion"] = "consultar"
    return action or POST_FALLBACK, payload


POST_FALLBACK = "https://www.rosario.gob.ar/gdm/patente.do"


def fetch_hits(plate: str) -> list[dict]:
    plate = " ".join((plate or "").split()).upper()
    if not plate:
        raise RosarioError("Indicá la patente")
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "es-AR,es;q=0.9"}
    try:
        with httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers=headers) as client:
            first = client.get(FORM_URL)
            first.raise_for_status()
            soup = _soup(first.text)
            form = _find_form(soup)
            action, payload = _form_payload(form, plate)
            url = urljoin(str(first.url), action)
            posted = client.post(url, data=payload)
            posted.raise_for_status()
            html = posted.text
    except httpx.HTTPError as exc:
        raise RosarioError("No se pudo consultar Rosario. Probá de nuevo en un rato.") from exc
    hits = parse_hits(html)
    if not hits:
        text = _norm(html)
        if "captcha" in text or "recaptcha" in text:
            raise RosarioError("Rosario pidió un captcha. Abrí el sitio a mano y cargá los datos acá.")
        if "no existen" in text or "no se encontr" in text or "sin infraccion" in text:
            return []
        raise RosarioError("Rosario no devolvió actas que se puedan leer. Cargá los datos a mano.")
    return hits


def match_hits(hits: list[dict], occurred_at: datetime) -> tuple[dict | None, list[dict]]:
    same_day = []
    for hit in hits:
        when = parse_datetime(hit.get("occurred_at") or "") or parse_datetime(hit.get("occurred_display") or "")
        if not when:
            continue
        if when.date() != occurred_at.date():
            continue
        delta = abs(when - occurred_at)
        same_day.append((delta, hit))
    same_day.sort(key=lambda item: item[0])
    if not same_day:
        return None, hits
    if len(same_day) == 1:
        return same_day[0][1], []
    closest_delta, closest_hit = same_day[0]
    second = same_day[1][0]
    if closest_delta <= timedelta(minutes=MATCH_MINUTES) and second - closest_delta > timedelta(minutes=1):
        return closest_hit, []
    return None, [hit for _, hit in same_day]
