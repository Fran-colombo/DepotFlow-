import unicodedata

ITEM_CATEGORIES = [
    {"value": "Materiales consumibles", "label": "Materiales consumibles"},
    {
        "value": "Maquinas y herramientas eléctricas de mano",
        "label": "Maq. y herramientas eléctricas de mano",
    },
    {"value": "Prolongación", "label": "Prolongación"},
    {
        "value": "Maquinas y herramientas eléctricas de obra",
        "label": "Maq. y herramientas eléctricas de obra",
    },
    {"value": "Herramientas de obra general", "label": "Herramientas de obra general"},
    {"value": "Encofrados", "label": "Encofrados"},
    {"value": "Estructuras de hormigón", "label": "Estructuras de hormigón"},
    {"value": "Contrapisos", "label": "Contrapisos"},
    {"value": "Albañilería", "label": "Albañilería"},
    {"value": "Yesería", "label": "Yesería"},
]


def normalize_lookup(value: str) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    text = "".join(
        ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn"
    )
    return " ".join(text.split())


def canonical_category(raw: str):
    key = normalize_lookup(raw)
    if not key:
        return None
    mapping = {}
    for category in ITEM_CATEGORIES:
        mapping[normalize_lookup(category["value"])] = category["value"]
        mapping[normalize_lookup(category["label"])] = category["value"]
    return mapping.get(key)
