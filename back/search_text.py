import re

SYNONYM_GROUPS = (
    ("tubo", "cano"),
    ("curva", "codo"),
    ("grampa", "grapa", "abrazadera"),
    ("union", "acople", "cupla", "manguito"),
    ("tornillo", "bulon"),
    ("cable", "conductor"),
)

_ACCENTS = (
    ("á", "a"), ("Á", "a"), ("é", "e"), ("É", "e"),
    ("í", "i"), ("Í", "i"), ("ó", "o"), ("Ó", "o"),
    ("ú", "u"), ("Ú", "u"), ("ü", "u"), ("Ü", "u"),
    ("ñ", "n"), ("Ñ", "n"),
)

_SYNONYMS = {}
for _group in SYNONYM_GROUPS:
    for _word in _group:
        _SYNONYMS[_word] = _group


def fold(value):
    folded = value or ""
    for source, target in _ACCENTS:
        folded = folded.replace(source, target)
    return folded.lower()


def search_tokens(value):
    parts = []
    for chunk in fold(value).split():
        cleaned = chunk.strip(".,;:()[]\"'")
        if cleaned:
            parts.append(cleaned)
    return parts


def _words(value):
    return [part for part in re.split(r"[^0-9a-z]+", fold(value)) if part]


def _distance(left, right):
    if left == right:
        return 0
    if abs(len(left) - len(right)) > 1:
        return 2
    previous = list(range(len(right) + 1))
    for index, left_char in enumerate(left, start=1):
        current = [index]
        smallest = index
        for column, right_char in enumerate(right, start=1):
            cost = 0 if left_char == right_char else 1
            current.append(min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + cost,
            ))
            if current[-1] < smallest:
                smallest = current[-1]
        if smallest > 1:
            return 2
        previous = current
    return previous[-1]


def _close(token, words):
    if len(token) < 4 or not any(char.isalpha() for char in token):
        return False
    for word in words:
        if len(word) < 4 or not any(char.isalpha() for char in word):
            continue
        if _distance(token, word) <= 1:
            return True
    return False


def _kind(token, blob, words):
    if token in blob:
        return "exact"
    for alt in _SYNONYMS.get(token, ()):
        if alt != token and alt in blob:
            return "synonym"
    if _close(token, words):
        return "fuzzy"
    if len(token) >= 4 and any(char.isalpha() for char in token):
        for key, group in _SYNONYMS.items():
            if _distance(token, key) <= 1 and any(alt in blob for alt in group):
                return "synonym"
    return None


def search_matches(query, *parts):
    tokens = search_tokens(query)
    if not tokens:
        return False
    blob = fold(" ".join(part or "" for part in parts))
    words = _words(blob)
    return all(_kind(token, blob, words) for token in tokens)


def search_rank(query, *parts, code=""):
    tokens = search_tokens(query)
    if not tokens:
        return 0
    blob = fold(" ".join(part or "" for part in parts))
    words = _words(blob)
    score = 0
    folded_query = fold(query).strip()
    folded_code = fold(code).strip()
    if folded_code and folded_query == folded_code:
        score += 1000
    for token in tokens:
        kind = _kind(token, blob, words)
        if kind == "exact":
            score += 80
        elif kind == "synonym":
            score += 60
        elif kind == "fuzzy":
            score += 40
    return score
