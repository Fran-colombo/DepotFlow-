import { useEffect, useState } from "react";
import { getItemById, retirarItem } from "../api/items";

const RetirarItemModal = ({ itemId, isOpen, onClose, onSuccess }) => {
  const [item, setItem] = useState(null);
  const [form, setForm] = useState({ amount: '', place: '', personWhoTook: '' });
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
      await retirarItem({
        itemId,
        amount: parseInt(form.amount),
        place: form.place,
        ...(form.personWhoTook && { personWhoTook: form.personWhoTook })
      });
      onSuccess?.();
      onClose();
    } catch (error) {
    const message = error?.response?.data?.detail || error.message || 'Ocurrió un error';
  setError(message);
}finally {
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
          <div className="modal-header bg-danger text-white">
            <h5 className="modal-title">Retirar: {item?.name || "Cargando..."}</h5>
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
                <label className="form-label">Cantidad a retirar</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  min={1}
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Lugar donde se usará</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.place}
                  onChange={(e) => setForm({ ...form, place: e.target.value })}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Persona que retira (si sos vos no pongas nada)</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.personWhoTook}
                  onChange={(e) => setForm({ ...form, personWhoTook: e.target.value })}
                />
              </div>
              {error && (
                <div className="alert alert-danger py-2 px-3 mt-3 mb-0">
                  {error}
                </div>
                )}
              <div className="d-flex justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Procesando...
                    </>
                  ) : (
                    "Confirmar Retiro"
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

export default RetirarItemModal;
