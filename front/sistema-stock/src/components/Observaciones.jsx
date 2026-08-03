import { useEffect, useState } from "react";
import { getItemObservations, addObservation, getItemById } from "../api/items";

const ObservationsModal = ({ itemId, isOpen, onClose }) => {
  const [observations, setObservations] = useState([]);
  const [newObservation, setNewObservation] = useState("");
  const [observedBy, setObservedBy] = useState("");
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchObservations = async () => {
    if (!itemId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getItemObservations(itemId);
      setObservations(data);
    } catch (err) {
      setObservations([]);
      if (!String(err.message || "").includes("No observations found")) {
        setError(err.message || "No se pudieron cargar las observaciones.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddObservation = async () => {
    if (!newObservation.trim()) return;
    setLoading(true);
    setError("");
    try {
      await addObservation(itemId, newObservation, observedBy);
      setNewObservation("");
      setObservedBy("");
      await fetchObservations();
    } catch (err) {
      setError(err.message || "Error al agregar observación.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const res = await getItemById(itemId);
        setItem(res.item);
      } catch (err) {
        setError(err.message || "Error al cargar el ítem");
      }
    };

    if (isOpen && itemId) {
      setNewObservation("");
      setObservedBy("");
      fetchItem();
      fetchObservations();
    }
  }, [itemId, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal show d-block fade" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header bg-secondary text-white">
            <h5 className="modal-title">
              <i className="bi bi-chat-dots me-2"></i>
              Observaciones de: {item?.name || "Cargando..."}
            </h5>
            <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
          </div>

          <div className="modal-body bg-light">
            {error && <div className="alert alert-danger">{error}</div>}
            {loading && <div className="text-muted mb-2">Cargando...</div>}

            <div className="mb-3" style={{ maxHeight: "300px", overflowY: "auto" }}>
              {observations.length > 0 ? (
                <ul className="list-unstyled mb-0">
                  {observations.map((obs) => (
                    <li key={obs.id} className="border-bottom pb-2 mb-2">
                      <p className="mb-1">{obs.description}</p>
                      <small className="text-muted">
                        {new Date(obs.date).toLocaleString()} — Por:{" "}
                        {obs.observed_by || obs.user_name || "—"}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">
                  <i className="bi bi-info-circle me-2"></i>No hay observaciones registradas
                </p>
              )}
            </div>

            <textarea
              className="form-control mb-3"
              placeholder="Escribí una nueva observación..."
              rows={3}
              value={newObservation}
              onChange={(e) => setNewObservation(e.target.value)}
              disabled={loading}
            />

            <div className="mb-0">
              <label className="form-label">Observado por (opcional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="Si sos vos, dejalo vacío"
                value={observedBy}
                onChange={(e) => setObservedBy(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-footer bg-light">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddObservation}
              disabled={loading || !newObservation.trim()}
            >
              {loading ? "Agregando..." : "Agregar Observación"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObservationsModal;
