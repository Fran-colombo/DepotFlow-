import { useEffect, useState } from "react";
import { getItems} from "../api/items";
import { getSheds } from "../api/sheds";
import { getMovements } from "../api/movements";
import Dashboard from "./Dashboard";
import SwitchShedModal from "../components/SwitchShedModal";
import MovementsModal from "../components/MovementsModal";
import ObservationsModal from "../components/Observaciones";
import DevolverItemModal from "../components/DevolucionModal";
import RetirarItemModal from "../components/RetiroModal";
import DeleteItemModal from "../components/DeleteItemModal";
import UpdateItemModal from "../components/UpdateItem";

const Items = () => {
  const [items, setItems] = useState([]);
  const [sheds, setSheds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ name: "", category: "", shed: "" });
  const [selectedItem, setSelectedItem] = useState(null);
  const [showObservationsModal, setShowObservationsModal] = useState(false);
  const [showDevolverModal, setShowDevolverModal] = useState(false);
  const [showRetirarModal, setShowRetirarModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);
  const [movements, setMovements] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 });
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [itemsData, shedsData] = await Promise.all([
          getItems(filters, 1, pagination.pageSize),
          getSheds()
        ]);
        const uniqueCategories = [...new Set(itemsData.data.map(item => item.category))];
        setItems(itemsData.data);
        setSheds(shedsData);
        setCategories(uniqueCategories);
        setPagination({
          ...pagination,
          totalRecords: itemsData.pagination.total_records,
          totalPages: itemsData.pagination.total_pages
        });
      } catch (err) {
        console.error("Error cargando datos:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      setIsLoading(true);
      try {
        const itemsData = await getItems(filters, 1, pagination.pageSize);
        setItems(itemsData.data);
        setPagination({
          ...pagination,
          page: 1,
          totalRecords: itemsData.pagination.total_records,
          totalPages: itemsData.pagination.total_pages
        });
      } catch (err) {
        console.error("Error aplicando filtros automáticos:", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ name: "", category: "", shed: "" });
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(filters.name.toLowerCase())
  );

  const handlePageChange = async (newPage) => {
    setIsLoading(true);
    try {
      const itemsData = await getItems(filters, newPage, pagination.pageSize);
      setItems(itemsData.data);
      setPagination(prev => ({ ...prev, page: newPage }));
    } catch (err) {
      console.error("Error cambiando página:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getShedName = (shedId) => {
    const shed = sheds.find(s => s.id === shedId);
    return shed ? shed.name : 'Sin asignar';
  };


  const handleShowMovements = async (item) => {
    setSelectedItem(item);
    setIsLoading(true);
    try {
      const movs = await getMovements(item.id);
      setMovements(movs);
      setShowMovementsModal(true);
    } catch (err) {
      console.error("Error cargando movimientos:", err);
      setMovements([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveItem = (item) => {
    setSelectedItem(item);
    setShowMoveModal(true);
  };
  const handleShowDevolverModal = (item) => {
  setSelectedItem(item);
  setShowDevolverModal(true);
};

const handleShowRetirarModal = (item) => {
  setSelectedItem(item);
  setShowRetirarModal(true);
};

  return (
    <Dashboard title="Inventario Conkreto">
      <div className="card mb-4">
        <div className="card-body">
          <h3 className="h5 fw-bold mb-3">Filtrar</h3>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">Nombre</label>
              <input
                type="text"
                name="name"
                value={filters.name}
                onChange={handleFilterChange}
                className="form-control"
                placeholder="Buscar por nombre..."
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Categoría</label>
              <select
                name="category"
                value={filters.category}
                onChange={handleFilterChange}
                className="form-select"
              >
                <option value="">Todas</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Depósito</label>
              <select
                name="shed"
                value={filters.shed}
                onChange={handleFilterChange}
                className="form-select"
              >
                <option value="">Todos</option>
                {sheds.map(shed => (
                  <option key={shed.id} value={shed.id}>{shed.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button
                onClick={clearFilters}
                className="btn btn-outline-secondary w-100"
                disabled={isLoading}
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <button
          onClick={() => setShowUpdateModal(true)}
          className="btn btn-primary"
          disabled={isLoading}
        >
          {isLoading ? "Cargando..." : "Agregar/Actualizar ítem"}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center my-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead className="table-light">
                <tr className="text-center">
                  {["Nombre", "Categoría", "Descripción", "Stock Total", "Disponible", "Estado", "Observaciones", "Acciones", "Depósito", "Movimientos", "eliminar"].map((th) => (
                    <th key={th} scope="col">{th}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const isOutOfStock = item.actualAmount === 0;
                  const cantEliminate = item.actualAmount != item.totalAmount;
                  return (
                    <tr key={item.id} className="text-center">
                      <td 
                        className="fw-medium text-primary cursor-pointer"
                      >
                        {item.name}
                      </td>
                      <td>{item.category}</td>
                      <td>{item.description}</td>
                      <td>{item.totalAmount}</td>
                      <td className={`fw-semibold ${isOutOfStock ? 'text-danger' : 'text-success'}`}>
                        {item.actualAmount}
                      </td>

                      <td>
                        <i className={`bi ${isOutOfStock ? 'bi-x-circle text-danger' : 'bi-check-circle text-success'}`}></i>
                      </td>
                      <td>
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setShowObservationsModal(true);
                          }}
                          disabled={isLoading}
                          className="btn btn-sm btn-outline-secondary"
                          title="Ver observaciones"
                        >
                          <i className="bi bi-chat-dots"></i>
                        </button>
                        </td>
                        <td>
                          <div className="d-flex justify-content-center gap-2">
                            <button
                              onClick={() => handleShowRetirarModal(item)}
                              disabled={item.actualAmount === 0 || isLoading}
                              className="btn btn-sm btn-outline-danger"
                              title="Retirar ítem"
                            >
                              <i className="bi bi-box-arrow-up"></i>
                            </button>
                            <button
                              onClick={() => handleShowDevolverModal(item)}
                              disabled={item.actualAmount === item.totalAmount || isLoading}
                              className="btn btn-sm btn-outline-success"
                              title="Devolver ítem"
                            >
                              <i className="bi bi-box-arrow-down"></i>
                            </button>
                          </div>
                        </td>
                        <td>{getShedName(item.shed_id)}</td>
                          <td>
                            <div className="d-flex justify-content-center gap-2">
                              <button
                                onClick={() => handleMoveItem(item)}
                                disabled={isOutOfStock || isLoading}
                                className={`btn btn-sm ${isOutOfStock ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                                title="Mover ítem"
                              >
                                <i className="bi bi-arrow-left-right"></i>
                              </button>
                              <button
                                onClick={() => handleShowMovements(item)}
                                disabled={isLoading}
                                className="btn btn-sm btn-outline-info"
                                title="Ver historial"
                              >
                                <i className="bi bi-clock-history"></i>
                              </button>
                            </div>
                          </td>
                          <td>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setShowDeleteModal(true);
                            }}
                            disabled={cantEliminate || isLoading}
                            className="btn btn-sm btn-outline-danger"
                            title="Eliminar ítem"
                          >
                            <i className="bi bi-trash"></i>
                          </button>

                          </td>

                       </tr>
                  );
                })) : (
          <tr>
            <td colSpan="11" className="text-center py-4">
              No se encontraron productos con los filtros aplicados
            </td>
          </tr>)}
                  
                </tbody>
              </table>
            </div>

            {items.length > 0 && (
              <div className="d-flex justify-content-between align-items-center mt-3">
                <div>
                  Mostrando {(pagination.page - 1) * pagination.pageSize + 1}-
                  {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} 
                  de {pagination.totalRecords} registros
                </div>
                
                <div className="btn-group">
                  <button 
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1 || isLoading}
                    className="btn btn-outline-primary"
                  >
                    Anterior
                  </button>
                  <button className="btn btn-light" disabled>
                    Página {pagination.page} de {pagination.totalPages}
                  </button>
                  <button 
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages || isLoading}
                    className="btn btn-outline-primary"
                  >
                    Siguiente
                  </button>
                </div>
                
                <div className="d-flex align-items-center gap-2">
                  <span>Mostrar:</span>
                  <select
                    value={pagination.pageSize}
                    onChange={(e) => {
                      setPagination({
                        ...pagination,
                        pageSize: Number(e.target.value),
                        page: 1
                      });
                      handlePageChange(1);
                    }}
                    className="form-select form-select-sm w-auto"
                    disabled={isLoading}
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                  </select>
                  <span>registros</span>
                </div>
              </div>
            )}
          </>
        )}


          {showMoveModal && selectedItem && (
            <SwitchShedModal
              item={selectedItem}
              isOpen={showMoveModal}
              onClose={() => setShowMoveModal(false)}
              refreshItems={() =>
                getItems(filters, pagination.page, pagination.pageSize).then(res =>
                  setItems(res.data)
                )
              }
              sheds={sheds}
            />
          )}


                <MovementsModal
                  isOpen={showMovementsModal}
                  item={selectedItem}
                  movements={movements}
                  onClose={() => setShowMovementsModal(false)}
                />
          {showObservationsModal && selectedItem && (
            <ObservationsModal
              itemId={selectedItem.id}
              isOpen={showObservationsModal}
              onClose={() => setShowObservationsModal(false)}
            />
          )}

          {showDevolverModal && selectedItem && (
            <DevolverItemModal
              itemId={selectedItem.id}
              isOpen={showDevolverModal}
              onClose={() => setShowDevolverModal(false)}
              onSuccess={() => {
                getItems(filters, pagination.page, pagination.pageSize).then(res => setItems(res.data));
              }}
            />
          )}

          {showRetirarModal && selectedItem && (
            <RetirarItemModal
              itemId={selectedItem.id}
              isOpen={showRetirarModal}
              onClose={() => setShowRetirarModal(false)}
              onSuccess={() => {
                getItems(filters, pagination.page, pagination.pageSize).then(res => setItems(res.data));
              }}
            />
          )}

          {showDeleteModal && selectedItem && (
            <DeleteItemModal
              itemId={selectedItem.id}
              isOpen={showDeleteModal}
              onClose={() => setShowDeleteModal(false)}
              onSuccess={() => {
                getItems(filters, pagination.page, pagination.pageSize).then(res => setItems(res.data));
              }}
            />
          )}

          {showUpdateModal && (
            <UpdateItemModal
              isOpen={showUpdateModal}
              onClose={() => setShowUpdateModal(false)}
              refreshItems={() =>
                getItems(filters, pagination.page, pagination.pageSize).then(res =>
                  setItems(res.data)
                )
              }
            />
          )}
     </Dashboard>
    );
  };

export default Items;