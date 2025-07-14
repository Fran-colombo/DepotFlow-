import { useEffect, useState } from "react";
import { getFilteredHistorial } from "../api/items";

export default function PackingSlipModal({onClose}) {
  const [historial, setHistorial] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
  page: 1,
  pageSize: 10,
  totalRecords: 0,
  totalPages: 1,
});
const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [filters, setFilters] = useState({
    itemName: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  useEffect(() => {
    loadHistorial();
  }, [filters, pagination.page, pagination.pageSize]);

  async function loadHistorial() {
    setLoading(true);
    try {
      const res = await getFilteredHistorial(filters, pagination.page, pagination.pageSize);
        setHistorial(res.data);
        setPagination(prev => ({
          ...prev,
          totalRecords: res.pagination.total_records,
          totalPages: res.pagination.total_pages
        }));
    } catch (error) {
      alert(error, "Error al cargar el historial");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

async function confirmarGenerarRemito() {
  try {
    const token = localStorage.getItem("authToken");

    const response = await fetch(import.meta.env.VITE_API_URL + "/historical/remito", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify(selectedIds),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Error al generar remito");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    window.open(url, "_blank");

    setShowConfirmModal(false);
  } catch (err) {
    console.error(err);
    alert(err.message || "Error generando el remito");
  }
}


const selectedItems = historial.filter(item => selectedIds.includes(item.id));

  function generarRemito() {
  if (selectedIds.length === 0) return alert("Seleccioná al menos un historial");
  setShowConfirmModal(true);
}


  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" }
  ];

  

  return (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ minWidth: "900px" }}>
        <div
          className="modal-content border-0 shadow"
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #228be6",
            boxShadow: "0 0 30px rgba(51, 154, 240, 0.3)",
          }}
        >
          <div
            className="modal-header"
            style={{
              backgroundColor: "#228be6",
              color: "white",
              borderTopLeftRadius: "0.75rem",
              borderTopRightRadius: "0.75rem",
            }}
          >
            <h5 className="modal-title">
              <i className="bi bi-list-columns-reverse me-2"></i>
              Seleccionar productos para Remito
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => onClose()}
            ></button>
          </div>

          <div className="modal-body px-4 py-3" style={{ background: "#ffffff" }}>
            <div className="row mb-3 g-3">
              <div className="col-md-4">
                <label className="form-label">Nombre del elemento</label>
                <input
                  type="text"
                  name="itemName"
                  value={filters.itemName}
                  onChange={handleFilterChange}
                  className="form-control"
                  placeholder="Buscar por nombre"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Mes</label>
                <select
                  name="month"
                  value={filters.month}
                  onChange={handleFilterChange}
                  className="form-select"
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Año</label>
                <input
                  type="number"
                  name="year"
                  value={filters.year}
                  onChange={handleFilterChange}
                  className="form-control"
                  min="2025"
                  max="2100"
                />
              </div>
            </div>

            {loading ? (
              <p>Cargando historial...</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-bordered table-hover text-center align-middle">
                  <thead className="table-light">
                    <tr>
                      <th></th>
                      <th>Ítem</th>
                      <th>Entregado por</th>
                      <th>Cantidad</th>
                      <th>Lugar</th>
                      <th>Depósito</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map(item => (
                      <tr key={item.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelection(item.id)}
                          />
                        </td>
                        <td>{item.itemName}</td>
                        <td>{item.userName}</td>
                        <td>{item.amountRetired}</td>
                        <td>{item.place}</td>
                        <td>{item.shed_name}</td>
                        <td>
                        {new Date(item.date).toLocaleString("es-AR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="d-flex justify-content-between mt-3">
              <button
                onClick={() => onClose()}
                className="btn btn-outline-primary"
                disabled={loading}
              >
                Volver
              </button>
              <button
                className="btn btn-success"
                onClick={generarRemito}
                disabled={selectedIds.length === 0}
              >
                Confirmar y Generar Remito
              </button>
            </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
        <div>
          Mostrando {(pagination.page - 1) * pagination.pageSize + 1} - 
          {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} de {pagination.totalRecords} registros
        </div>

        <div className="btn-group">
          <button
            className="btn btn-outline-primary"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
          >
            Anterior
          </button>

          <button
            className="btn btn-outline-primary"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page === pagination.totalPages}
          >
            Siguiente
          </button>
        </div>

        <div className="d-flex align-items-center gap-2">
          <select
            value={pagination.pageSize}
            onChange={(e) =>
              setPagination({
                ...pagination,
                pageSize: Number(e.target.value),
                page: 1,
              })
            }
            className="form-select form-select-sm w-auto"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
          <span>registros por página</span>
        </div>
      </div>

    </div>
    </div>

   </div>

        {showConfirmModal && (
    <div
      className="modal show d-block fade"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={() => setShowConfirmModal(false)}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="modal-content">
        <div className="modal-header bg-warning text-dark">
          <h5 className="modal-title">Confirmar generación de remito</h5>
          <button
            type="button"
            className="btn-close"
            onClick={() => setShowConfirmModal(false)}
          ></button>
        </div>
        <div className="modal-body">
          <p>¿Querés generar un remito con los siguientes ítems?</p>
          <ul>
            {selectedItems.map(item => (
              <li key={item.id}>
                {item.itemName} — {item.amountRetired} unidades ({item.place || "sin lugar"})
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setShowConfirmModal(false)}
          >
            Cancelar
          </button>
          <button
            className="btn btn-success"
            onClick={confirmarGenerarRemito}
          >
            Confirmar y generar
          </button>
        </div>
      </div>
    </div>
  </div>
)}

    </div>
  );
}
