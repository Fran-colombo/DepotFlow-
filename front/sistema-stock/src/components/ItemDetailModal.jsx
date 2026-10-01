import { useEffect, useMemo, useState } from "react";
import {
  addObservation,
  deleteUnitImage,
  devolverItem,
  getItemUnits,
  getUnitImageUrl,
  getUnitObservations,
  identifyItem,
  retirarItem,
  uploadUnitImage,
} from "../api/items";
import { printLabels } from "./printLabels";

const ACTION_LABEL = {
  retiro: "Retiro",
  devolucion: "Devolución",
  carga: "Carga",
  traslado: "Traslado",
};

function defaultPrefix(name) {
  const clean = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
  return (clean[0] || "K").toUpperCase();
}

function lastRetiroPlace(unit) {
  const rows = [...(unit.history || [])].reverse();
  const retiro = rows.find((row) => row.action === "retiro" && row.place);
  return retiro?.place || "";
}

const PieceCard = ({
  unit,
  item,
  selectable,
  selected,
  onToggle,
  onReload,
  returnPlace,
  onReturnPlace,
  onReturn,
  returning,
}) => {
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getUnitObservations(unit.id)
      .then((rows) => {
        if (!cancelled) setNotes(rows || []);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [unit.id]);

  const saveNote = async () => {
    const description = note.trim();
    if (!description) return;
    setNoteBusy(true);
    setLocalError("");
    try {
      const created = await addObservation(item.id, description, "", unit.id);
      setNotes((prev) => [...prev, created]);
      setNote("");
    } catch (err) {
      setLocalError(err.message || "No se pudo guardar la observación");
    } finally {
      setNoteBusy(false);
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setLocalError("");
    try {
      await uploadUnitImage(unit.id, file);
      onReload?.();
    } catch (err) {
      setLocalError(err.message || "No se pudo cargar la foto");
    }
  };

  const removePhoto = async () => {
    setLocalError("");
    try {
      await deleteUnitImage(unit.id);
      onReload?.();
    } catch (err) {
      setLocalError(err.message || "No se pudo borrar la foto");
    }
  };

  const imageUrl = getUnitImageUrl(unit);

  return (
    <div className="border rounded p-3 mb-2 bg-white">
      <div className="d-flex gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="form-check-input mt-1"
            checked={selected}
            onChange={() => onToggle(unit.id)}
            aria-label={`Seleccionar ${unit.code}`}
          />
        )}
        <div style={{ width: 72, flexShrink: 0 }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={unit.code}
              className="rounded border"
              style={{ width: 72, height: 72, objectFit: "cover" }}
            />
          ) : (
            <div
              className="rounded border d-flex align-items-center justify-content-center text-secondary"
              style={{ width: 72, height: 72, background: "#f6f7f9" }}
            >
              <i className="bi bi-camera"></i>
            </div>
          )}
        </div>
        <div className="flex-grow-1">
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div>
              <div className="fs-5 fw-bold">{unit.code}</div>
              <div className="app-muted small">{unit.status_label}</div>
            </div>
            <div className="d-flex flex-wrap gap-1 justify-content-end">
              <label className="btn btn-sm btn-outline-secondary mb-0">
                {imageUrl ? "Cambiar foto" : "Foto"}
                <input type="file" accept="image/*" hidden onChange={onFile} />
              </label>
              {imageUrl && (
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={removePhoto}>
                  Quitar foto
                </button>
              )}
              {unit.status === "retirada" && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={returning}
                  onClick={() => onReturn(unit)}
                >
                  Devolver
                </button>
              )}
            </div>
          </div>
          {unit.status === "retirada" && (
            <input
              className="form-control form-control-sm mt-2"
              placeholder="Obra desde la que vuelve"
              value={returnPlace}
              onChange={(e) => onReturnPlace(unit.id, e.target.value)}
            />
          )}
          {unit.history?.length > 0 && (
            <ul className="list-unstyled small mb-0 mt-2">
              {unit.history.map((row, index) => (
                <li key={`${unit.id}-h-${index}`} className="text-secondary">
                  {ACTION_LABEL[row.action] || row.action}
                  {row.place ? ` · ${row.place}` : ""}
                  {row.person ? ` · ${row.person}` : ""}
                  {row.date ? ` · ${new Date(row.date).toLocaleString()}` : ""}
                </li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <ul className="list-unstyled small mb-0 mt-2">
              {notes.map((entry) => (
                <li key={entry.id}>
                  {entry.description}
                  <span className="text-secondary">
                    {" "}
                    · {entry.observed_by || entry.user_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="d-flex gap-2 mt-2">
            <input
              className="form-control form-control-sm"
              placeholder="Observación de esta pieza"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveNote();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={noteBusy || !note.trim()}
              onClick={saveNote}
            >
              Anotar
            </button>
          </div>
          {localError && <div className="text-danger small mt-1">{localError}</div>}
        </div>
      </div>
    </div>
  );
};

const ItemDetailModal = ({ item, isOpen, onClose, onChanged }) => {
  const [units, setUnits] = useState([]);
  const [trackUnits, setTrackUnits] = useState(false);
  const [consumable, setConsumable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefix, setPrefix] = useState("K");
  const [selected, setSelected] = useState({});
  const [place, setPlace] = useState("");
  const [person, setPerson] = useState("");
  const [returnPlaces, setReturnPlaces] = useState({});
  const [busy, setBusy] = useState(false);
  const [freshCodes, setFreshCodes] = useState([]);

  const reload = () => {
    if (!item?.id) return Promise.resolve();
    return getItemUnits(item.id, "all").then((data) => {
      const next = data.units || [];
      setUnits(next);
      setTrackUnits(Boolean(data.track_units));
      setConsumable(Boolean(data.is_consumable));
      setReturnPlaces((prev) => {
        const places = {};
        next
          .filter((unit) => unit.status === "retirada")
          .forEach((unit) => {
            places[unit.id] = prev[unit.id] || lastRetiroPlace(unit);
          });
        return places;
      });
    });
  };

  useEffect(() => {
    if (!isOpen || !item?.id) return;
    setError("");
    setSelected({});
    setPlace("");
    setPerson("");
    setFreshCodes([]);
    setPrefix(defaultPrefix(item.name));
    setTrackUnits(Boolean(item.track_units));
    setConsumable(Boolean(item.is_consumable));
    let cancelled = false;
    setLoading(true);
    getItemUnits(item.id, "all")
      .then((data) => {
        if (cancelled) return;
        setUnits(data.units || []);
        setTrackUnits(Boolean(data.track_units));
        setConsumable(Boolean(data.is_consumable));
        const places = {};
        (data.units || [])
          .filter((unit) => unit.status === "retirada")
          .forEach((unit) => {
            places[unit.id] = lastRetiroPlace(unit);
          });
        setReturnPlaces(places);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se pudo abrir el detalle");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, item]);

  const inStock = useMemo(() => units.filter((unit) => unit.status === "en_stock"), [units]);
  const onSite = useMemo(() => units.filter((unit) => unit.status === "retirada"), [units]);
  const used = useMemo(() => units.filter((unit) => unit.status === "consumida"), [units]);
  const selectedUnits = inStock.filter((unit) => selected[unit.id]);
  const showUsed = consumable || used.length > 0;

  if (!isOpen || !item) return null;

  const toggle = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleIdentify = async () => {
    const clean = prefix.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,3}$/.test(clean)) {
      setError("El prefijo es una letra, por ejemplo H");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await identifyItem(item.id, clean);
      setFreshCodes(result.codes || []);
      setTrackUnits(true);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo identificar el stock");
    } finally {
      setBusy(false);
    }
  };

  const handleRetiro = async () => {
    if (!selectedUnits.length) return;
    if (!place.trim()) {
      setError("Indicá la obra o el lugar");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await retirarItem({
        itemId: item.id,
        amount: selectedUnits.length,
        place: place.trim(),
        ...(person.trim() && { personWhoTook: person.trim() }),
        codes: selectedUnits.map((unit) => unit.code),
        noReturn: consumable,
      });
      setSelected({});
      setPlace("");
      setPerson("");
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo retirar");
    } finally {
      setBusy(false);
    }
  };

  const handleReturn = async (unit) => {
    const where = (returnPlaces[unit.id] || "").trim();
    if (!where) {
      setError("Indicá la obra desde la que vuelve");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await devolverItem({
        itemId: item.id,
        amount: 1,
        place: where,
        codes: [unit.code],
      });
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo devolver");
    } finally {
      setBusy(false);
    }
  };

  const printCodes = (codes) => {
    printLabels(item.name, codes, item.category || "");
  };

  const section = (title, list, selectable) => (
    <section className="mb-4">
      <h6 className="mb-2">
        {title} <span className="text-secondary fw-normal">({list.length})</span>
      </h6>
      {list.length === 0 ? (
        <div className="text-secondary small">No hay piezas en esta sección.</div>
      ) : (
        list.map((unit) => (
          <PieceCard
            key={unit.id}
            unit={unit}
            item={item}
            selectable={selectable}
            selected={Boolean(selected[unit.id])}
            onToggle={toggle}
            onReload={() => {
              reload().catch((err) => setError(err.message || "No se pudo actualizar"));
            }}
            returnPlace={returnPlaces[unit.id] || ""}
            onReturnPlace={(id, value) => setReturnPlaces((prev) => ({ ...prev, [id]: value }))}
            onReturn={handleReturn}
            returning={busy}
          />
        ))
      )}
    </section>
  );

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded shadow-lg">
          <div className="modal-header">
            <div>
              <h5 className="modal-title mb-0">{item.name}</h5>
              <div className="text-secondary small">{item.category}</div>
            </div>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : !trackUnits ? (
              <div>
                <p className="mb-2">
                  <strong>{item.actualAmount ?? 0} en depósito.</strong> Este grupo se lleva por cantidad.
                  El retiro sigue siendo un número, no una pieza.
                </p>
                {(item.actualAmount ?? 0) > 0 && (
                  <div className="border rounded p-3">
                    <label className="form-label" htmlFor="unit-prefix">
                      Prefijo para identificar el stock actual
                    </label>
                    <div className="d-flex gap-2">
                      <input
                        id="unit-prefix"
                        className="form-control"
                        style={{ maxWidth: 120 }}
                        value={prefix}
                        maxLength={4}
                        onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={handleIdentify}
                      >
                        Identificar
                      </button>
                    </div>
                    <div className="form-text">
                      Hormigonera con H genera H-001, H-002, H-003. Después se pueden imprimir las etiquetas.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {freshCodes.length > 0 && (
                  <div className="alert alert-success d-flex justify-content-between align-items-center gap-2">
                    <span>Identificadas: {freshCodes.join(", ")}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      onClick={() => printCodes(freshCodes)}
                    >
                      Imprimir etiquetas
                    </button>
                  </div>
                )}
                {inStock.length > 0 && (
                  <div className="d-flex justify-content-end mb-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() =>
                        printCodes(
                          (selectedUnits.length ? selectedUnits : inStock).map((unit) => unit.code)
                        )
                      }
                    >
                      Imprimir etiquetas
                    </button>
                  </div>
                )}
                {section("En depósito", inStock, true)}
                {selectedUnits.length > 0 && (
                  <div className="border rounded p-3 mb-4 bg-light">
                    <div className="fw-semibold mb-2">
                      Retirar {selectedUnits.map((unit) => unit.code).join(", ")}
                    </div>
                    <div className="row g-2">
                      <div className="col-md-6">
                        <input
                          className="form-control"
                          placeholder="Obra o lugar"
                          value={place}
                          onChange={(e) => setPlace(e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <input
                          className="form-control"
                          placeholder="Quién lo retira"
                          value={person}
                          onChange={(e) => setPerson(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger mt-2"
                      disabled={busy}
                      onClick={handleRetiro}
                    >
                      {consumable ? "Retirar y marcar usadas" : "Retirar a obra"}
                    </button>
                  </div>
                )}
                {section("En obra", onSite, false)}
                {showUsed && section("Usadas", used, false)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
