import { useEffect, useState } from "react";
import { downloadImportTemplate, importItemsExcel } from "../api/items";

const BulkImportModal = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setError("");
    setResult(null);
    setIsDownloading(false);
    setIsUploading(false);
    setShowManual(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadTemplate = async () => {
    setError("");
    setIsDownloading(true);
    try {
      await downloadImportTemplate();
    } catch (err) {
      setError(err.message || "No se pudo descargar la plantilla");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setResult(null);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Seleccioná un archivo Excel (.xlsx)");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("El archivo debe ser un Excel (.xlsx)");
      return;
    }

    setError("");
    setIsUploading(true);
    try {
      const data = await importItemsExcel(file);
      setResult(data);
      if ((data.created || 0) + (data.updated || 0) > 0) {
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message || "Error al importar el archivo");
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
              <i className="bi bi-file-earmark-excel me-2"></i>
              Carga masiva desde Excel
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

            <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={handleDownloadTemplate}
                disabled={isDownloading || isUploading}
              >
                {isDownloading ? "Descargando..." : "Descargar plantilla"}
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm text-decoration-none"
                onClick={() => setShowManual((prev) => !prev)}
              >
                {showManual ? "Ocultar manual" : "Ver manual de carga"}
              </button>
            </div>

            {showManual && (
              <div className="border rounded p-3 mb-3 bg-light">
                <h6 className="fw-bold mb-2">Manual de carga masiva</h6>
                <ol className="small mb-2 ps-3">
                  <li>Descargá la plantilla y completá una fila por producto. No borres los encabezados.</li>
                  <li>Los depósitos y zonas tienen que existir antes en el sistema.</li>
                  <li>
                    Obligatorio: <code>nombre</code>, <code>cantidad</code>, <code>categoria</code>,{" "}
                    <code>deposito</code>, <code>zona</code>.
                  </li>
                  <li>
                    Opcional: <code>descripcion</code> y <code>comprado_por</code> (quién compró, trajo o
                    ingresó el material).
                  </li>
                  <li>La categoría tiene que coincidir con las del sistema (están en la hoja Categorias).</li>
                  <li>
                    Si el producto ya existe en esa zona, la cantidad se suma. Si es negativa (ej.{" "}
                    <code>-2</code>), se resta.
                  </li>
                  <li>Para un producto nuevo la cantidad tiene que ser mayor a 0.</li>
                  <li>El nombre no distingue mayúsculas: MARTILLO y martillo son el mismo.</li>
                  <li>Las filas con error no frenan al resto. El resultado indica el número de fila.</li>
                  <li>
                    Cada carga queda en el Historial: vos figurás como usuario que cargó, y{" "}
                    <code>comprado_por</code> como responsable.
                  </li>
                  <li>El archivo tiene que ser Excel <strong>.xlsx</strong>.</li>
                </ol>
                <p className="small text-secondary mb-0">
                  La plantilla también incluye la hoja <strong>Manual</strong> con estas indicaciones.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label fw-bold">Archivo Excel</label>
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
                  <div>Creados: <strong>{result.created || 0}</strong></div>
                  <div>Actualizados: <strong>{result.updated || 0}</strong></div>
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
                  {isUploading ? "Importando..." : "Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkImportModal;
