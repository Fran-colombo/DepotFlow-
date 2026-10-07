import { useEffect, useMemo, useState } from "react";
import {
  addObservation,
  deleteUnitImage,
  devolverItem,
  getItemUnits,
  getUnitImageUrl,
  addPiece,
  getNextCodes,
  getUnitObservations,
  updateObservation,
  retirarItem,
  updateItem,
  updateUnitProfile,
  uploadUnitImage,
} from "../api/items";
import { getObras } from "../api/obras";
import FeedbackModal from "./FeedbackModal";
import ObraPicker from "./ObraPicker";
import { printLabels } from "./printLabels";
import useAuth from "../hooks/useAuth";
import { isMetro, measureMark, measureNoun } from "../measure";

const ACTION_LABEL = {
  retiro: "Retiro",
  devolucion: "Devolución",
  carga: "Carga",
  traslado: "Traslado",
};

const REPAIR_PLACE = "Reparación";

function lastRetiroPlace(unit) {
  const rows = [...(unit.history || [])].reverse();
  const retiro = rows.find((row) => row.action === "retiro" && row.place && row.place !== REPAIR_PLACE);
  return retiro?.place || "";
}

function formatNoteWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function codePrefixOf(code) {
  const text = String(code || "").trim().toUpperCase();
  const current = text.match(/^(.+)-(\d{2})-(\d+)$/);
  if (current) return current[1];
  const legacy = text.match(/^([A-Z](?:[A-Z0-9]|-(?=[A-Z0-9]))*)-(\d+)$/);
  if (legacy) return legacy[1];
  return text;
}

function repairAmountOf(unit) {
  return (Array.isArray(unit.out_places) ? unit.out_places : [])
    .filter((row) => row.place === REPAIR_PLACE && row.quantity > 0)
    .reduce((sum, row) => sum + (row.quantity || 0), 0);
}

const PieceCard = ({
  unit,
  item,
  selectable,
  selected,
  onToggle,
  onReload,
  onRetire,
  onDevolver,
  onShowHistory,
  onEditQuantity,
  returning,
  place = "depot",
  isAdmin = false,
  onFeedback,
}) => {
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState("");
  const [noteBy, setNoteBy] = useState("");
  const [shownNotes, setShownNotes] = useState(3);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [editBy, setEditBy] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [draftName, setDraftName] = useState(unit.name || "");
  const [draftBroken, setDraftBroken] = useState(Boolean(unit.is_broken));
  const [draftDamage, setDraftDamage] = useState(unit.damage_note || "");
  const [draftRepair, setDraftRepair] = useState(unit.repair_note || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

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

  useEffect(() => {
    setShownNotes(3);
    setEditingId(null);
    setNote("");
    setNoteBy("");
  }, [unit.id]);

  useEffect(() => {
    setDraftName(unit.name || "");
    setDraftBroken(Boolean(unit.is_broken));
    setDraftDamage(unit.damage_note || "");
    setDraftRepair(unit.repair_note || "");
  }, [unit.id, unit.name, unit.is_broken, unit.damage_note, unit.repair_note]);

  const saveProfile = async () => {
    if (!draftName.trim()) {
      setLocalError("El nombre de la pieza es obligatorio");
      return;
    }
    setSavingProfile(true);
    setLocalError("");
    try {
      await updateUnitProfile(unit.id, {
        name: draftName.trim(),
        is_broken: draftBroken,
        damage_note: draftBroken ? draftDamage.trim() : "",
        repair_note: draftBroken ? draftRepair.trim() : "",
      });
      onReload?.();
      onFeedback?.({ type: "success", message: "Se guardó la pieza." });
    } catch (err) {
      const message = err.message || "No se pudo guardar la pieza";
      setLocalError(message);
      onFeedback?.({ type: "error", message });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveNote = async () => {
    const description = note.trim();
    if (!description) return;
    setNoteBusy(true);
    setLocalError("");
    try {
      const created = await addObservation(item.id, description, noteBy, unit.id);
      setNotes((prev) => [...prev, created]);
      setNote("");
      setNoteBy("");
    } catch (err) {
      setLocalError(err.message || "No se pudo guardar la observación");
    } finally {
      setNoteBusy(false);
    }
  };

  const saveEdit = async () => {
    const description = editText.trim();
    if (!description || editingId == null) return;
    setNoteBusy(true);
    setLocalError("");
    try {
      const updated = await updateObservation(editingId, description, editBy);
      setNotes((prev) => prev.map((row) => (row.id === editingId ? updated : row)));
      setEditingId(null);
    } catch (err) {
      setLocalError(err.message || "No se pudo editar la observación");
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
  const inner = Boolean(item.inner_quantity);
  const outPlaces = Array.isArray(unit.out_places) ? unit.out_places.filter((row) => row.quantity > 0) : [];
  const obraPlaces = outPlaces.filter((row) => row.place !== REPAIR_PLACE);
  const repairAmount = repairAmountOf(unit);
  const obraLine = obraPlaces
    .map((row) => (inner ? `${row.place} ${row.quantity}` : row.place))
    .filter(Boolean)
    .join(" · ");
  const statusText = place === "repair"
    ? "Fuera de servicio"
    : inner && place === "obra"
      ? "En obra"
      : inner && place === "depot"
        ? "En depósito"
        : unit.status_label;
  const canRetire = place === "depot" && (inner ? (unit.quantity || 0) > 0 : unit.status === "en_stock");
  const canReturn = place === "repair"
    ? (inner ? repairAmount > 0 : unit.status === "fuera_de_servicio")
    : place === "obra" && (inner ? obraPlaces.length > 0 : unit.status === "retirada");
  const orderedNotes = [...notes].sort((a, b) => {
    const left = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    if (left) return left;
    return (b.id || 0) - (a.id || 0);
  });
  const visibleNotes = orderedNotes.slice(0, shownNotes);
  const canEditQty = isAdmin && inner && unit.status !== "consumida" && (place === "depot" || (unit.quantity || 0) === 0);

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
            <button
              type="button"
              className="btn p-0 border-0"
              title="Agrandar foto"
              onClick={() => setPhotoOpen(true)}
            >
              <img
                src={imageUrl}
                alt={unit.code}
                className="rounded border"
                style={{ width: 72, height: 72, objectFit: "cover", cursor: "zoom-in" }}
              />
            </button>
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
              {unit.name && <div className="fw-semibold">{unit.name}</div>}
              <div className="app-muted small">
                {statusText}
                {place === "depot" ? ` · ${unit.quantity ?? 1}${isMetro(item.unit) ? " m" : " en el código"}` : ""}
                {place === "obra" && obraLine ? ` · ${obraLine}` : ""}
                {place === "repair" && inner && repairAmount > 0 ? ` · ${repairAmount}` : ""}
                {unit.is_broken ? " · Rota" : ""}
              </div>
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
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => onShowHistory(unit)}
              >
                Historial
              </button>
              {canEditQty && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  disabled={returning}
                  onClick={() => onEditQuantity(unit)}
                >
                  Actualizar cantidad
                </button>
              )}
              {canRetire && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={returning}
                  onClick={() => onRetire(unit)}
                >
                  Retirar
                </button>
              )}
              {canReturn && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  disabled={returning}
                  onClick={() => onDevolver(unit)}
                >
                  {place === "repair" ? "Volver al depósito" : "Devolver"}
                </button>
              )}
            </div>
          </div>
          {unit.is_broken && (
            <div className="alert alert-warning py-2 small mt-2 mb-0">
              <div className="fw-semibold">Rota</div>
              {unit.damage_note && <div>Qué le pasó: {unit.damage_note}</div>}
              {unit.repair_note && <div>Qué habría que hacer: {unit.repair_note}</div>}
            </div>
          )}
          {orderedNotes.length > 0 && (
            <div className="small mt-2">
              <ul className="list-unstyled mb-1">
                {visibleNotes.map((entry) => (
                  <li key={entry.id} className="mb-2">
                    {editingId === entry.id ? (
                      <div className="d-flex flex-column gap-1">
                        <input
                          className="form-control form-control-sm"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                        />
                        <input
                          className="form-control form-control-sm"
                          value={editBy}
                          placeholder="Si lo dejás vacío, fuiste vos"
                          onChange={(e) => setEditBy(e.target.value)}
                        />
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={noteBusy || !editText.trim()}
                            onClick={saveEdit}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={noteBusy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>{entry.description}</div>
                        <div className="text-secondary">
                          {formatNoteWhen(entry.date)}
                          {(formatNoteWhen(entry.date) ? " · " : "")}
                          {entry.observed_by || entry.user_name}
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0"
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditText(entry.description || "");
                              setEditBy(entry.observed_by || "");
                            }}
                          >
                            Editar
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {orderedNotes.length > shownNotes && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => setShownNotes((count) => count + 5)}
                >
                  Ver más
                </button>
              )}
            </div>
          )}
          <div className="border rounded p-2 mt-2">
            <input
              className="form-control form-control-sm mb-2"
              value={draftName}
              placeholder="Nombre de la pieza"
              onChange={(e) => setDraftName(e.target.value)}
            />
            <div className="form-check mb-2">
              <input
                id={`broken-${place}-${unit.id}`}
                type="checkbox"
                className="form-check-input"
                checked={draftBroken}
                onChange={(e) => setDraftBroken(e.target.checked)}
              />
              <label className="form-check-label" htmlFor={`broken-${place}-${unit.id}`}>Rota</label>
            </div>
            {draftBroken && (
              <>
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows="2"
                  placeholder="Qué le pasó"
                  value={draftDamage}
                  onChange={(e) => setDraftDamage(e.target.value)}
                />
                <textarea
                  className="form-control form-control-sm mb-2"
                  rows="2"
                  placeholder="Qué habría que hacer"
                  value={draftRepair}
                  onChange={(e) => setDraftRepair(e.target.value)}
                />
              </>
            )}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={savingProfile}
              onClick={saveProfile}
            >
              Guardar pieza
            </button>
          </div>
          <div className="d-flex flex-column gap-2 mt-2">
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
            <div className="d-flex gap-2">
              <input
                className="form-control form-control-sm"
                placeholder="Quién la anotó. Vacío: fuiste vos"
                value={noteBy}
                onChange={(e) => setNoteBy(e.target.value)}
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
          </div>
          {localError && <div className="text-danger small mt-1">{localError}</div>}
        </div>
      </div>
      {photoOpen && imageUrl && (
        <div
          className="modal show d-block"
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.72)", zIndex: 1080 }}
          onClick={() => setPhotoOpen(false)}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content bg-transparent border-0 shadow-none">
              <div className="d-flex justify-content-end mb-2">
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Cerrar"
                  onClick={() => setPhotoOpen(false)}
                />
              </div>
              <img
                src={imageUrl}
                alt={unit.code}
                className="img-fluid rounded bg-white"
                style={{ maxHeight: "80vh", width: "100%", objectFit: "contain" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ItemDetailModal = ({ item, isOpen, onClose, onChanged, focusCode = "" }) => {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "sysadmin";
  const [units, setUnits] = useState([]);
  const [codeFilter, setCodeFilter] = useState(focusCode || "");
  const [trackUnits, setTrackUnits] = useState(false);
  const [consumable, setConsumable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyUnit, setHistoryUnit] = useState(null);
  const [actionUnit, setActionUnit] = useState(null);
  const [popupPlace, setPopupPlace] = useState("");
  const [popupPerson, setPopupPerson] = useState("");
  const [popupError, setPopupError] = useState("");
  const [popupAmount, setPopupAmount] = useState(1);
  const [retireScope, setRetireScope] = useState("parcial");
  const [retireRepair, setRetireRepair] = useState(false);
  const [returnFromRepair, setReturnFromRepair] = useState(false);
  const [qtyUnit, setQtyUnit] = useState(null);
  const [qtyValue, setQtyValue] = useState("");
  const [qtyError, setQtyError] = useState("");
  const [obras, setObras] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [freshCodes, setFreshCodes] = useState([]);
  const [pieceCode, setPieceCode] = useState("");
  const [pieceName, setPieceName] = useState("");
  const [pieceNote, setPieceNote] = useState("");
  const [pieceBroken, setPieceBroken] = useState(false);
  const [pieceDamage, setPieceDamage] = useState("");
  const [pieceRepair, setPieceRepair] = useState("");
  const [pieceInside, setPieceInside] = useState("");
  const [innerQuantity, setInnerQuantity] = useState(false);
  const [measureUnit, setMeasureUnit] = useState(item?.unit || "unidad");
  const [piecePrefixChoice, setPiecePrefixChoice] = useState(item?.code_prefix || "");
  const [customPrefix, setCustomPrefix] = useState("");
  const [openGroups, setOpenGroups] = useState({});
  const [addingMore, setAddingMore] = useState(false);
  const [offerAnother, setOfferAnother] = useState(false);

  const reload = () => {
    if (!item?.id) return Promise.resolve();
    return getItemUnits(item.id, "all").then((data) => {
      const next = data.units || [];
      setUnits(next);
      setTrackUnits(Boolean(data.track_units));
      setConsumable(Boolean(data.is_consumable));
      setInnerQuantity(Boolean(data.inner_quantity));
      if (data.unit) setMeasureUnit(data.unit);
    });
  };

  useEffect(() => {
    if (!isOpen || !item?.id) return;
    setError("");
    setActionUnit(null);
    setQtyUnit(null);
    getObras()
      .then((data) => setObras(Array.isArray(data) ? data : []))
      .catch(() => setObras([]));
    setFreshCodes([]);
    setPieceCode("");
    setPieceName("");
    setPieceNote("");
    setPieceBroken(false);
    setPieceDamage("");
    setPieceRepair("");
    setPieceInside("");
    setAddingMore(false);
    setOfferAnother(false);
    setCodeFilter(focusCode || "");
    setTrackUnits(Boolean(item.track_units));
    setConsumable(Boolean(item.is_consumable));
    setInnerQuantity(Boolean(item.inner_quantity));
    setMeasureUnit(item.unit || "unidad");
    setPiecePrefixChoice(item.code_prefix || "");
    setCustomPrefix("");
    setOpenGroups({});
    let cancelled = false;
    setLoading(true);
    getItemUnits(item.id, "all")
      .then((data) => {
        if (cancelled) return;
        setUnits(data.units || []);
        setTrackUnits(Boolean(data.track_units));
        setConsumable(Boolean(data.is_consumable));
        setInnerQuantity(Boolean(data.inner_quantity ?? item.inner_quantity));
        if (data.unit) setMeasureUnit(data.unit);
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
  }, [isOpen, item, focusCode]);

  const knownPrefixes = useMemo(() => {
    const list = [];
    const push = (value) => {
      const prefix = codePrefixOf(value);
      if (prefix && !list.includes(prefix)) list.push(prefix);
    };
    if (item?.code_prefix) push(item.code_prefix);
    units.forEach((unit) => push(unit.code));
    return list;
  }, [units, item?.code_prefix]);

  useEffect(() => {
    if (!isOpen || !trackUnits || offerAnother) return;
    if (units.length > 0 && !addingMore) return;
    const prefix = piecePrefixChoice === "__new__"
      ? customPrefix.trim().toUpperCase()
      : (piecePrefixChoice || item?.code_prefix || "");
    if (!prefix) return;
    let cancelled = false;
    getNextCodes(1, prefix)
      .then((data) => {
        if (!cancelled) setPieceCode(data.codes?.[0] || "");
      })
      .catch(() => {
        if (!cancelled) setPieceCode("");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, trackUnits, item?.code_prefix, units.length, addingMore, offerAnother, piecePrefixChoice, customPrefix]);

  const addPiece = async () => {
    const code = pieceCode.trim();
    if (!item?.id || !code) {
      setError("Falta el código de la pieza");
      return;
    }
    if (!pieceName.trim()) {
      setError("El nombre de la pieza es obligatorio");
      return;
    }
    const inside = parseInt(pieceInside, 10);
    if (innerQuantity && (!inside || inside < 1)) {
      setError("Indicá cuántos hay adentro");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addPiece(item.id, {
        code,
        name: pieceName.trim(),
        observation: pieceNote.trim(),
        is_broken: pieceBroken,
        damage_note: pieceBroken ? pieceDamage.trim() : "",
        repair_note: pieceBroken ? pieceRepair.trim() : "",
        ...(innerQuantity ? { quantity: inside } : {}),
      });
      setPieceName("");
      setPieceNote("");
      setPieceBroken(false);
      setPieceDamage("");
      setPieceRepair("");
      setPieceInside("");
      setOfferAnother(true);
      setAddingMore(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo agregar la pieza");
    } finally {
      setBusy(false);
    }
  };

  const visibleUnits = useMemo(() => {
    const query = codeFilter.trim().toLowerCase();
    if (!query) return units;
    return units.filter((unit) => {
      const code = (unit.code || "").toLowerCase();
      const name = (unit.name || "").toLowerCase();
      return code.includes(query) || name.includes(query);
    });
  }, [units, codeFilter]);
  const inStock = useMemo(() => visibleUnits.filter((unit) => {
    if (unit.status === "consumida") return false;
    if (innerQuantity) return (unit.quantity || 0) > 0;
    return unit.status === "en_stock";
  }), [visibleUnits, innerQuantity]);
  const onSite = useMemo(() => visibleUnits.filter((unit) => {
    if (unit.status === "consumida") return false;
    if (innerQuantity) {
      return (unit.out_places || []).some((row) => row.place !== REPAIR_PLACE && row.quantity > 0);
    }
    return unit.status === "retirada";
  }), [visibleUnits, innerQuantity]);
  const inRepair = useMemo(() => visibleUnits.filter((unit) => {
    if (unit.status === "consumida") return false;
    if (innerQuantity) return repairAmountOf(unit) > 0;
    return unit.status === "fuera_de_servicio";
  }), [visibleUnits, innerQuantity]);
  const used = useMemo(() => visibleUnits.filter((unit) => unit.status === "consumida"), [visibleUnits]);
  const showUsed = consumable || used.length > 0;

  if (!isOpen || !item) return null;

  const openRetire = (unit) => {
    setPopupPlace("");
    setPopupPerson("");
    setPopupError("");
    setPopupAmount("");
    setRetireScope("parcial");
    setRetireRepair(false);
    setActionUnit({ unit, kind: "retire" });
  };

  const openReturn = (unit, fromRepair = false) => {
    const obra = (unit.out_places || []).find((row) => row.place !== REPAIR_PLACE && row.quantity > 0);
    setReturnFromRepair(fromRepair);
    setPopupPlace(fromRepair ? REPAIR_PLACE : (obra?.place || lastRetiroPlace(unit)));
    setPopupPerson("");
    setPopupError("");
    setPopupAmount(1);
    setActionUnit({ unit, kind: "return" });
  };

  const handleRetiro = async () => {
    const unit = actionUnit?.unit;
    if (!unit) return;
    if (!retireRepair && !popupPlace.trim()) {
      setPopupError("Elegí una obra");
      return;
    }
    if (!popupPerson.trim()) {
      setPopupError("Indicá quién lo retira");
      return;
    }
    const max = actionUnit.unit.quantity || 0;
    const amount = !innerQuantity
      ? 1
      : retireScope === "total"
        ? max
        : parseInt(popupAmount, 10);
    if (innerQuantity && (!amount || amount < 1 || amount > max)) {
      setPopupError(`Podés retirar hasta ${max}`);
      return;
    }
    setBusy(true);
    setPopupError("");
    try {
      await retirarItem({
        itemId: item.id,
        amount,
        place: retireRepair ? REPAIR_PLACE : popupPlace.trim(),
        personWhoTook: popupPerson.trim(),
        codes: [unit.code],
        noReturn: retireRepair ? false : consumable,
        repair: retireRepair,
      });
      setActionUnit(null);
      await reload();
      onChanged?.();
    } catch (err) {
      setPopupError(err.message || "No se pudo retirar");
    } finally {
      setBusy(false);
    }
  };

  const handleReturn = async () => {
    const unit = actionUnit?.unit;
    if (!unit) return;
    if (!popupPlace.trim()) {
      setPopupError("Indicá la obra desde la que vuelve");
      return;
    }
    if (!popupPerson.trim()) {
      setPopupError("Indicá quién lo devuelve");
      return;
    }
    const amount = innerQuantity ? parseInt(popupAmount, 10) : 1;
    const max = returnFromRepair
      ? repairAmountOf(actionUnit.unit)
      : (actionUnit.unit.out_quantity || 0) - repairAmountOf(actionUnit.unit);
    if (innerQuantity && (!amount || amount < 1 || amount > max)) {
      setPopupError(`Podés devolver hasta ${max}`);
      return;
    }
    setBusy(true);
    setPopupError("");
    try {
      await devolverItem({
        itemId: item.id,
        amount,
        place: popupPlace.trim(),
        personWhoReturned: popupPerson.trim(),
        codes: [unit.code],
      });
      setActionUnit(null);
      setFeedback({ type: "success", message: "Se devolvió al depósito." });
      await reload();
      onChanged?.();
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo devolver" });
    } finally {
      setBusy(false);
    }
  };

  const printCodes = (codes) => {
    printLabels(item.name, codes, item.category || "");
  };

  const section = (title, list, place) => {
    const shown = innerQuantity && place === "depot"
      ? list.reduce((sum, unit) => sum + (unit.quantity || 0), 0)
      : innerQuantity && place === "obra"
        ? list.reduce((sum, unit) => {
            return sum + (unit.out_places || [])
              .filter((row) => row.place !== REPAIR_PLACE)
              .reduce((innerSum, row) => innerSum + (row.quantity || 0), 0);
          }, 0)
        : innerQuantity && place === "repair"
          ? list.reduce((sum, unit) => sum + repairAmountOf(unit), 0)
          : list.length;
    return (
    <section className="mb-4">
      <h6 className="mb-2">
        {title} <span className="text-secondary fw-normal">({shown}{isMetro(measureUnit) && place !== "used" ? " m" : ""})</span>
      </h6>
      {list.length === 0 ? (
        <div className="text-secondary small">No hay piezas en esta sección.</div>
      ) : (
        (() => {
          const groups = [];
          const byPrefix = new Map();
          list.forEach((unit) => {
            const prefix = codePrefixOf(unit.code) || "Sin prefijo";
            if (!byPrefix.has(prefix)) {
              const group = { prefix, units: [], sample: unit.name || "" };
              byPrefix.set(prefix, group);
              groups.push(group);
            } else if (!byPrefix.get(prefix).sample && unit.name) {
              byPrefix.get(prefix).sample = unit.name;
            }
            byPrefix.get(prefix).units.push(unit);
          });
          const filtering = Boolean(codeFilter.trim());
          const groupCount = (group) => {
            if (innerQuantity && place === "depot") {
              return group.units.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
            }
            if (innerQuantity && place === "obra") {
              return group.units.reduce((sum, unit) => sum + (unit.out_places || [])
                .filter((row) => row.place !== REPAIR_PLACE)
                .reduce((innerSum, row) => innerSum + (row.quantity || 0), 0), 0);
            }
            if (innerQuantity && place === "repair") {
              return group.units.reduce((sum, unit) => sum + repairAmountOf(unit), 0);
            }
            return group.units.length;
          };
          return groups.map((group) => {
            const key = `${place}:${group.prefix}`;
            const expanded = filtering || groups.length <= 1 || Boolean(openGroups[key]);
            return (
              <div key={key}>
                {groups.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-light border w-100 text-start mb-2"
                    onClick={() => {
                      if (filtering) return;
                      setOpenGroups((prev) => ({ ...prev, [key]: !expanded }));
                    }}
                  >
                    <span className="fw-semibold">{group.prefix}</span>
                    {group.sample ? ` · ${group.sample}` : ""}
                    <span className="text-secondary"> ({groupCount(group)}{isMetro(measureUnit) && place !== "used" ? " m" : ""})</span>
                  </button>
                )}
                {expanded && group.units.map((unit) => (
                  <PieceCard
                    key={`${place}-${unit.id}`}
                    unit={unit}
                    item={{ ...item, inner_quantity: innerQuantity, unit: measureUnit }}
                    place={place}
                    selectable={false}
                    selected={false}
                    onToggle={() => {}}
                    onReload={() => {
                      reload().catch((err) => setError(err.message || "No se pudo actualizar"));
                    }}
                    onRetire={openRetire}
                    onDevolver={place === "repair" ? (unit) => openReturn(unit, true) : (unit) => openReturn(unit, false)}
                    onShowHistory={setHistoryUnit}
                    isAdmin={isAdmin}
                    onEditQuantity={(next) => {
                      setQtyValue(next.quantity == null ? "" : String(next.quantity));
                      setQtyError("");
                      setQtyUnit(next);
                    }}
                    returning={busy}
                    onFeedback={setFeedback}
                  />
                ))}
              </div>
            );
          });
        })()
      )}
    </section>
    );
  };

  const historyRows = [...(historyUnit?.history || [])].reverse();

  return (
    <>
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
                  <strong>{item.actualAmount ?? 0}{measureMark(measureUnit)} en depósito.</strong> Este grupo se lleva por cantidad.
                  El retiro sigue siendo un número, no una pieza.
                </p>
                <p className="text-secondary small mb-0">
                  Para pasarlo a códigos, un administrador lo cambia en Actualizar stock.
                </p>
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
                        printCodes(inStock.map((unit) => unit.code))
                      }
                    >
                      Imprimir etiquetas
                    </button>
                  </div>
                )}
                {(units.length === 0 || addingMore || offerAnother) && (
                  <div className="border rounded p-3 mb-3">
                    {offerAnother ? (
                      <>
                        <p className="mb-2">Se agregó la pieza. ¿Agregar otra?</p>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setOfferAnother(false);
                              setAddingMore(true);
                              setPieceCode("");
                              setPieceName("");
                              setPieceNote("");
                              setPieceBroken(false);
                              setPieceDamage("");
                              setPieceRepair("");
                              setPieceInside("");
                            }}
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => {
                              setOfferAnother(false);
                              setAddingMore(false);
                            }}
                          >
                            No
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mb-2">
                          <strong>{item.category}</strong> · {item.name}
                          {units.length === 0 ? " está en 0." : ""} El próximo código usa {item.code_prefix}.
                        </p>
                        <div className="mb-2">
                          <label className="form-label mb-1">Tipo</label>
                          <select
                            className="form-select mb-2"
                            value={knownPrefixes.includes(piecePrefixChoice) ? piecePrefixChoice : (piecePrefixChoice === "__new__" ? "__new__" : (knownPrefixes[0] || ""))}
                            onChange={(e) => {
                              setPiecePrefixChoice(e.target.value);
                              if (e.target.value !== "__new__") setCustomPrefix("");
                            }}
                          >
                            {knownPrefixes.map((prefix) => (
                              <option key={prefix} value={prefix}>{prefix}</option>
                            ))}
                            <option value="__new__">Nuevo tipo</option>
                          </select>
                          {piecePrefixChoice === "__new__" && (
                            <input
                              className="form-control"
                              value={customPrefix}
                              placeholder="M-INT"
                              maxLength={12}
                              onChange={(e) => setCustomPrefix(e.target.value.toUpperCase())}
                            />
                          )}
                          <div className="form-text">El próximo código sigue ese prefijo. La subcategoría no cambia.</div>
                        </div>
                        <div className="mb-2">
                          <label className="form-label mb-1">Código</label>
                          <input
                            className="form-control"
                            value={pieceCode}
                            onChange={(e) => setPieceCode(e.target.value.toUpperCase())}
                          />
                        </div>
                        <div className="mb-2">
                          <label className="form-label mb-1">Nombre de la pieza</label>
                          <input
                            className="form-control"
                            value={pieceName}
                            placeholder="Amoladora chica Makita verde"
                            onChange={(e) => setPieceName(e.target.value)}
                          />
                        </div>
                        {innerQuantity && (
                          <div className="mb-2">
                            <label className="form-label mb-1">{isMetro(measureUnit) ? "Cuántos metros hay" : "Cuántos hay adentro"}</label>
                            <input
                              type="number"
                              min="1"
                              className="form-control"
                              value={pieceInside}
                              onChange={(e) => setPieceInside(e.target.value)}
                            />
                          </div>
                        )}
                        <div className="mb-2">
                          <label className="form-label mb-1">Observación</label>
                          <textarea
                            className="form-control"
                            rows="2"
                            value={pieceNote}
                            placeholder="Opcional"
                            onChange={(e) => setPieceNote(e.target.value)}
                          />
                        </div>
                        <div className="form-check mb-2">
                          <input
                            id="detail-piece-broken"
                            type="checkbox"
                            className="form-check-input"
                            checked={pieceBroken}
                            onChange={(e) => setPieceBroken(e.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="detail-piece-broken">Rota</label>
                        </div>
                        {pieceBroken && (
                          <>
                            <textarea
                              className="form-control mb-2"
                              rows="2"
                              placeholder="Qué le pasó"
                              value={pieceDamage}
                              onChange={(e) => setPieceDamage(e.target.value)}
                            />
                            <textarea
                              className="form-control mb-2"
                              rows="2"
                              placeholder="Qué habría que hacer"
                              value={pieceRepair}
                              onChange={(e) => setPieceRepair(e.target.value)}
                            />
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy || !pieceCode.trim() || !pieceName.trim() || (innerQuantity && !(parseInt(pieceInside, 10) >= 1))}
                          onClick={addPiece}
                        >
                          Agregar
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label mb-1" htmlFor="detail-code-filter">Código o nombre</label>
                  <input
                    id="detail-code-filter"
                    className="form-control"
                    value={codeFilter}
                    placeholder="HOR-26-001 o el nombre"
                    onChange={(e) => setCodeFilter(e.target.value)}
                  />
                </div>
                {codeFilter.trim() && inStock.length + onSite.length + inRepair.length + used.length === 0 && (
                  <p className="text-secondary mb-3">No hay una pieza con ese código.</p>
                )}
                {(!codeFilter.trim() || inStock.length > 0) && section("En depósito", inStock, "depot")}
                {(!codeFilter.trim() || onSite.length > 0) && section("En obra", onSite, "obra")}
                {inRepair.length > 0 && section("Fuera de servicio", inRepair, "repair")}
                {showUsed && (!codeFilter.trim() || used.length > 0) && section("Usadas", used, "used")}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    {qtyUnit && (
      <div
        className="modal show d-block fade"
        tabIndex="-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}
        onClick={() => !busy && setQtyUnit(null)}
      >
        <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content rounded shadow-lg">
            <div className="modal-header">
              <h5 className="modal-title mb-0">
                Actualizar cantidad {qtyUnit.code}
                {qtyUnit.name ? ` ${qtyUnit.name}` : ""}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => setQtyUnit(null)}
              ></button>
            </div>
            <div className="modal-body">
              <label className="form-label">{isMetro(measureUnit) ? "Cuántos metros quedan en este código" : "Cuántos quedan en este código"}</label>
              <input
                type="number"
                min="0"
                className="form-control"
                value={qtyValue}
                onChange={(e) => setQtyValue(e.target.value)}
              />
              <div className="form-text">Cambia lo que hay en depósito. No crea otro código.</div>
              {qtyError && <div className="alert alert-danger py-2 mt-3 mb-0">{qtyError}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setQtyUnit(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  if (qtyValue.trim() === "") {
                    setQtyError("Indicá la cantidad");
                    return;
                  }
                  const next = parseInt(qtyValue, 10);
                  if (Number.isNaN(next) || next < 0) {
                    setQtyError("La cantidad no puede ser negativa");
                    return;
                  }
                  setBusy(true);
                  setQtyError("");
                  try {
                    await updateItem(item.id, {
                      quantity: 0,
                      action: "add",
                      contents: [{ id: qtyUnit.id, quantity: next }],
                    });
                    setQtyUnit(null);
                    await reload();
                    onChanged?.();
                  } catch (err) {
                    setQtyError(err.message || "No se pudo actualizar la cantidad");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {actionUnit && (
      <div
        className="modal show d-block fade"
        tabIndex="-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}
        onClick={() => !busy && setActionUnit(null)}
      >
        <div
          className="modal-dialog modal-dialog-centered"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content rounded shadow-lg">
            <div className="modal-header">
              <h5 className="modal-title mb-0">
                {actionUnit.kind === "retire" ? "Retirar" : "Devolver"} {actionUnit.unit.code}
                {actionUnit.unit.name ? ` ${actionUnit.unit.name}` : ""}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Cerrar"
                disabled={busy}
                onClick={() => setActionUnit(null)}
              ></button>
            </div>
            <div className="modal-body">
              {actionUnit.kind === "retire" ? (
                <>
                  <div className="form-check mb-3">
                    <input
                      id="piece-retire-repair"
                      type="checkbox"
                      className="form-check-input"
                      checked={retireRepair}
                      onChange={(e) => setRetireRepair(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="piece-retire-repair">
                      Llevar a reparar
                    </label>
                    <div className="form-text">No es una obra. La pieza queda fuera de servicio.</div>
                  </div>
                  {!retireRepair && (
                    <div className="mb-3">
                      <label className="form-label">Obra de destino</label>
                      <ObraPicker obras={obras} value={popupPlace} onChange={setPopupPlace} />
                    </div>
                  )}
                </>
              ) : returnFromRepair ? (
                <p className="mb-3">Vuelve de reparación al depósito.</p>
              ) : (
                <div className="mb-3">
                  <label className="form-label">Obra desde la que vuelve</label>
                  <input
                    className="form-control"
                    value={popupPlace}
                    onChange={(e) => setPopupPlace(e.target.value)}
                  />
                </div>
              )}
              {innerQuantity && actionUnit.kind === "retire" && (
                <div className="mb-3">
                  <div className="form-check">
                    <input
                      id="piece-retire-parcial"
                      type="radio"
                      className="form-check-input"
                      name="piece-retire-scope"
                      checked={retireScope === "parcial"}
                      onChange={() => setRetireScope("parcial")}
                    />
                    <label className="form-check-label" htmlFor="piece-retire-parcial">Parcial</label>
                  </div>
                  <div className="form-check mb-2">
                    <input
                      id="piece-retire-total"
                      type="radio"
                      className="form-check-input"
                      name="piece-retire-scope"
                      checked={retireScope === "total"}
                      onChange={() => setRetireScope("total")}
                    />
                    <label className="form-check-label" htmlFor="piece-retire-total">Total</label>
                  </div>
                  {retireScope === "parcial" ? (
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={popupAmount}
                      onChange={(e) => setPopupAmount(e.target.value)}
                    />
                  ) : (
                    <div className="form-text">Se retiran los {actionUnit.unit.quantity ?? 0}{measureMark(measureUnit)} de este código.</div>
                  )}
                  {retireScope === "parcial" && (
                    <div className="form-text">En este código quedan {actionUnit.unit.quantity ?? 0}{measureMark(measureUnit)}.</div>
                  )}
                </div>
              )}
              {innerQuantity && actionUnit.kind === "return" && (
                <div className="mb-3">
                  <label className="form-label">{isMetro(measureUnit) ? "Cuántos metros" : "Cuántos"}</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={popupAmount}
                    onChange={(e) => setPopupAmount(e.target.value)}
                  />
                  <div className="form-text">
                    {returnFromRepair ? "En reparación" : "En obra"} hay{" "}
                    {returnFromRepair
                      ? repairAmountOf(actionUnit.unit)
                      : (actionUnit.unit.out_quantity || 0) - repairAmountOf(actionUnit.unit)}
                    .
                  </div>
                </div>
              )}
              <div className="mb-3">
                <label className="form-label">
                  {actionUnit.kind === "retire" ? "Quién lo retira" : "Quién lo devuelve"}
                </label>
                <input
                  className="form-control"
                  value={popupPerson}
                  onChange={(e) => setPopupPerson(e.target.value)}
                />
              </div>
              {popupError && <div className="alert alert-danger py-2">{popupError}</div>}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={() => setActionUnit(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${actionUnit.kind === "retire" ? "btn-danger" : "btn-success"}`}
                disabled={busy}
                onClick={actionUnit.kind === "retire" ? handleRetiro : handleReturn}
              >
                {actionUnit.kind === "retire"
                  ? retireRepair
                    ? "Llevar a reparar"
                    : consumable
                      ? "Retirar y marcar usada"
                      : "Retirar"
                  : returnFromRepair
                    ? "Volver al depósito"
                    : "Devolver"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {historyUnit && (
      <div
        className="modal show d-block fade"
        tabIndex="-1"
        style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}
        onClick={() => setHistoryUnit(null)}
      >
        <div
          className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content rounded shadow-lg">
            <div className="modal-header">
              <h5 className="modal-title mb-0">
                Historial: {historyUnit.code}
                {historyUnit.name ? ` ${historyUnit.name}` : ""}
              </h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Cerrar"
                onClick={() => setHistoryUnit(null)}
              ></button>
            </div>
            <div className="modal-body">
              {historyRows.length === 0 ? (
                <div className="text-secondary">No hay movimientos registrados</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-bordered mb-0">
                    <thead className="table-primary text-center">
                      <tr>
                        <th>Fecha</th>
                        <th>Acción</th>
                        <th>Lugar</th>
                        <th>Persona</th>
                        {innerQuantity && <th>Cantidad</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row, index) => (
                        <tr key={`${historyUnit.id}-hist-${index}`}>
                          <td>
                            {row.date
                              ? new Date(row.date).toLocaleString("es-ES", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="text-center">
                            {ACTION_LABEL[row.action] || row.action || "—"}
                          </td>
                          <td>{row.place || "—"}</td>
                          <td>{row.person || "—"}</td>
                          {innerQuantity && <td className="text-center">{row.amount ?? "—"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-primary" onClick={() => setHistoryUnit(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    <FeedbackModal
      open={Boolean(feedback)}
      type={feedback?.type}
      message={feedback?.message}
      onClose={() => setFeedback(null)}
    />
    </>
  );
};

export default ItemDetailModal;
