import { useState, useEffect } from "react";
import { getDeletedItems } from "../api/items";
import Dashboard from "./Dashboard";

const DeletedItemsPage = () => {
  const [deletedItems, setDeletedItems] = useState([]);
  const [filters, setFilters] = useState({ 
    name: "", 
    category: "", 
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    year: new Date().getFullYear()
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    totalPages: 1,
    totalRecords: 0
  });

const fetchData = async () => {
  setLoading(true);
  setError("");

  try {
    const apiResponse = await getDeletedItems({
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize
    });

    // Asegúrate que la respuesta coincida con tu estructura de backend
    if (!apiResponse || !apiResponse.data) {
      throw new Error("Estructura de respuesta inválida");
    }

    setDeletedItems(apiResponse.data);
    setPagination(prev => ({
      ...prev,
      totalPages: apiResponse.pagination?.total_pages || 1,
      totalRecords: apiResponse.pagination?.total_records || 0,
      hasNext: apiResponse.pagination?.has_next || false,
      hasPrevious: apiResponse.pagination?.has_previous || false
    }));

  } catch (err) {
    console.error("Error al cargar items eliminados:", err);
    setError(err.message);
    setDeletedItems([]);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchData();
  }, [filters, pagination.page, pagination.pageSize]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters(
      { 
      name: "", 
      category: "",      
      month: String(new Date().getMonth() + 1).padStart(2, '0') ,
      year: new Date().getFullYear()
    });
  };

  const formatDate = (dateString) => {
    const options = { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    return new Date(dateString).toLocaleDateString('es-AR', options);
  };


  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear + 1 - 2025 }, (_, i) => 2025 + i);

  return (
    <Dashboard>
      <div className="container-fluid px-4 mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="mb-0">Elementos eliminados</h2>
        </div>

        {/* Filtros */}
        <div className="card mb-4">
          <div className="card-header bg-light">
            <h5 className="mb-0">Filtrado</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <input
                  type="text"
                  name="name"
                  value={filters.name}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Buscar por nombre..."
                />
              </div>
              <div className="col-md-3">
                <input
                  type="text"
                  name="category"
                  value={filters.category}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="Categoría"
                />
              </div>
              <div className="col-md-2">
                <select
                  name="month"
                  value={filters.month}
                  onChange={handleChange}
                  className="form-select"
                >
                  <option value="">Todos los meses</option>
                  <option value="01">Enero</option>
                  <option value="02">Febrero</option>
                  <option value="03">Marzo</option>
                  <option value="04">Abril</option>
                  <option value="05">Mayo</option>
                  <option value="06">Junio</option>
                  <option value="07">Julio</option>
                  <option value="08">Agosto</option>
                  <option value="09">Septiembre</option>
                  <option value="10">Octubre</option>
                  <option value="11">Noviembre</option>
                  <option value="12">Diciembre</option>
                  
                </select>
                
              </div>
              <div className="col-md-2">
                <select
                  name="year"
                  value={filters.year}
                  onChange={handleChange}
                  className="form-select"
                >
                  <option value="">Todos los años</option>
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <button 
                  onClick={clearFilters} 
                  className="btn btn-outline-secondary w-100"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body p-0">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger m-3">{error}</div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th>Descripción</th>
                        <th>Motivo</th>
                        <th>Fecha Eliminación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedItems.map(item => (
                        <tr key={item.id}>
                          <td className="fw-semibold">{item.name}</td>
                          <td>{item.category}</td>
                          <td>{item.description || '-'}</td>
                          <td>{item.deletion_reason || '-'}</td>
                          <td>{formatDate(item.deleted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {deletedItems.length === 0 && !loading && (
                  <div className="text-center py-4 text-muted">
                    No se encontraron elementos eliminados
                  </div>
                )}
              </>
            )}
          </div>
          {deletedItems.length > 0 && (
            <div className="card-footer bg-light">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-center">
                <div className="mb-2 mb-md-0">
                  Mostrando {(pagination.page - 1) * pagination.pageSize + 1}-
                  {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} 
                  de {pagination.totalRecords} registros
                </div>
                
                <div className="d-flex align-items-center gap-2">
                  <div className="btn-group">
                    <button 
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      disabled={pagination.page === 1 || loading}
                      className="btn btn-outline-primary btn-sm"
                    >
                      Anterior
                    </button>
                    <button className="btn btn-light btn-sm" disabled>
                      Página {pagination.page} de {pagination.totalPages}
                    </button>
                    <button 
                      onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages || loading}
                      className="btn btn-outline-primary btn-sm"
                    >
                      Siguiente
                    </button>
                  </div>
                  
                  <div className="d-flex align-items-center ms-md-3">
                    <span className="me-2">Mostrar:</span>
                    <select
                      value={pagination.pageSize}
                      onChange={(e) => {
                        setPagination({ 
                          ...pagination, 
                          page: 1, 
                          pageSize: Number(e.target.value) 
                        });
                      }}
                      className="form-select form-select-sm w-auto"
                      disabled={loading}
                    >
                      {[10, 25, 50, 100].map(size => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dashboard>
  );
};

export default DeletedItemsPage;