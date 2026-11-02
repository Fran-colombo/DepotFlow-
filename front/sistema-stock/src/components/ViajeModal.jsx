import { useEffect, useState } from "react";
import { addViajeLines, createViaje, getItemById, getItemUnits, getPendingPlaces, searchItems } from "../api/items";
import { getObras } from "../api/obras";
import ObraPicker from "./ObraPicker";
import PersonPicker from "./PersonPicker";
import NumberInput from "./NumberInput";
import FeedbackModal from "./FeedbackModal";

export function todayKey() {
  const date = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function viajeOptionLabel(viaje) {
  const when = viaje.occurred_at
    ? new Date(viaje.occurred_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : "";
  const items = (viaje.items || []).join(", ");
  return [when, items || viaje.place].filter(Boolean).join(" · ");
}

let lineKey = 0;

function emptyLine(item, units, innerQuantity, maxPending) {
  lineKey += 1;
  return {
    key: lineKey,
    itemId: item.id,
    name: item.name,
    amount: "",
    codes: [],
    code: "",
    codesText: "",
    trackUnits: Boolean(item.track_units),
    innerQuantity: Boolean(innerQuantity || item.inner_quantity),
    consumable: Boolean(item.is_consumable),
    noReturn: Boolean(item.is_consumable),
    unitLabel: item.unit === "metro" ? "Metros" : "Cantidad",
    stockUnits: units,
    maxPending,
  };
}

export default function ViajeModal({ viaje = null, onClose, onSuccess }) {
  const adding = Boolean(viaje?.id);
  const [direction, setDirection] = useState(viaje?.direction || "retiro");
  const [person, setPerson] = useState(viaje?.person || "");
  const [place, setPlace] = useState(viaje?.place || "");
  const [occurredAt, setOccurredAt] = useState("");
  const [obras, setObras] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    getObras().then((data) => setObras(Array.isArray(data) ? data : [])).catch(() => setObras([]));
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchItems(term)
        .then((rows) => {
          if (!cancelled) setResults(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const changeDirection = (value) => {
    setDirection(value);
    setLines([]);
    setError("");
  };

  const changePlace = (value) => {
    setPlace(value);
    setLines([]);
    setError("");
  };

  const addProduct = async (product) => {
    if (!adding && !place) {
      setError(direction === "retiro" ? "Elegí la obra antes de agregar productos" : "Elegí de qué obra vuelve");
      return;
    }
    if (lines.some((line) => line.itemId === product.id)) {
      setError("Ese producto ya está en el viaje. Sumá la cantidad en la misma línea.");
      return;
    }
    setError("");
    try {
      const detail = await getItemById(product.id);
      const item = detail.item || detail;
      let units = [];
      let innerQuantity = Boolean(item.inner_quantity);
      if (item.track_units) {
        const data = await getItemUnits(product.id, direction === "retiro" ? "en_stock" : "all");
        units = Array.isArray(data?.units) ? data.units : [];
        innerQuantity = Boolean(data?.inner_quantity);
      }
      let maxPending = null;
      if (direction === "devolucion") {
        const places = await getPendingPlaces(product.id);
        const match = (Array.isArray(places) ? places : []).find((row) => row.place === place);
        maxPending = match ? match.pending_amount : 0;
      }
      setLines((prev) => [...prev, emptyLine(item, units, innerQuantity, maxPending)]);
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err.message || "No se pudo agregar el producto");
    }
  };

  const updateLine = (key, patch) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const buildLines = () => lines.map((line) => {
    let amount = parseInt(line.amount, 10);
    let codes;
    if (line.trackUnits && line.innerQuantity) {
      if (!line.code) throw new Error(`Elegí el código de ${line.name}`);
      codes = [line.code];
    } else if (line.trackUnits && direction === "retiro") {
      if (!line.codes.length) throw new Error(`Elegí las piezas de ${line.name}`);
      amount = line.codes.length;
      codes = line.codes;
    } else if (line.trackUnits && line.codesText) {
      codes = line.codesText.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean);
    }
    if (!amount || amount < 1) throw new Error(`Indicá la cantidad de ${line.name}`);
    if (direction === "devolucion" && line.maxPending != null && amount > line.maxPending) {
      throw new Error(`En esa obra hay ${line.maxPending} de ${line.name}`);
    }
    return {
      itemId: line.itemId,
      amount,
      ...(codes?.length ? { codes } : {}),
      ...(line.consumable || line.noReturn ? { noReturn: true } : {}),
    };
  });

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!adding && !person.trim()) {
      setError("Indicá quién");
      return;
    }
    if (!adding && !place) {
      setError("Elegí la obra");
      return;
    }
    if (lines.length === 0) {
      setError("Agregá al menos un producto");
      return;
    }
    let payload;
    try {
      payload = buildLines();
    } catch (err) {
      setError(err.message);
      return;
    }
    setSaving(true);
    try {
      if (adding) {
        await addViajeLines(viaje.id, payload);
      } else {
        await createViaje({
          direction,
          person: person.trim(),
          place,
          ...(occurredAt ? { occurredAt } : {}),
          lines: payload,
        });
      }
      setFeedback({ type: "success", message: adding ? "Quedó sumado al viaje." : "Quedó cargado el viaje." });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const title = adding
    ? `Agregar a este viaje · ${viaje.person || ""} · ${viaje.place || ""}`
    : "Nuevo viaje";

  return (
    <>
      <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }} onClick={onClose}>
        <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
          <form className="modal-content" onSubmit={submit}>
            <div className="modal-header">
              <h5 className="modal-title mb-0">{title}</h5>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
            </div>
            <div className="modal-body">
              {!adding && (
                <>
                  <div className="d-flex gap-3 mb-3">
                    <div className="form-check">
                      <input id="viaje-salen" type="radio" className="form-check-input" checked={direction === "retiro"} onChange={() => changeDirection("retiro")} />
                      <label className="form-check-label" htmlFor="viaje-salen">Se van</label>
                    </div>
                    <div className="form-check">
                      <input id="viaje-vuelven" type="radio" className="form-check-input" checked={direction === "devolucion"} onChange={() => changeDirection("devolucion")} />
                      <label className="form-check-label" htmlFor="viaje-vuelven">Vuelven</label>
                    </div>
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label">{direction === "retiro" ? "Quién lo retira" : "Quién lo devuelve"}</label>
                      <PersonPicker value={person} onChange={setPerson} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{direction === "retiro" ? "Obra" : "Obra de la que vuelve"}</label>
                      <ObraPicker obras={obras} value={place} onChange={changePlace} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Fecha y hora</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                    />
                    <div className="form-text">Si no ponés nada, el horario es ahora.</div>
                  </div>
                </>
              )}

              <label className="form-label">Agregar producto</label>
              <input
                type="text"
                className="form-control"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre..."
              />
              {results.length > 0 && (
                <div className="border rounded mt-1" style={{ maxHeight: 160, overflowY: "auto" }}>
                  {results.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      className="btn btn-link d-block text-start w-100 text-decoration-none px-2 py-1"
                      onClick={() => addProduct(product)}
                    >
                      {product.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="d-flex flex-column gap-3 mt-3">
                {lines.map((line) => (
                  <div key={line.key} className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                      <div className="fw-semibold">{line.name}</div>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}>
                        Quitar
                      </button>
                    </div>
                    {direction === "devolucion" && (
                      <div className="form-text mb-2">
                        {line.maxPending ? `Pendientes en esa obra: ${line.maxPending}` : "No hay pendientes de este producto en esa obra."}
                      </div>
                    )}
                    {line.trackUnits && line.innerQuantity && (
                      <div className="mb-2">
                        <label className="form-label">Código</label>
                        <select className="form-select" value={line.code} onChange={(e) => updateLine(line.key, { code: e.target.value, amount: "" })}>
                          <option value="">Elegir código</option>
                          {line.stockUnits.map((unit) => (
                            <option key={unit.id} value={unit.code}>
                              {unit.code}{unit.name ? ` ${unit.name}` : ""}{unit.quantity != null ? ` · ${unit.quantity}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {line.trackUnits && !line.innerQuantity && direction === "retiro" && (
                      <div className="border rounded mb-2" style={{ maxHeight: 140, overflowY: "auto" }}>
                        {line.stockUnits.length === 0 ? (
                          <div className="small text-secondary p-2">No hay piezas en depósito.</div>
                        ) : line.stockUnits.map((unit) => (
                          <label key={unit.id} className="d-flex align-items-center gap-2 px-2 py-1 mb-0 border-bottom">
                            <input
                              type="checkbox"
                              className="form-check-input m-0"
                              checked={line.codes.includes(unit.code)}
                              onChange={() => {
                                const codes = line.codes.includes(unit.code)
                                  ? line.codes.filter((code) => code !== unit.code)
                                  : [...line.codes, unit.code];
                                updateLine(line.key, { codes });
                              }}
                            />
                            <span>{unit.code}{unit.name ? ` · ${unit.name}` : ""}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {line.trackUnits && direction === "devolucion" && !line.innerQuantity && (
                      <div className="mb-2">
                        <label className="form-label">Códigos (opcional)</label>
                        <input
                          type="text"
                          className="form-control"
                          value={line.codesText || ""}
                          placeholder="Si lo dejás vacío vuelven las más antiguas"
                          onChange={(e) => updateLine(line.key, { codesText: e.target.value })}
                        />
                      </div>
                    )}
                    {!(line.trackUnits && !line.innerQuantity && direction === "retiro") && (
                      <div className="mb-2">
                        <label className="form-label">{line.unitLabel}</label>
                        <NumberInput
                          className="form-control"
                          value={line.amount}
                          min={1}
                          onChange={(e) => updateLine(line.key, { amount: e.target.value })}
                        />
                        {line.trackUnits && !line.innerQuantity && direction === "retiro" ? null : (
                          line.codes.length > 0 && direction === "retiro" && !line.innerQuantity
                            ? <div className="form-text">{line.codes.length} piezas</div>
                            : null
                        )}
                      </div>
                    )}
                    {line.trackUnits && !line.innerQuantity && direction === "retiro" && (
                      <div className="form-text mb-2">{line.codes.length} pieza{line.codes.length === 1 ? "" : "s"} elegida{line.codes.length === 1 ? "" : "s"}</div>
                    )}
                    {direction === "retiro" && line.trackUnits && !line.consumable && (
                      <div className="form-check">
                        <input
                          id={`viaje-no-vuelve-${line.key}`}
                          type="checkbox"
                          className="form-check-input"
                          checked={line.noReturn}
                          onChange={(e) => updateLine(line.key, { noReturn: e.target.checked })}
                        />
                        <label className="form-check-label" htmlFor={`viaje-no-vuelve-${line.key}`}>No vuelve al depósito</label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {error && <div className="alert alert-danger py-2 px-3 mt-3 mb-0">{error}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Guardando..." : adding ? "Agregar" : "Cargar viaje"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <FeedbackModal
        open={Boolean(feedback)}
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => {
          const done = feedback?.type === "success";
          setFeedback(null);
          if (done) onSuccess?.();
        }}
      />
    </>
  );
}
