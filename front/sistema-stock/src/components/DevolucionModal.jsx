import { useEffect, useState } from "react";
import { getItemById, devolverItem } from "../api/items";

const DevolverItemModal = ({ itemId, isOpen, onClose, onSuccess }) => {
  const [item, setItem] = useState(null);
  const [form, setForm] = useState({ amount: '', place: '', personWhoReturned: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen && itemId) {
      getItemById(itemId).then(res => setItem(res.item)).catch(console.error);
    }
  }, [isOpen, itemId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await devolverItem({
        itemId,
        amount: parseInt(form.amount),
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
                <label className="form-label">Cantidad a devolver</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.amount}
                  min={0}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Lugar de devolución</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Lugar al que fue retirado"
                  value={form.place}
                  onChange={(e) => setForm({ ...form, place: e.target.value })}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Persona que devuelve (si sos vos no pongas nada)</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.personWhoReturned}
                  onChange={(e) => setForm({ ...form, personWhoReturned: e.target.value })}
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
                <button type="submit" className="btn btn-success" disabled={loading}>
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
