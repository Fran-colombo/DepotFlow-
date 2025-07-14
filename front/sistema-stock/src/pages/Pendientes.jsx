import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { getPendientes } from "../api/items";

const Pendientes = () => {
  const [pendientes, setPendientes] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    page_size: 10,
    total_records: 0,
    has_next: false,
    has_previous: false
  });
  const [filters, setFilters] = useState({
    personWhoTook: "",
    place: ""
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  useEffect(() => {
    const fetchPendientes = async (page = 1) => {
      setLoading(true);
      try {
        const response = await getPendientes(filters, page, pagination.page_size);
        
        setPendientes(response.data || []);
        
        setPagination(prev => ({
          ...prev,
          current_page: response.data.pagination?.current_page || 1,
          total_pages: response.data.pagination?.total_pages || 1,
          page_size: response.data.pagination?.page_size || prev.page_size,
          total_records: response.data.pagination?.total_records || 0,
          has_next: response.data.pagination?.has_next || false,
          has_previous: response.data.pagination?.has_previous || false
        }));

        
      } catch (err) {
        console.error('Error fetching pendientes:', err);
        if (err.message?.includes("No pending historical records found")) {
          setPendientes([]);
        } else {
          setError(err.message || "Error al cargar los pendientes");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPendientes(pagination.current_page);
  }, [pagination.current_page, filters, pagination.page_size]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
    setPagination(prev => ({ ...prev, current_page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, current_page: newPage }));
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

 return (
    <Dashboard title={
      <div className="text-center">
        <h1 className="display-5 fw-bold">Inventario Pendiente de Devolución</h1>
      </div>
    }>
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label">Persona que retiró</label>
          <input
            type="text"
            name="personWhoTook"
            value={filters.personWhoTook}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Buscar por persona"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label">Lugar al que fue</label>
          <input
            type="text"
            name="place"
            value={filters.place}
            onChange={handleFilterChange}
            className="form-control"
            placeholder="Buscar por lugar"
          />
        </div>
      </div>
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="mt-2">Cargando pendientes...</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead className="table-light">
                <tr className="text-center">
                  <th>Producto</th>
                  <th>Persona que retiró</th>
                  <th>Cantidad Pendiente</th>
                  <th>Lugar</th>
                  <th>Fecha de Retiro</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.length > 0 ? (
                  pendientes.map((registro) => (
                    <tr key={registro.id} className="text-center">
                      <td className="fw-medium">{registro.itemName}</td>
                      <td>{registro.personWhoTook}</td>
                      <td className="fw-semibold text-warning">{registro.amountNotReturned}</td>
                      <td>{registro.place || 'N/A'}</td>
                      <td>{formatDate(registro.date)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="text-center py-4">
                      No se encontraron pendientes con los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pendientes.length > 0 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <div>
                Mostrando {(pagination.current_page - 1) * pagination.page_size + 1}-
                {Math.min(pagination.current_page * pagination.page_size, pagination.total_records)} 
                de {pagination.total_records} registros
              </div>
              
              <div className="btn-group">
                <button 
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={!pagination.has_previous}
                  className="btn btn-outline-primary"
                >
                  Anterior
                </button>
                
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const pageNum = pagination.current_page <= 3 
                    ? i + 1 
                    : Math.min(pagination.total_pages - 4, pagination.current_page - 2) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`btn ${pagination.current_page === pageNum ? 'btn-primary' : 'btn-outline-primary'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button 
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                  disabled={!pagination.has_next}
                  className="btn btn-outline-primary"
                >
                  Siguiente
                </button>
              </div>
              
              <div className="d-flex align-items-center gap-2">
                <select
                  value={pagination.page_size}
                  onChange={(e) => setPagination({
                    ...pagination,
                    page_size: Number(e.target.value),
                    current_page: 1
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
    </Dashboard>
  );
};

export default Pendientes;