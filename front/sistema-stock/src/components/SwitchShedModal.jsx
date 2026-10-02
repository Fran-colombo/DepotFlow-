import { useState, useEffect } from 'react';
import { moveItem } from "../api/movements";
import { getItemUnits } from "../api/items";
import { getZones } from "../api/zones";

const SwitchShedModal = ({ item = null, isOpen, onClose, refreshItems, sheds }) => {
  const [formData, setFormData] = useState({
    item_id: item?.id || 0,
    quantity: 1,
    from_shed_id: item?.shed_id || '',
    to_shed_id: "",
    from_zone_id: item?.zone_id || null,
    to_zone_id: "",
    username: ""
  });
  const [destinationZones, setDestinationZones] = useState([]);
  const [movablePieces, setMovablePieces] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const tracksPieces = Boolean(item?.track_units);

  useEffect(() => {
    if (isOpen && item) {
      resetForm();
    }
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen || !item?.track_units) {
      setMovablePieces([]);
      setSelectedCodes([]);
      return;
    }
    let cancelled = false;
    getItemUnits(item.id, "all")
      .then((data) => {
        if (cancelled) return;
        const units = (data?.units || []).filter(
          (unit) => unit.status === "en_stock" || unit.status === "retirada"
        );
        setMovablePieces(units);
        setSelectedCodes(units.map((unit) => unit.code));
      })
      .catch(() => {
        if (!cancelled) {
          setMovablePieces([]);
          setSelectedCodes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, item]);

  useEffect(() => {
    const loadZones = async () => {
      if (!formData.to_shed_id) {
        setDestinationZones([]);
        return;
      }
      try {
        const zones = await getZones(formData.to_shed_id);
        const filtered = zones.filter(
          (z) =>
            !(
              Number(formData.to_shed_id) === Number(item?.shed_id) &&
              Number(z.id) === Number(item?.zone_id)
            )
        );
        setDestinationZones(filtered);
        setFormData((prev) => ({
          ...prev,
          to_zone_id: filtered.some((z) => Number(z.id) === Number(prev.to_zone_id))
            ? prev.to_zone_id
            : "",
        }));
      } catch (err) {
        console.error("Error loading zones:", err);
        setError("Error al cargar las zonas disponibles");
        setDestinationZones([]);
      }
    };
    if (isOpen) {
      loadZones();
    }
  }, [formData.to_shed_id, isOpen, item]);

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
      to_shed_id: item.shed_id || "",
      from_zone_id: item.zone_id || null,
      to_zone_id: "",
      username: ""
    });
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('_id') && value !== "" ? parseInt(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!item) return;

    setError('');
    setIsLoading(true);

    const movingCodes = tracksPieces ? selectedCodes : [];
    const quantity = tracksPieces ? movingCodes.length : formData.quantity;

    if (quantity <= 0) {
      setError(tracksPieces ? 'Elegí al menos una pieza' : 'La cantidad debe ser mayor a 0');
      setIsLoading(false);
      return;
    }

    if (!tracksPieces && quantity > item.actualAmount) {
      setError(`Stock insuficiente (disponible: ${item.actualAmount})`);
      setIsLoading(false);
      return;
    }

    if (!formData.to_shed_id) {
      setError('Seleccione un galpón destino');
      setIsLoading(false);
      return;
    }

    if (!formData.to_zone_id) {
      setError('Seleccione una zona destino');
      setIsLoading(false);
      return;
    }

    try {
      await moveItem({
        ...formData,
        quantity,
        ...(tracksPieces ? { codes: movingCodes } : {}),
      });
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
                <label className="form-label fw-semibold text-primary">Origen:</label>
                <input
                  type="text"
                  className="form-control"
                  value={`${getShedName(item.shed_id)} / ${item.zone_name || "Sin zona"}`}
                  readOnly
                />
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
                  {sheds.map(shed => (
                    <option key={shed.id} value={shed.id}>{shed.name}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold text-primary">Zona destino:</label>
                <select
                  name="to_zone_id"
                  className="form-select"
                  value={formData.to_zone_id}
                  onChange={handleChange}
                  required
                  disabled={!formData.to_shed_id}
                >
                  <option value="">Seleccionar zona</option>
                  {destinationZones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.name}</option>
                  ))}
                </select>
                {formData.to_shed_id && destinationZones.length === 0 && (
                  <div className="form-text text-danger">
                    No hay zonas disponibles en este depósito (o solo existe la zona actual).
                  </div>
                )}
              </div>

              {tracksPieces ? (
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label fw-semibold text-primary mb-0">Piezas a mover</label>
                    <div className="form-check mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="move-all-pieces"
                        checked={movablePieces.length > 0 && selectedCodes.length === movablePieces.length}
                        onChange={(e) =>
                          setSelectedCodes(e.target.checked ? movablePieces.map((unit) => unit.code) : [])
                        }
                      />
                      <label className="form-check-label" htmlFor="move-all-pieces">Todas</label>
                    </div>
                  </div>
                  {movablePieces.length === 0 ? (
                    <div className="text-muted small">No hay piezas en depósito ni en obra.</div>
                  ) : (
                    movablePieces.map((unit) => (
                      <div className="form-check" key={unit.id}>
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`move-piece-${unit.id}`}
                          checked={selectedCodes.includes(unit.code)}
                          onChange={(e) =>
                            setSelectedCodes((prev) =>
                              e.target.checked
                                ? [...prev, unit.code]
                                : prev.filter((code) => code !== unit.code)
                            )
                          }
                        />
                        <label className="form-check-label" htmlFor={`move-piece-${unit.id}`}>
                          {unit.code}
                          {unit.name ? ` ${unit.name}` : ""}
                          <span className="text-muted"> · {unit.status_label}</span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
              ) : (
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
              )}

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
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !formData.to_zone_id || destinationZones.length === 0}
              >
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
