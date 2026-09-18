import { useEffect, useMemo, useState } from "react";
import { getAllItems, getItemImageUrl, getItems, deleteItemImage } from "../api/items";
import { getSheds } from "../api/sheds";
import { getZones } from "../api/zones";
import { getMovements } from "../api/movements";
import Dashboard from "./Dashboard";
import SwitchShedModal from "../components/SwitchShedModal";
import MovementsModal from "../components/MovementsModal";
import ObservationsModal from "../components/Observaciones";
import DevolverItemModal from "../components/DevolucionModal";
import RetirarItemModal from "../components/RetiroModal";
import DeleteItemModal from "../components/DeleteItemModal";
import UpdateItemModal from "../components/UpdateItem";
import BulkImportModal from "../components/BulkImportModal";
import BulkUpdateModal from "../components/BulkUpdateModal";
import TransferExportModal from "../components/TransferExportModal";
import PackingSlipModal from "../components/CrearRemito";
import TrasladoModal from "../components/TrasladoModal";
import PendingLocationsModal from "../components/PendingLocationsModal";
import ItemHistorialModal from "../components/ItemHistorialModal";
import ItemImageModal from "../components/ItemImageModal";

const isConsumable = (item) => item?.category === "Materiales consumibles";

const Items = () => {
  const [items, setItems] = useState([]);
  const [sheds, setSheds] = useState([]);
  const [zones, setZones] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ name: "", category: "", shed: "", zone: "" });
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
  const [itemModal, setItemModal] = useState({ open: false, mode: "create", itemId: null });
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [selectedById, setSelectedById] = useState({});
  const [isSelectingFiltered, setIsSelectingFiltered] = useState(false);
  const [showTransferExportModal, setShowTransferExportModal] = useState(false);
  const [pendingRemitoData, setPendingRemitoData] = useState(null);
  const [showRemitoModal, setShowRemitoModal] = useState(false);
  const [showTrasladoModal, setShowTrasladoModal] = useState(false);
  const [showPendingLocationsModal, setShowPendingLocationsModal] = useState(false);
  const [showItemHistorialModal, setShowItemHistorialModal] = useState(false);
  const [itemImageModal, setItemImageModal] = useState({ open: false, mode: "upload" });

  const [openMenuId, setOpenMenuId] = useState(null);

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
    if (openMenuId == null) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  useEffect(() => {
    const loadZones = async () => {
      if (!filters.shed) {
        setZones([]);
        return;
      }
      try {
        const zonesData = await getZones(filters.shed);
        setZones(zonesData);
      } catch (err) {
        console.error("Error cargando zonas:", err);
        setZones([]);
      }
    };
    loadZones();
  }, [filters.shed]);

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
    setFilters((prev) => {
      if (name === "shed") {
        return { ...prev, shed: value, zone: "" };
      }
      return { ...prev, [name]: value };
    });
  };

  const clearFilters = () => {
    setFilters({ name: "", category: "", shed: "", zone: "" });
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(filters.name.toLowerCase())
  );

  const movableOnPage = filteredItems.filter((item) => (item.actualAmount || 0) > 0);
  const selectedItems = useMemo(() => Object.values(selectedById), [selectedById]);
  const selectedCount = selectedItems.length;
  const selectedOnPageCount = movableOnPage.filter((item) => selectedById[item.id]).length;
  const allPageSelected = movableOnPage.length > 0 && selectedOnPageCount === movableOnPage.length;

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

  const getLocationLabel = (item) => {
    const shed = getShedName(item.shed_id);
    const zone = item.zone_name || "Sin zona";
    return `${shed} / ${zone}`;
  };

  const refreshCurrentPage = async () => {
    const res = await getItems(filters, pagination.page, pagination.pageSize);
    setItems(res.data);
    setPagination((prev) => ({
      ...prev,
      totalRecords: res.pagination.total_records,
      totalPages: res.pagination.total_pages,
    }));
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

  const toggleItemSelection = (item) => {
    if ((item.actualAmount || 0) <= 0) return;
    setSelectedById((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = item;
      }
      return next;
    });
  };

  const togglePageSelection = () => {
    setSelectedById((prev) => {
      const next = { ...prev };
      if (allPageSelected) {
        movableOnPage.forEach((item) => {
          delete next[item.id];
        });
      } else {
        movableOnPage.forEach((item) => {
          next[item.id] = item;
        });
      }
      return next;
    });
  };

  const handleSelectFiltered = async () => {
    setIsSelectingFiltered(true);
    try {
      const all = await getAllItems(filters);
      setSelectedById((prev) => {
        const next = { ...prev };
        all.forEach((item) => {
          if ((item.actualAmount || 0) > 0) {
            next[item.id] = item;
          }
        });
        return next;
      });
    } catch (err) {
      console.error("Error seleccionando filtrados:", err);
      alert(err.message || "No se pudieron seleccionar los productos filtrados");
    } finally {
      setIsSelectingFiltered(false);
    }
  };

  const handleExportSelected = () => {
    const movable = selectedItems.filter((item) => (item.actualAmount || 0) > 0);
    if (movable.length === 0) {
      alert("Seleccioná al menos un producto con stock para trasladar");
      return;
    }
    setShowTransferExportModal(true);
  };

  const transferExportItems = selectedItems
    .filter((item) => (item.actualAmount || 0) > 0)
    .map((item) => ({
      ...item,
      locationLabel: getLocationLabel(item),
    }));

  return (
    <Dashboard title="Inventario">
      <div className="app-filter-bar">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label small text-secondary mb-1">Nombre</label>
            <input
              type="text"
              name="name"
              value={filters.name}
              onChange={handleFilterChange}
              className="form-control form-control-sm"
              placeholder="Buscar..."
            />
          </div>
          <div className="col-md-2">
            <label className="form-label small text-secondary mb-1">Categoría</label>
            <select
              name="category"
              value={filters.category}
              onChange={handleFilterChange}
              className="form-select form-select-sm"
            >
              <option value="">Todas</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small text-secondary mb-1">Depósito</label>
            <select
              name="shed"
              value={filters.shed}
              onChange={handleFilterChange}
              className="form-select form-select-sm"
            >
              <option value="">Todos</option>
              {sheds.map(shed => (
                <option key={shed.id} value={shed.id}>{shed.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small text-secondary mb-1">Zona</label>
            <select
              name="zone"
              value={filters.zone}
              onChange={handleFilterChange}
              className="form-select form-select-sm"
              disabled={!filters.shed}
            >
              <option value="">Todas</option>
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <button
              onClick={clearFilters}
              className="btn btn-sm btn-outline-secondary w-100"
              disabled={isLoading}
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-3">
          <p className="app-muted mb-0">
            {pagination.totalRecords} producto{pagination.totalRecords === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            className="btn btn-link btn-sm text-decoration-none px-0"
            onClick={handleSelectFiltered}
            disabled={isSelectingFiltered || isLoading || pagination.totalRecords === 0}
          >
            {isSelectingFiltered ? "Seleccionando..." : "Seleccionar filtrados"}
          </button>
        </div>
        <div className="d-flex gap-2">
          <button
            onClick={() => setShowBulkImportModal(true)}
            className="btn btn-outline-primary btn-sm"
            disabled={isLoading}
          >
            Carga masiva
          </button>
          <button
            onClick={() => setShowBulkUpdateModal(true)}
            className="btn btn-outline-primary btn-sm"
            disabled={isLoading}
          >
            Actualización masiva
          </button>
          <button
            onClick={() => setItemModal({ open: true, mode: "create", itemId: null })}
            className="btn btn-primary btn-sm"
            disabled={isLoading}
          >
            {isLoading ? "Cargando..." : "Agregar"}
          </button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="app-selection-bar d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <span className="fw-semibold">
            {selectedCount} producto{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}
          </span>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={handleSelectFiltered}
              disabled={isSelectingFiltered || isLoading}
            >
              {isSelectingFiltered ? "Seleccionando..." : "Seleccionar filtrados"}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleExportSelected}
            >
              Exportar traslado
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setSelectedById({})}
            >
              Limpiar selección
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center my-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : (
        <>
          <div className={`table-responsive${openMenuId != null ? " table-menu-open" : ""}`}>
            <table className="table app-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedOnPageCount > 0 && !allPageSelected;
                        }
                      }}
                      onChange={togglePageSelection}
                      disabled={movableOnPage.length === 0}
                      title="Seleccionar productos con stock de esta página"
                    />
                  </th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th className="text-end">Stock</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length > 0 ? (
                filteredItems.map((item, rowIndex) => {
                  const isOutOfStock = item.actualAmount === 0;
                  const cantEliminate = item.actualAmount != item.totalAmount;
                  const canReturn = item.actualAmount !== item.totalAmount;
                  const menuDropUp =
                    filteredItems.length <= 3 || rowIndex >= filteredItems.length - 2;
                  return (
                    <tr key={item.id} className={selectedById[item.id] ? "is-selected" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={Boolean(selectedById[item.id])}
                          onChange={() => toggleItemSelection(item)}
                          disabled={isOutOfStock}
                          title={isOutOfStock ? "Sin stock: no se puede trasladar" : `Seleccionar ${item.name}`}
                          aria-label={`Seleccionar ${item.name}`}
                        />
                      </td>
                      <td>
                        <div className="d-flex align-items-start gap-2">
                          {item.has_image ? (
                            <img
                              src={getItemImageUrl(item)}
                              alt={item.name}
                              className="item-thumb"
                              title="Ver imagen"
                              onClick={() => {
                                setSelectedItem(item);
                                setItemImageModal({ open: true, mode: "view" });
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              className="item-thumb-placeholder"
                              title="Cargar imagen"
                              onClick={() => {
                                setSelectedItem(item);
                                setItemImageModal({ open: true, mode: "upload" });
                              }}
                            >
                              <i className="bi bi-camera"></i>
                            </button>
                          )}
                          <div>
                            <div className="fw-semibold text-dark">{item.name}</div>
                            {item.description && (
                              <div className="app-muted text-truncate" style={{ maxWidth: 280 }}>
                                {item.description}
                              </div>
                            )}
                            <span
                              className={`badge mt-1 ${
                                isConsumable(item) ? "bg-warning text-dark" : "bg-secondary"
                              }`}
                            >
                              {isConsumable(item) ? "Insumo" : "Herramienta"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-secondary">{item.category}</td>
                      <td>
                        <span className="text-dark">{getLocationLabel(item)}</span>
                      </td>
                      <td className="text-end">
                        <div className={`fw-semibold ${isOutOfStock ? "text-danger" : "text-dark"}`}>
                          {item.actualAmount}
                          <span className="app-muted fw-normal"> / {item.totalAmount}</span>
                        </div>
                        <span className={`app-stock-badge ${isOutOfStock ? "out" : "ok"}`}>
                          {isOutOfStock ? "Sin stock" : "Disponible"}
                        </span>
                      </td>
                      <td className="text-end">
                        <div className="d-inline-flex align-items-center gap-1">
                          <button
                            onClick={() => handleShowRetirarModal(item)}
                            disabled={item.actualAmount === 0 || isLoading}
                            className="btn btn-sm btn-outline-danger"
                            title="Retirar"
                          >
                            Retirar
                          </button>
                          <button
                            onClick={() => handleShowDevolverModal(item)}
                            disabled={!canReturn || isLoading}
                            className="btn btn-sm btn-outline-success"
                            title="Devolver"
                          >
                            Devolver
                          </button>
                          <div className={`dropdown${menuDropUp ? " dropup" : ""}`}>
                            <button
                              className="btn btn-sm btn-light border"
                              type="button"
                              aria-expanded={openMenuId === item.id}
                              disabled={isLoading}
                              title="Más acciones"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId((prev) => (prev === item.id ? null : item.id));
                              }}
                            >
                              <i className="bi bi-three-dots"></i>
                            </button>
                            {openMenuId === item.id && (
                              <ul
                                className="dropdown-menu dropdown-menu-end show shadow-sm item-actions-menu"
                                style={{
                                  display: "block",
                                  position: "absolute",
                                  right: 0,
                                  left: "auto",
                                  zIndex: 1055,
                                  ...(menuDropUp
                                    ? { bottom: "100%", top: "auto", marginBottom: "0.25rem" }
                                    : { top: "100%", marginTop: "0.25rem" }),
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setItemImageModal({
                                        open: true,
                                        mode: "upload",
                                      });
                                    }}
                                  >
                                    {item.has_image ? "Actualizar imagen" : "Cargar imagen"}
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    disabled={!item.has_image}
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setItemImageModal({ open: true, mode: "view" });
                                    }}
                                  >
                                    Ver imagen
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item text-danger"
                                    type="button"
                                    disabled={!item.has_image}
                                    onClick={async () => {
                                      setOpenMenuId(null);
                                      if (!window.confirm(`¿Eliminar la imagen de "${item.name}"?`)) return;
                                      try {
                                        await deleteItemImage(item.id);
                                        refreshCurrentPage();
                                      } catch (err) {
                                        window.alert(err.message || "No se pudo eliminar la imagen");
                                      }
                                    }}
                                  >
                                    Eliminar imagen
                                  </button>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setItemModal({
                                        open: true,
                                        mode: "update",
                                        itemId: item.id,
                                      });
                                    }}
                                  >
                                    Actualizar stock
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setShowObservationsModal(true);
                                    }}
                                  >
                                    Observaciones
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    disabled={!canReturn}
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setShowPendingLocationsModal(true);
                                    }}
                                  >
                                    Ver dónde están
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    disabled={isOutOfStock}
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      handleMoveItem(item);
                                    }}
                                  >
                                    Mover
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    disabled={!canReturn}
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setShowTrasladoModal(true);
                                    }}
                                  >
                                    Trasladar entre obras
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      handleShowMovements(item);
                                    }}
                                  >
                                    Historial de movimientos
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setShowItemHistorialModal(true);
                                    }}
                                  >
                                    Historial de retiros
                                  </button>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li>
                                  <button
                                    className="dropdown-item text-danger"
                                    type="button"
                                    disabled={cantEliminate}
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setSelectedItem(item);
                                      setShowDeleteModal(true);
                                    }}
                                  >
                                    Eliminar
                                  </button>
                                </li>
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })) : (
                  <tr>
                    <td colSpan="6" className="text-center text-muted py-5">
                      No se encontraron productos con los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mt-4">
              <div className="app-muted">
                Mostrando {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)}
                {" "}de {pagination.totalRecords}
              </div>

              <div className="btn-group btn-group-sm">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1 || isLoading}
                  className="btn btn-outline-secondary"
                >
                  Anterior
                </button>
                <button className="btn btn-light border" disabled>
                  {pagination.page} / {pagination.totalPages}
                </button>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages || isLoading}
                  className="btn btn-outline-secondary"
                >
                  Siguiente
                </button>
              </div>

              <div className="d-flex align-items-center gap-2">
                <span className="app-muted">Mostrar</span>
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
          refreshItems={refreshCurrentPage}
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
          onSuccess={refreshCurrentPage}
        />
      )}

      {showTrasladoModal && selectedItem && (
        <TrasladoModal
          itemId={selectedItem.id}
          isOpen={showTrasladoModal}
          onClose={() => setShowTrasladoModal(false)}
          onSuccess={refreshCurrentPage}
        />
      )}

      {showPendingLocationsModal && selectedItem && (
        <PendingLocationsModal
          itemId={selectedItem.id}
          isOpen={showPendingLocationsModal}
          onClose={() => setShowPendingLocationsModal(false)}
        />
      )}

      {showItemHistorialModal && selectedItem && (
        <ItemHistorialModal
          itemId={selectedItem.id}
          isOpen={showItemHistorialModal}
          onClose={() => setShowItemHistorialModal(false)}
        />
      )}

      {showRetirarModal && selectedItem && (
        <RetirarItemModal
          itemId={selectedItem.id}
          isOpen={showRetirarModal}
          onClose={() => setShowRetirarModal(false)}
          onSuccess={refreshCurrentPage}
          onGenerateRemito={(remitoData) => {
            setPendingRemitoData(remitoData);
            setShowRemitoModal(true);
          }}
        />
      )}

      {showRemitoModal && pendingRemitoData && (
        <PackingSlipModal
          item={pendingRemitoData.item}
          amount={pendingRemitoData.amount}
          place={pendingRemitoData.place}
          personWhoTook={pendingRemitoData.personWhoTook}
          onClose={() => {
            setShowRemitoModal(false);
            setPendingRemitoData(null);
          }}
        />
      )}

      {showDeleteModal && selectedItem && (
        <DeleteItemModal
          itemId={selectedItem.id}
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onSuccess={refreshCurrentPage}
        />
      )}

      {itemModal.open && (
        <UpdateItemModal
          isOpen={itemModal.open}
          mode={itemModal.mode}
          itemId={itemModal.itemId}
          onClose={() => setItemModal({ open: false, mode: "create", itemId: null })}
          refreshItems={refreshCurrentPage}
        />
      )}

      <BulkImportModal
        isOpen={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={refreshCurrentPage}
      />

      <BulkUpdateModal
        isOpen={showBulkUpdateModal}
        onClose={() => setShowBulkUpdateModal(false)}
        onSuccess={() => {
          setSelectedById({});
          refreshCurrentPage();
        }}
      />

      <TransferExportModal
        isOpen={showTransferExportModal}
        items={transferExportItems}
        onClose={() => setShowTransferExportModal(false)}
      />

      <ItemImageModal
        isOpen={itemImageModal.open}
        mode={itemImageModal.mode}
        item={selectedItem}
        onClose={() => setItemImageModal({ open: false, mode: "upload" })}
        onSuccess={refreshCurrentPage}
      />
    </Dashboard>
  );
};

export default Items;
