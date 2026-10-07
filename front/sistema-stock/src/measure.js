export function isMetro(unit) {
  return unit === "metro";
}

export function measureMark(unit) {
  return isMetro(unit) ? " m" : "";
}

export function measureNoun(unit) {
  return isMetro(unit) ? "metros" : "unidades";
}
