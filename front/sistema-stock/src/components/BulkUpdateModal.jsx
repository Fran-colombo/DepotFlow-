import { useEffect, useState } from "react";
import { importItemsUpdateExcel } from "../api/items";

const BulkUpdateModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setError("");
    setResult(null);
    setIsUploading(false);
    setShowManual(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Seleccioná el Excel de traslado (.xlsx)");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("El archivo debe ser un Excel (.xlsx)");
      return;
    }

    setError("");
    setIsUploading(true);
    try {
      const data = await importItemsUpdateExcel(file);
      setResult(data);
      if ((data.updated || 0) + (data.merged || 0) > 0) {
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message || "Error al actualizar el archivo");
      setResult(null);
    } finally {
      setIsUploading(false);
    }
  };

  const hasErrors = (result?.errors || []).length > 0;

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
            boxShadow: "0 0 30px rgba(51, 154, 240, 0.3)",
            color: "#1c1c1c",
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
            <h5 className="modal-title">
              <i className="bi bi-arrow-repeat me-2"></i>
              Actualización masiva de ubicación
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={isUploading}
            ></button>
          </div>

          <div className="modal-body px-4 py-3">
            {error && <div className="alert alert-danger text-center">{error}</div>}

            <p className="small text-secondary">
              Subí el Excel exportado desde Inventario, con <code>deposito_destino</code> y{" "}
              <code>zona_destino</code> ya actualizados. Esto mueve los productos existentes
              por <strong>id</strong>. No crea ítems nuevos.
            </p>

            <div className="d-flex justify-content-end mb-3">
              <button
                type="button"
                className="btn btn-link btn-sm text-decoration-none"
                onClick={() => setShowManual((prev) => !prev)}
              >
                {showManual ? "Ocultar manual" : "Ver manual de actualización"}
              </button>
            </div>

            {showManual && (
              <div className="border rounded p-3 mb-3 bg-light">
                <h6 className="fw-bold mb-2">Manual de actualización masiva</h6>
                <ol className="small mb-2 ps-3">
                  <li>Seleccioná productos en Inventario y exportá el Excel de traslado.</li>
                  <li>Imprimilo y usá las columnas salió / llegó / controló como checklist.</li>
                  <li>
                    Después del traslado físico, cambiá <code>deposito_destino</code> y{" "}
                    <code>zona_destino</code>.
                  </li>
                  <li>
                    No toques la columna <code>id</code>: es la que identifica cada producto.
                  </li>
                  <li>Los depósitos y zonas destino tienen que existir en el sistema.</li>
                  <li>
                    Si destino es igual al origen, esa fila se omite. Si el producto ya existe
                    en destino, el stock se fusiona.
                  </li>
                  <li>Esto no es una carga: no se crean productos por nombre.</li>
                </ol>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label fw-bold">Archivo Excel de traslado</label>
                <input
                  type="file"
                  className="form-control"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </div>

              {result && (
                <div className={`alert ${hasErrors ? "alert-warning" : "alert-success"}`}>
                  <div>Actualizados: <strong>{result.updated || 0}</strong></div>
                  <div>Fusionados en destino: <strong>{result.merged || 0}</strong></div>
                  <div>Sin cambios: <strong>{result.skipped || 0}</strong></div>
                  {hasErrors && (
                    <div>Filas con error: <strong>{result.errors.length}</strong></div>
                  )}
                </div>
              )}

              {hasErrors && (
                <div className="table-responsive" style={{ maxHeight: "220px" }}>
                  <table className="table table-sm table-bordered mb-3">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "80px" }}>Fila</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((item, index) => (
                        <tr key={`${item.row}-${index}`}>
                          <td>{item.row}</td>
                          <td>{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="d-flex justify-content-end mt-3 gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                  disabled={isUploading}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isUploading || !file}
                >
                  {isUploading ? "Actualizando..." : "Actualizar ubicaciones"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUpdateModal;
