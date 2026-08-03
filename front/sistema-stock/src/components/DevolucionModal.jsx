import { useEffect, useState } from "react";
import { getItemById, devolverItem, getPendingPlaces } from "../api/items";

const DevolverItemModal = ({ itemId, isOpen, onClose, onSuccess, defaultPlace = "" }) => {
  const [item, setItem] = useState(null);
  const [pendingPlaces, setPendingPlaces] = useState([]);
  const [form, setForm] = useState({ amount: '', place: '', personWhoReturned: '' });
  const [loading, setLoading] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !itemId) return;

    setForm({ amount: '', place: defaultPlace || '', personWhoReturned: '' });
    setError("");
    setPendingPlaces([]);

    getItemById(itemId).then(res => setItem(res.item)).catch(console.error);

    setLoadingPlaces(true);
    getPendingPlaces(itemId)
      .then((places) => {
        const list = Array.isArray(places) ? places : [];
        setPendingPlaces(list);
        setForm((prev) => {
          if (defaultPlace && list.some((p) => p.place === defaultPlace)) {
            return { ...prev, place: defaultPlace };
          }
          if (list.length === 1) {
            return { ...prev, place: list[0].place };
          }
          return prev;
        });
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error al cargar lugares pendientes");
        setPendingPlaces([]);
      })
      .finally(() => setLoadingPlaces(false));
  }, [isOpen, itemId, defaultPlace]);

  const selectedPlace = pendingPlaces.find((p) => p.place === form.place);
  const maxAmount = selectedPlace?.pending_amount ?? 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const amount = parseInt(form.amount, 10);
    if (!form.place) {
      setError("Seleccione un lugar de devolución");
      setLoading(false);
      return;
    }
    if (!amount || amount <= 0) {
      setError("La cantidad debe ser mayor a 0");
      setLoading(false);
      return;
    }
    if (amount > maxAmount) {
      setError(`Solo hay ${maxAmount} unidad(es) pendiente(s) en este lugar`);
      setLoading(false);
      return;
    }

    try {
      await devolverItem({
        itemId,
        amount,
        place: form.place,
        ...(form.personWhoReturned && { personWhoReturned: form.personWhoReturned })
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      setError(error.message || "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const noPending = !loadingPlaces && pendingPlaces.length === 0;

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose} 
    >
      <div
        className="modal-dialog modal-md modal-dialog-centered"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-content rounded shadow-lg">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">Devolver: {item?.name || "Cargando..."}</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          <div className="modal-body">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Lugar de devolución</label>
                <select
                  className="form-select"
                  value={form.place}
                  onChange={(e) => setForm({ ...form, place: e.target.value, amount: '' })}
                  required
                  disabled={loadingPlaces || noPending}
                >
                  <option value="">
                    {loadingPlaces ? "Cargando lugares..." : "Seleccionar lugar"}
                  </option>
                  {pendingPlaces.map((p) => (
                    <option key={p.place} value={p.place}>
                      {p.place} ({p.pending_amount} pendiente{p.pending_amount === 1 ? "" : "s"})
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
                <label className="form-label">Cantidad a devolver</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.amount}
                  min={1}
                  max={maxAmount || undefined}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  disabled={!form.place || noPending}
                />
                {form.place && maxAmount > 0 && (
                  <div className="form-text">Máximo: {maxAmount}</div>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label">Persona que devuelve (si sos vos no pongas nada)</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.personWhoReturned}
                  onChange={(e) => setForm({ ...form, personWhoReturned: e.target.value })}
                  disabled={noPending}
                />
              </div>
              {error && (
            <div className="alert alert-danger py-2 px-3 mt-3 mb-0">
              <p>{error}</p>
            </div>
        )
      }
           <div className="d-flex justify-content-end gap-2">
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
                  className="btn btn-success"
                  disabled={loading || loadingPlaces || noPending || !form.place}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Procesando...
                    </>
                  ) : (
                    "Confirmar Devolución"
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

export default DevolverItemModal;
