import { useEffect, useState } from "react";
import {
  getItemById,
  getPendingPlaces,
  getHistorialPlaces,
  trasladarItem,
} from "../api/items";

const OTHER_VALUE = "__other__";

const TrasladoModal = ({
  itemId,
  isOpen,
  onClose,
  onSuccess,
  defaultFromPlace = "",
}) => {
  const [item, setItem] = useState(null);
  const [pendingPlaces, setPendingPlaces] = useState([]);
  const [knownPlaces, setKnownPlaces] = useState([]);
  const [form, setForm] = useState({
    amount: "",
    fromPlace: "",
    toPlaceSelect: "",
    toPlaceOther: "",
    personWhoMoved: "",
  });
  const [loading, setLoading] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !itemId) return;

    setForm({
      amount: "",
      fromPlace: defaultFromPlace || "",
      toPlaceSelect: "",
      toPlaceOther: "",
      personWhoMoved: "",
    });
    setError("");
    setPendingPlaces([]);
    setKnownPlaces([]);

    getItemById(itemId)
      .then((res) => setItem(res.item || res))
      .catch(console.error);

    setLoadingPlaces(true);
    Promise.all([getPendingPlaces(itemId), getHistorialPlaces()])
      .then(([pending, known]) => {
        const pendingList = Array.isArray(pending) ? pending : [];
        const knownList = Array.isArray(known) ? known : [];
        setPendingPlaces(pendingList);
        setKnownPlaces(knownList);

        if (defaultFromPlace && pendingList.some((p) => p.place === defaultFromPlace)) {
          setForm((prev) => ({ ...prev, fromPlace: defaultFromPlace }));
        } else if (pendingList.length === 1) {
          setForm((prev) => ({ ...prev, fromPlace: pendingList[0].place }));
        }
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error al cargar lugares");
        setPendingPlaces([]);
        setKnownPlaces([]);
      })
      .finally(() => setLoadingPlaces(false));
  }, [isOpen, itemId, defaultFromPlace]);

  const selectedPlace = pendingPlaces.find((p) => p.place === form.fromPlace);
  const maxAmount = selectedPlace?.pending_amount ?? 0;
  const noPending = !loadingPlaces && pendingPlaces.length === 0;

  const destinationOptions = knownPlaces
    .map((p) => p.place)
    .filter(
      (place) =>
        place &&
        place.toLowerCase() !== (form.fromPlace || "").toLowerCase()
    );

  const resolvedToPlace =
    form.toPlaceSelect === OTHER_VALUE
      ? form.toPlaceOther.trim()
      : form.toPlaceSelect.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const amount = parseInt(form.amount, 10);
    const toPlace = resolvedToPlace;

    if (!form.fromPlace) {
      setError("Seleccione el lugar de origen");
      setLoading(false);
      return;
    }
    if (!form.toPlaceSelect) {
      setError("Seleccione el lugar de destino");
      setLoading(false);
      return;
    }
    if (!toPlace) {
      setError("Indique el lugar de destino");
      setLoading(false);
      return;
    }
    if (form.fromPlace.toLowerCase() === toPlace.toLowerCase()) {
      setError("El origen y el destino deben ser distintos");
      setLoading(false);
      return;
    }
    if (!amount || amount <= 0) {
      setError("La cantidad debe ser mayor a 0");
      setLoading(false);
      return;
    }
    if (amount > maxAmount) {
      setError(`Solo hay ${maxAmount} unidad(es) pendiente(s) en ${form.fromPlace}`);
      setLoading(false);
      return;
    }

    try {
      await trasladarItem({
        itemId,
        amount,
        fromPlace: form.fromPlace,
        toPlace,
        ...(form.personWhoMoved.trim() && {
          personWhoMoved: form.personWhoMoved.trim(),
        }),
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-md modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded shadow-lg">
          <div className="modal-header bg-info text-white">
            <h5 className="modal-title">
              Trasladar entre obras: {item?.name || "Cargando..."}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          <div className="modal-body">
            <p className="small text-muted mb-3">
              Mueve ítems pendientes de una obra a otra sin devolverlos al depósito
              (el stock del depósito no cambia).
            </p>
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Origen</label>
                <select
                  className="form-select"
                  value={form.fromPlace}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fromPlace: e.target.value,
                      amount: "",
                      toPlaceSelect:
                        form.toPlaceSelect === e.target.value
                          ? ""
                          : form.toPlaceSelect,
                    })
                  }
                  required
                  disabled={loadingPlaces || noPending}
                >
                  <option value="">
                    {loadingPlaces ? "Cargando lugares..." : "Seleccionar lugar"}
                  </option>
                  {pendingPlaces.map((p) => (
                    <option key={p.place} value={p.place}>
                      {p.place} ({p.pending_amount} pendiente
                      {p.pending_amount === 1 ? "" : "s"})
                    </option>
                  ))}
                </select>
                {noPending && (
                  <div className="form-text text-danger">
                    No hay retiros pendientes para este ítem
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label">Destino</label>
                <select
                  className="form-select"
                  value={form.toPlaceSelect}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      toPlaceSelect: e.target.value,
                      toPlaceOther:
                        e.target.value === OTHER_VALUE ? form.toPlaceOther : "",
                    })
                  }
                  required
                  disabled={noPending || loadingPlaces}
                >
                  <option value="">Seleccionar destino</option>
                  {destinationOptions.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                  <option value={OTHER_VALUE}>Otro…</option>
                </select>
                {form.toPlaceSelect === OTHER_VALUE && (
                  <input
                    type="text"
                    className="form-control mt-2"
                    placeholder="Nombre del nuevo lugar"
                    value={form.toPlaceOther}
                    onChange={(e) =>
                      setForm({ ...form, toPlaceOther: e.target.value })
                    }
                    required
                  />
                )}
              </div>

              <div className="mb-3">
                <label className="form-label">Cantidad a trasladar</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.amount}
                  min={1}
                  max={maxAmount || undefined}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  disabled={!form.fromPlace || noPending}
                />
                {form.fromPlace && maxAmount > 0 && (
                  <div className="form-text">Máximo: {maxAmount}</div>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label">
                  Persona que traslada (si sos vos no pongas nada)
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={form.personWhoMoved}
                  onChange={(e) =>
                    setForm({ ...form, personWhoMoved: e.target.value })
                  }
                  disabled={noPending}
                />
              </div>

              {error && (
                <div className="alert alert-danger py-2 px-3 mt-3 mb-0">
                  <p className="mb-0">{error}</p>
                </div>
              )}

              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-info text-white"
                  disabled={
                    loading ||
                    loadingPlaces ||
                    noPending ||
                    !form.fromPlace ||
                    !resolvedToPlace
                  }
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Procesando...
                    </>
                  ) : (
                    "Confirmar traslado"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrasladoModal;
