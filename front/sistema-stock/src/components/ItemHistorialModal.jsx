import { useEffect, useState } from "react";
import { getItemById, getFilteredHistorial } from "../api/items";

const actionLabel = (action) => {
  if (action === "retiro") return "Retiro";
  if (action === "devolucion") return "Devolución";
  if (action === "traslado") return "Traslado";
  if (action === "carga") return "Carga";
  return action || "—";
};

const actionBadgeClass = (action) => {
  if (action === "retiro") return "bg-danger";
  if (action === "devolucion") return "bg-success";
  if (action === "traslado") return "bg-info text-dark";
  if (action === "carga") return "bg-primary";
  return "bg-secondary";
};

const ItemHistorialModal = ({ itemId, isOpen, onClose }) => {
  const [item, setItem] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  useEffect(() => {
    if (!isOpen || !itemId) return;

    setRecords([]);
    setError("");
    setLoading(true);

    getItemById(itemId)
      .then((res) => setItem(res.item || res))
      .catch(console.error);

    getFilteredHistorial({ itemId, showAll: true }, 1, 100)
      .then((res) => setRecords(Array.isArray(res.data) ? res.data : []))
      .catch((err) => {
        console.error(err);
        setError(err.message || "Error al cargar el historial");
        setRecords([]);
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
        className="modal-dialog modal-lg modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-primary text-white">
            <h5 className="modal-title">
              <i className="bi bi-journal-text me-2"></i>
              Historial: {item?.name || "Cargando..."}
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body bg-light">
            {loading ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger mb-0">{error}</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-bordered mb-0">
                  <thead className="table-primary text-center">
                    <tr>
                      <th>Fecha</th>
                      <th>Acción</th>
                      <th>Pieza</th>
                      <th>Lugar</th>
                      <th>Persona</th>
                      <th className="text-end">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length > 0 ? (
                      records.map((row) => (
                        <tr key={`${row.id}-${row.itemName}`}>
                          <td>{formatDate(row.date)}</td>
                          <td className="text-center">
                            <span className={`badge ${actionBadgeClass(row.action)}`}>
                              {actionLabel(row.action)}
                            </span>
                          </td>
                          <td>
                            {row.pieces?.length ? (
                              row.pieces.map((piece) => {
                                const label = piece.name ? `${piece.code} · ${piece.name}` : piece.code;
                                const split = row.pieces.length > 1
                                  && piece.amount != null
                                  && Number(piece.amount) !== Number(row.amountRetired);
                                return (
                                  <div key={piece.code}>
                                    {split ? `${label} · ${piece.amount}` : label}
                                  </div>
                                );
                              })
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{row.place || "—"}</td>
                          <td>{row.personWhoTook || row.userName || "—"}</td>
                          <td className="text-end">{row.amountRetired ?? "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center text-muted py-4">
                          No hay movimientos registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="modal-footer bg-light">
            <button type="button" className="btn btn-outline-primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemHistorialModal;
