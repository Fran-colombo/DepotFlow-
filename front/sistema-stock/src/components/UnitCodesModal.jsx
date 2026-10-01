import { useEffect, useState } from "react";
import { getItemUnits, identifyItem } from "../api/items";
import { printLabels } from "./printLabels";

const STATUS_LABEL = {
  en_stock: "En depósito",
  retirada: "Afuera",
  consumida: "Usada",
};

const UnitCodesModal = ({ item, isOpen, onClose, onChanged }) => {
  const [units, setUnits] = useState([]);
  const [trackUnits, setTrackUnits] = useState(Boolean(item?.track_units));
  const [showUsed, setShowUsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !item?.id) return;
    setShowUsed(false);
    setTrackUnits(Boolean(item.track_units));
    setError("");
  }, [isOpen, item]);

  useEffect(() => {
    if (!isOpen || !item?.id) return;
    let cancelled = false;
    setLoading(true);
    getItemUnits(item.id, showUsed ? "all" : "en_stock")
      .then((data) => {
        if (cancelled) return;
        setUnits(data.units || []);
        setTrackUnits(Boolean(data.track_units));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se pudieron cargar los códigos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, item, showUsed]);

  if (!isOpen || !item) return null;

  const inStock = units.filter((unit) => unit.status === "en_stock");

  const handleIdentify = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await identifyItem(item.id);
      setTrackUnits(true);
      setShowUsed(false);
      onChanged?.();
      if (result.codes?.length) {
        printLabels(item.name, result.codes);
      }
    } catch (err) {
      setError(err.message || "No se pudo identificar el stock");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-md modal-dialog-centered modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded shadow-lg">
          <div className="modal-header">
            <h5 className="modal-title">Códigos de {item.name}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {!trackUnits ? (
              <p className="mb-3">
                Este artículo se maneja solo por cantidad. Identificar el stock actual genera un código por cada unidad que hay ahora en depósito. Lo que ya está afuera no recibe código.
              </p>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="text-secondary small">
                    {showUsed ? "Todas las piezas" : "Solo las que están en depósito"}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowUsed((value) => !value)}
                  >
                    {showUsed ? "Ocultar usadas" : "Ver usadas"}
                  </button>
                </div>
                {loading ? (
                  <div className="text-secondary">Cargando...</div>
                ) : units.length === 0 ? (
                  <p className="mb-0 text-secondary">No hay piezas para mostrar.</p>
                ) : (
                  <ul className="list-group">
                    {units.map((unit) => (
                      <li
                        key={unit.id}
                        className="list-group-item d-flex justify-content-between align-items-center"
                      >
                        <span className="fw-semibold">{unit.code}</span>
                        <span className="badge text-bg-light border">
                          {STATUS_LABEL[unit.status] || unit.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {error && <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div>}
          </div>
          <div className="modal-footer">
            {trackUnits && inStock.length > 0 && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => printLabels(item.name, inStock.map((unit) => unit.code))}
              >
                Imprimir etiquetas
              </button>
            )}
            {!trackUnits && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleIdentify}
                disabled={loading}
              >
                Identificar stock actual
              </button>
            )}
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitCodesModal;
