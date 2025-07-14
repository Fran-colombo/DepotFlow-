import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { getFilteredHistorial } from "../api/items"
import PackingSlipModal from "../components/CrearRemito";
import {getSheds} from "../api/sheds"
const Historial = () => {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheds, setSheds] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 1
  });
  const [showRemitoModal, setShowRemitoModal] = useState(false);
  const [filters, setFilters] = useState({
    itemName: "",
    userName: "",
    place: "",
    category: "",
    shed: "",
    action: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    showAll: false
  });


useEffect(() => {
  const loadSheds = async () => {
    try {
      const data = await getSheds();
      setSheds(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error al cargar sheds:", err);
      setError("Error al cargar los depósitos");
    }
  };
  
  loadSheds();
}, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHistorial();
    }, 500);

    return () => clearTimeout(timer);
  }, [filters, pagination.page, pagination.pageSize]);

  const fetchHistorial = async () => {
    try {
      setLoading(true);
      const response = await getFilteredHistorial(
        {
          ...filters,
          shedId: filters.shed
        },
        pagination.page,
        pagination.pageSize
      );
      
      setHistorial(response.data);
      setPagination({
        ...pagination,
        totalRecords: response.pagination.total_records,
        totalPages: response.pagination.total_pages
      });
      setError("");
    } catch (err) {
      setError(err.message);
      setHistorial([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('es-ES', options);
  };

  const getActionColor = (action) => {
    switch(action) {
      case 'retiro': return 'bg-danger text-white';
      case 'devolucion': return 'bg-success text-white';
      default: return 'bg-secondary text-white';
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); 
  };

  const clearFilters = () => {
    setFilters({
      itemName: "",
      userName: "",
      place: "",
      category: "",
      shed: "",
      action: "",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      showAll: false
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];

  return (
    <Dashboard title="Historial de retiros/devoluciones">
      <div className="card mb-4">
        <div className="card-body">
          <h3 className="h5 fw-bold mb-3">Filtrar Historial</h3>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Nombre de elemento:</label>
              <input
                type="text"
                name="itemName"
                value={filters.itemName}
                onChange={handleFilterChange}
                className="form-control"
                placeholder="Buscar por nombre..."
              />
            </div>
            
            <div className="col-md-3">
              <label className="form-label">Usuario que cargó el movimiento:</label>
              <input
                type="text"
                name="userName"
                value={filters.userName}
                onChange={handleFilterChange}
                className="form-control"
                placeholder="Buscar por usuario..."
              />
            </div>
            
            <div className="col-md-3">
              <label className="form-label">Lugar al que fue/Lugar del que volvió:</label>
              <input
                type="text"
                name="place"
                value={filters.place}
                onChange={handleFilterChange}
                className="form-control"
                placeholder="Buscar por lugar..."
              />
            </div>

            <div className="col-md-3">
              <label className="form-label">Categoría:</label>
              <input
                type="text"
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                className="form-control"
                placeholder="Buscar por categoría..."
              />
            </div>

            <div className="col-md-3">
              <label className="form-label">Depósito:</label>
              <select
                name="shed"
                value={filters.shed}
                onChange={handleFilterChange}
                className="form-select"
              >
                <option value="">Todos</option>
                {sheds.map((shed) => (
                  <option key={shed.id} value={shed.id}>
                    {shed.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">Acción: </label>
              <select
                name="action"
                value={filters.action}
                onChange={handleFilterChange}
                className="form-select"
              >
                <option value="">Todas</option>
                <option value="retiro">Retiros</option>
                <option value="devolucion">Devoluciones</option>
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">Mes</label>
              <select
                name="month"
                value={filters.month}
                onChange={handleFilterChange}
                className="form-select"
                disabled={filters.showAll}
              >
                {months.map(month => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">Año</label>
              <input
                type="number"
                name="year"
                value={filters.year}
                onChange={handleFilterChange}
                className="form-control"
                min="2025"
                max="2100"
                disabled={filters.showAll}
              />
            </div>

            <div className="col-md-3 d-flex align-items-end">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="showAllCheckbox"
                  checked={filters.showAll}
                  onChange={(e) => setFilters({
                    ...filters,
                    showAll: e.target.checked
                  })}
                />
                <label className="form-check-label" htmlFor="showAllCheckbox">
                  Mostrar todo el historial
                </label>
              </div>
            </div>
          </div>
          
          <div className="d-flex justify-content-end mt-3">
            <button
              onClick={clearFilters}
              className="btn btn-outline-secondary"
            >
              Limpiar filtros
            </button>
          </div>
        <button
          onClick={() => setShowRemitoModal(true)}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? "Cargando..." : "Crear remito"}
        </button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="mt-2">Cargando historial...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <>
          <div className="table-responsive mb-3">
            <table className="table table-hover">
              <thead className="table-light">
                <tr className="text-center">
                  <th>Elemento</th>
                  <th>Categoría</th>
                  <th>Usuario</th>
                  <th>Responsable</th>
                  <th>Acción</th>
                  <th>Cantidad</th>
                  <th>Lugar</th>
                  <th>Depósito</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.length > 0 ? (
                  historial.map((registro) => (
                    <tr key={registro.id} className="text-center">
                      <td className="fw-medium">{registro.itemName}</td>
                      <td>{registro.itemCategory || 'N/A'}</td>
                      <td>{registro.userName}</td>
                      <td>{registro.personWhoTook || registro.userName}</td>
                      <td>
                        <span className={`badge ${getActionColor(registro.action)}`}>
                          {registro.action === 'retiro' ? 'Retiro' : 'Devolución'}
                        </span>
                      </td>
                      <td>{registro.amountRetired || registro.amountNotReturned || '0'}</td>
                      <td>{registro.place || 'N/A'}</td>
                      <td>{registro.shed_name || 'N/A'}</td>
                      <td>{formatDate(registro.date)}</td>
                      <td>
                        <span className={`badge ${registro.turnback ? 'bg-success' : 'bg-warning'}`}>
                          {registro.turnback ? 'Devuelto' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="10" className="text-center py-5 text-muted">
                      No se encontraron registros con los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {historial.length > 0 && (
            <div className="d-flex justify-content-between align-items-center">
              <div>
                Mostrando {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} 
                de {pagination.totalRecords} registros
              </div>
              
              <div className="btn-group">
                <button 
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="btn btn-outline-primary"
                >
                  Anterior
                </button>
                
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const pageNum = pagination.page <= 3 
                    ? i + 1 
                    : Math.min(pagination.totalPages - 4, pagination.page - 2) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`btn ${pagination.page === pageNum ? 'btn-primary' : 'btn-outline-primary'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button 
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="btn btn-outline-primary"
                >
                  Siguiente
                </button>
              </div>
              
              <div className="d-flex align-items-center gap-2">
                <select
                  value={pagination.pageSize}
                  onChange={(e) => setPagination({
                    ...pagination,
                    pageSize: Number(e.target.value),
                    page: 1
                  })}
                  className="form-select form-select-sm w-auto"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
                <span>registros por página</span>
              </div>
            </div>
          )}
        </>
      )}

      {showRemitoModal && (
  <PackingSlipModal
    onClose={() => setShowRemitoModal(false)}
  />
)}

    </Dashboard>
  );
};

export default Historial;