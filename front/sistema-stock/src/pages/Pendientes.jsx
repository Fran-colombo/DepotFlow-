import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { getPendientes } from "../api/items";
import TrasladoModal from "../components/TrasladoModal";
import DevolverItemModal from "../components/DevolucionModal";

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
  const [showTrasladoModal, setShowTrasladoModal] = useState(false);
  const [showDevolverModal, setShowDevolverModal] = useState(false);
  const [selectedPending, setSelectedPending] = useState(null);

  const fetchPendientes = async (page = 1) => {
    setLoading(true);
    try {
      const response = await getPendientes(filters, page, pagination.page_size);

      setPendientes(response.data || []);

      setPagination(prev => ({
        ...prev,
        current_page: response.pagination?.current_page || response.data?.pagination?.current_page || 1,
        total_pages: response.pagination?.total_pages || response.data?.pagination?.total_pages || 1,
        page_size: response.pagination?.page_size || response.data?.pagination?.page_size || prev.page_size,
        total_records: response.pagination?.total_records || response.data?.pagination?.total_records || 0,
        has_next: response.pagination?.has_next || response.data?.pagination?.has_next || false,
        has_previous: response.pagination?.has_previous || response.data?.pagination?.has_previous || false
      }));
      setError("");
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

  useEffect(() => {
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
        <h1 className="fw-bold mb-0 d-md-none fs-4">Inventario Pendiente de Devolución</h1>
        <h1 className="display-5 fw-bold d-none d-md-block">Inventario Pendiente de Devolución</h1>
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
          <div className="d-md-none d-flex flex-column gap-3">
            {pendientes.length > 0 ? (
              pendientes.map((registro) => (
                <div key={registro.id} className="border rounded-3 p-3">
                  <div className="fw-semibold">{registro.itemName}</div>
                  <div className="small text-secondary mt-1">
                    {registro.personWhoTook || "—"}
                  </div>
                  <div className="fw-semibold text-warning my-2">
                    {registro.amountNotReturned} pendiente{registro.amountNotReturned === 1 ? "" : "s"}
                  </div>
                  <div className="small mb-1">{registro.place || "Sin lugar"}</div>
                  <div className="small text-secondary mb-3">{formatDate(registro.date)}</div>
                  <div className="d-grid gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-success"
                      onClick={() => {
                        setSelectedPending(registro);
                        setShowDevolverModal(true);
                      }}
                    >
                      Devolver
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-info"
                      onClick={() => {
                        setSelectedPending(registro);
                        setShowTrasladoModal(true);
                      }}
                    >
                      Trasladar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-muted py-4">
                No se encontraron pendientes con los filtros aplicados
              </div>
            )}
          </div>
          <div className="table-responsive d-none d-md-block">
            <table className="table table-hover">
              <thead className="table-light">
                <tr className="text-center">
                  <th>Producto</th>
                  <th>Persona que retiró</th>
                  <th>Cantidad Pendiente</th>
                  <th>Lugar</th>
                  <th>Fecha de Retiro</th>
                  <th>Acciones</th>
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
                      <td>
                        <div className="d-inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success"
                            onClick={() => {
                              setSelectedPending(registro);
                              setShowDevolverModal(true);
                            }}
                          >
                            Devolver
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-info"
                            onClick={() => {
                              setSelectedPending(registro);
                              setShowTrasladoModal(true);
                            }}
                          >
                            Trasladar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="text-center py-4">
                      No se encontraron pendientes con los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pendientes.length > 0 && (
            <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-stretch align-items-md-center gap-3 mt-3">
              <div>
                Mostrando {(pagination.current_page - 1) * pagination.page_size + 1}-
                {Math.min(pagination.current_page * pagination.page_size, pagination.total_records)} 
                de {pagination.total_records} registros
              </div>
              
              <div className="btn-group align-self-start">
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

      {showTrasladoModal && selectedPending && (
        <TrasladoModal
          itemId={selectedPending.itemId}
          isOpen={showTrasladoModal}
          defaultFromPlace={selectedPending.place || ""}
          onClose={() => {
            setShowTrasladoModal(false);
            setSelectedPending(null);
          }}
          onSuccess={() => fetchPendientes(pagination.current_page)}
        />
      )}

      {showDevolverModal && selectedPending && (
        <DevolverItemModal
          itemId={selectedPending.itemId}
          isOpen={showDevolverModal}
          defaultPlace={selectedPending.place || ""}
          onClose={() => {
            setShowDevolverModal(false);
            setSelectedPending(null);
          }}
          onSuccess={() => fetchPendientes(pagination.current_page)}
        />
      )}
    </Dashboard>
  );
};

export default Pendientes;
