import { useEffect, useState } from "react";
import { exportTransferChecklist } from "../api/items";

const TransferExportModal = ({ isOpen, items, onClose, onExported }) => {
  const [quantities, setQuantities] = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const next = {};
    items.forEach((item) => {
      const stock = item.actualAmount || 0;
      next[item.id] = stock > 0 ? stock : 1;
    });
    setQuantities(next);
    setError("");
    setIsExporting(false);
  }, [isOpen, items]);

  if (!isOpen) return null;

  const setQuantity = (item, raw) => {
    const stock = item.actualAmount || 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setQuantities((prev) => ({ ...prev, [item.id]: "" }));
      return;
    }
    const value = Math.min(stock, Math.max(1, Math.trunc(parsed)));
    setQuantities((prev) => ({ ...prev, [item.id]: value }));
  };

  const fillAllStock = () => {
    const next = {};
    items.forEach((item) => {
      next[item.id] = item.actualAmount || 0;
    });
    setQuantities(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = [];
    for (const item of items) {
      const stock = item.actualAmount || 0;
      const qty = Number(quantities[item.id]);
      if (!Number.isInteger(qty) || qty < 1) {
        setError(`Indicá una cantidad válida para ${item.name}`);
        return;
      }
      if (qty > stock) {
        setError(`${item.name} solo tiene ${stock} en stock`);
        return;
      }
      payload.push({ id: item.id, cantidad: qty });
    }

    setError("");
    setIsExporting(true);
    try {
      await exportTransferChecklist(payload);
      onExported?.();
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo exportar el Excel de traslado");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div
          className="modal-content border-0 shadow-lg"
          style={{
            background: "#ffffff",
            border: "1px solid #339af0",
            borderRadius: "1rem",
          }}
        >
          <div
            className="modal-header"
            style={{
              backgroundColor: "#228be6",
              color: "white",
              borderTopLeftRadius: "1rem",
              borderTopRightRadius: "1rem",
            }}
          >
            <h5 className="modal-title">Cantidad a trasladar</h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={isExporting}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body px-4 py-3">
              {error && <div className="alert alert-danger">{error}</div>}
              <p className="small text-secondary mb-3">
                Por cada producto elegí cuánto sale. El Excel y la actualización masiva
                usan esa cantidad, no todo el stock.
              </p>
              <div className="d-flex justify-content-end mb-2">
                <button
                  type="button"
                  className="btn btn-link btn-sm text-decoration-none"
                  onClick={fillAllStock}
                  disabled={isExporting}
                >
                  Usar todo el stock
                </button>
              </div>
              <div className="table-responsive" style={{ maxHeight: 360 }}>
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Producto</th>
                      <th>Ubicación</th>
                      <th className="text-end">Stock</th>
                      <th style={{ width: 130 }}>A trasladar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="fw-semibold">{item.name}</div>
                          {item.description && (
                            <div className="text-secondary small">{item.description}</div>
                          )}
                        </td>
                        <td className="text-secondary small">
                          {item.locationLabel || item.zone_name || "Sin ubicación"}
                        </td>
                        <td className="text-end">{item.actualAmount}</td>
                        <td>
                          <input
                            type="number"
                            className="form-control form-control-sm"
                            min="1"
                            max={item.actualAmount}
                            value={quantities[item.id] ?? ""}
                            onChange={(e) => setQuantity(item, e.target.value)}
                            disabled={isExporting}
                            required
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onClose}
                disabled={isExporting}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isExporting}>
                {isExporting ? "Exportando..." : "Exportar Excel"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TransferExportModal;
