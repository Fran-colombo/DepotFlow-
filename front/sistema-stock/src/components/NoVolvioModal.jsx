import { useEffect, useMemo, useState } from "react";
import { closeUnplaced, noVolvioItem } from "../api/items";
import PersonPicker from "./PersonPicker";
import NumberInput from "./NumberInput";

const REASONS = [
  { id: "usado", label: "Se usó en la obra" },
  { id: "gastado", label: "Se gastó" },
  { id: "perdido", label: "Se perdió" },
  { id: "roto", label: "Se rompió" },
];

const NoVolvioModal = ({
  isOpen,
  onClose,
  onSuccess,
  onFinished,
  itemId,
  itemName = "",
  code = "",
  place = "",
  places = null,
  maxAmount = 0,
  unplaced = 0,
}) => {
  const unplacedMode = unplaced > 0;
  const options = useMemo(() => {
    if (Array.isArray(places) && places.length) {
      return places
        .filter((row) => row?.place)
        .map((row) => ({
          place: row.place,
          pending: Number(row.pending_amount ?? row.quantity ?? 0),
        }));
    }
    if (place) return [{ place, pending: Number(maxAmount) || 0 }];
    return [];
  }, [places, place, maxAmount]);

  const [chosenPlace, setChosenPlace] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [person, setPerson] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const first = options.length === 1 ? options[0].place : "";
    setChosenPlace(first);
    setAmount("");
    setReason("");
    setPerson("");
    setError("");
    setLoading(false);
  }, [isOpen, options]);

  const selected = options.find((row) => row.place === chosenPlace);
  const max = selected?.pending ?? 0;
  const reasonLabel = REASONS.find((row) => row.id === reason)?.label || "";

  const submit = async (event) => {
    event.preventDefault();
    if (!unplacedMode && !chosenPlace) {
      setError("Elegí la obra");
      return;
    }
    if (!reason) {
      setError("Indicá si se usó, se gastó, se perdió o se rompió");
      return;
    }
    if (!person.trim()) {
      setError("Indicá quién lo confirma");
      return;
    }
    if (unplacedMode) {
      setLoading(true);
      setError("");
      try {
        await closeUnplaced({ itemId, reason, personWhoConfirmed: person.trim() });
        onFinished?.({ type: "success", message: `Quedó cerrado: ${reasonLabel.toLowerCase()}.` });
        onSuccess?.();
        onClose();
      } catch (err) {
        setError(err.message || "No se pudo cerrar");
      } finally {
        setLoading(false);
      }
      return;
    }
    const qty = max === 1 ? 1 : parseInt(amount, 10);
    if (!qty || qty < 1) {
      setError("La cantidad tiene que ser mayor a 0");
      return;
    }
    if (qty > max) {
      setError(max === 1 ? "En esa obra hay 1 pendiente" : `En esa obra hay ${max} pendientes`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await noVolvioItem({
        itemId,
        amount: qty,
        place: chosenPlace,
        reason,
        personWhoConfirmed: person.trim(),
        ...(code ? { codes: [code] } : {}),
      });
      onFinished?.({ type: "success", message: `Quedó cerrado: ${reasonLabel.toLowerCase()}.` });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo cerrar");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1070 }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-md modal-dialog-centered"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-content rounded shadow-lg">
          <div className="modal-header bg-secondary text-white">
            <h5 className="modal-title">No volvió{itemName ? `: ${itemName}` : ""}</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={loading}
            />
          </div>
          <div className="modal-body">
            {unplacedMode ? (
              <p className="mb-3">
                Hay {unplaced} que no {unplaced === 1 ? "está" : "están"} en depósito ni pendientes en una obra.
                Se cierran y baja el total.
              </p>
            ) : (
              <p className="small text-muted mb-3">
                Cierra lo que se usó, se gastó, se perdió o se rompió en la obra. No vuelve al depósito y baja el total.
              </p>
            )}
            {code && (
              <p className="mb-3">
                Código: <span className="fw-semibold">{code}</span>
              </p>
            )}
            <form onSubmit={submit}>
              {!unplacedMode && (
              <div className="mb-3">
                <label className="form-label">Obra</label>
                {options.length <= 1 ? (
                  <input className="form-control" value={chosenPlace || "Sin obra"} disabled />
                ) : (
                  <select
                    className="form-select"
                    value={chosenPlace}
                    onChange={(event) => {
                      setChosenPlace(event.target.value);
                      setAmount("");
                    }}
                    required
                    disabled={loading}
                  >
                    <option value="">Elegir obra</option>
                    {options.map((row) => (
                      <option key={row.place} value={row.place}>
                        {row.place} ({row.pending} pendiente{row.pending === 1 ? "" : "s"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              )}
              {!unplacedMode && max > 1 && (
                <div className="mb-3">
                  <label className="form-label">Cantidad (hasta {max})</label>
                  <NumberInput
                    className="form-control"
                    min={1}
                    max={max}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    disabled={loading || !chosenPlace}
                  />
                </div>
              )}
              <div className="mb-3">
                <span className="form-label d-block">Motivo</span>
                {REASONS.map((row) => (
                  <div className="form-check" key={row.id}>
                    <input
                      className="form-check-input"
                      type="radio"
                      name="no-volvio-reason"
                      id={`no-volvio-${row.id}`}
                      checked={reason === row.id}
                      onChange={() => setReason(row.id)}
                      disabled={loading}
                    />
                    <label className="form-check-label" htmlFor={`no-volvio-${row.id}`}>
                      {row.label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <label className="form-label">Quién lo confirma</label>
                <PersonPicker value={person} onChange={setPerson} disabled={loading} />
              </div>
              {error && <div className="alert alert-danger py-2">{error}</div>}
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={loading}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-secondary" disabled={loading || (!unplacedMode && max < 1)}>
                  {loading ? "Cerrando..." : "Confirmar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoVolvioModal;
