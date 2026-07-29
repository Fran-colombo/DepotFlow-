import { useEffect, useState } from "react";
import { getItemById, getPendingPlaces } from "../api/items";

const PendingLocationsModal = ({ itemId, isOpen, onClose }) => {
  const [item, setItem] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !itemId) return;

    setPlaces([]);
    setError("");
    setLoading(true);

    getItemById(itemId)
      .then((res) => setItem(res.item || res))
      .catch(console.error);

    getPendingPlaces(itemId)
      .then((data) => setPlaces(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error al cargar ubicaciones pendientes");
        setPlaces([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, itemId]);

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
          <div className="modal-header bg-secondary text-white">
            <h5 className="modal-title">
              Dónde están: {item?.name || "Cargando..."}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger mb-0">{error}</div>
            ) : places.length === 0 ? (
              <p className="text-muted mb-0 text-center py-3">
                No hay unidades pendientes fuera del depósito.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Obra / lugar</th>
                      <th>Quién lo retiró</th>
                      <th className="text-end">Cantidad pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {places.map((p) => (
                      <tr key={p.place}>
                        <td>{p.place}</td>
                        <td>{p.personWhoTook || "—"}</td>
                        <td className="text-end fw-semibold">{p.pending_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingLocationsModal;
