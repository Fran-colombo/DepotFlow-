import { useState, useEffect } from 'react';
import { moveItem } from "../api/movements";

const SwitchShedModal = ({ item = null, isOpen, onClose, refreshItems, sheds }) => {
  const [formData, setFormData] = useState({
    item_id: item?.id || 0,
    quantity: 1,
    from_shed_id: item?.shed_id || '',
    to_shed_id: "",
    username: ""
  });
  const [availableSheds, setAvailableSheds] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      loadSheds();
      resetForm();
    }
  }, [isOpen, item]);

  const loadSheds = () => {
    try {
      const filteredSheds = sheds.filter(shed => shed.id !== item?.shed_id);
      setAvailableSheds(filteredSheds);

      if (filteredSheds.length === 0) {
        setError('No hay otros galpones disponibles para mover el ítem');
      }
    } catch (err) {
      console.error("Error loading sheds:", err);
      setError("Error al cargar los galpones disponibles");
    }
  };

  const getShedName = (shedId) => {
    const shed = sheds.find(s => s.id === shedId);
    return shed ? shed.name : 'Desconocido';
  };

  const resetForm = () => {
    if (!item) return;

    setFormData({
      item_id: item.id,
      quantity: 1,
      from_shed_id: item.shed_id,
      to_shed_id: "",
      username: ""
    });
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('_id') ? parseInt(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item) return;

    setError('');
    setIsLoading(true);

    if (formData.quantity <= 0) {
      setError('La cantidad debe ser mayor a 0');
      setIsLoading(false);
      return;
    }

    if (formData.quantity > item.actualAmount) {
      setError(`Stock insuficiente (disponible: ${item.actualAmount})`);
      setIsLoading(false);
      return;
    }

    if (!formData.to_shed_id) {
      setError('Seleccione un galpón destino');
      setIsLoading(false);
      return;
    }

    try {
      await moveItem(formData);
      refreshItems();
      onClose();
    } catch (err) {
      console.error("Error detallado:", err);
      setError(err.message || 'Error al mover el ítem');
    } finally {
      setIsLoading(false);
    }
  };

  if (!item) {
    return (
      <div className="p-4 text-danger">
        Error: No se ha proporcionado un ítem válido
      </div>
    );
  }

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    
    >
      <div className="modal-dialog modal-dialog-centered">
        <div
          className="modal-content border-0 shadow-lg"
          style={{
            background: "#ffffff",
            border: "1px solid #74c0fc",
            borderRadius: "1rem",
            boxShadow: "0 0 30px rgba(116, 192, 252, 0.3)",
            color: "#1c1c1c",
          }}
        >
          <form onSubmit={handleSubmit}>
            <div className="modal-header"
              style={{
                background: "#d0ebff",
                borderBottom: "1px solid #74c0fc",
                borderTopLeftRadius: "1rem",
                borderTopRightRadius: "1rem"
              }}>
              <h5 className="modal-title text-primary">
                <i className="bi bi-arrow-left-right me-2 text-info"></i>
                Mover ítem: <strong>{item.name}</strong>
              </h5>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>

            <div className="modal-body">
              {error && (
                <div className="alert alert-danger d-flex align-items-center">
                  <i className="bi bi-x-circle-fill me-2"></i>
                  {error}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label fw-semibold text-primary">Galpón origen:</label>
                <input type="text" className="form-control" value={getShedName(item.shed_id)} readOnly />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-primary">Depósito destino:</label>
                <select
                  name="to_shed_id"
                  className="form-select"
                  value={formData.to_shed_id}
                  onChange={handleChange}
                  required
                >
                  <option value="">Seleccionar galpón</option>
                  {availableSheds.map(shed => (
                    <option key={shed.id} value={shed.id}>{shed.name}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-primary">Cantidad a mover:</label>
                <input
                  type="number"
                  name="quantity"
                  className="form-control"
                  min="1"
                  max={item.actualAmount}
                  value={formData.quantity}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-primary">Persona que realiza el intercambio:</label>
                <input
                  type="text"
                  name="username"
                  className="form-control"
                  value={formData.username}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="modal-footer"
              style={{
                borderTop: "1px solid #74c0fc",
                backgroundColor: "#f8f9fa",
                borderBottomLeftRadius: "1rem",
                borderBottomRightRadius: "1rem"
              }}>
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={isLoading}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isLoading || availableSheds.length === 0}>
                {isLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Procesando...
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-left-right me-2"></i>
                    Confirmar Movimiento
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SwitchShedModal;
