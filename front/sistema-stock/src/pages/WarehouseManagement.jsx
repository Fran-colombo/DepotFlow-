import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { getSheds, createShed, updateShed, deleteShed } from "../api/sheds";
import { getZones, createZone, updateZone, deleteZone } from "../api/zones";

const WarehouseManagement = () => {
  const [sheds, setSheds] = useState([]);
  const [selectedShedId, setSelectedShedId] = useState("");
  const [zones, setZones] = useState([]);
  const [newShedName, setNewShedName] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [editingShedId, setEditingShedId] = useState(null);
  const [editingShedName, setEditingShedName] = useState("");
  const [editingZoneId, setEditingZoneId] = useState(null);
  const [editingZoneName, setEditingZoneName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const selectedShed = sheds.find((s) => String(s.id) === String(selectedShedId));

  const loadSheds = async (preferId) => {
    setIsLoading(true);
    try {
      const data = await getSheds();
      setSheds(data);
      const nextId = preferId
        ? String(preferId)
        : data.some((s) => String(s.id) === String(selectedShedId))
          ? String(selectedShedId)
          : data[0]
            ? String(data[0].id)
            : "";
      setSelectedShedId(nextId);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al cargar depósitos");
      setSheds([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadZones = async (shedId) => {
    if (!shedId) {
      setZones([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getZones(shedId);
      setZones(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Error al cargar zonas");
      setZones([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSheds();
  }, []);

  useEffect(() => {
    loadZones(selectedShedId);
    setEditingZoneId(null);
    setNewZoneName("");
  }, [selectedShedId]);

  useEffect(() => {
    if (!error && !success) return;
    const t = setTimeout(() => {
      setError("");
      setSuccess("");
    }, 4000);
    return () => clearTimeout(t);
  }, [error, success]);

  const handleCreateShed = async (e) => {
    e.preventDefault();
    if (!newShedName.trim()) return;
    setIsLoading(true);
    try {
      const created = await createShed({ name: newShedName.trim() });
      setNewShedName("");
      setSuccess("Depósito creado");
      await loadSheds(created.id);
    } catch (err) {
      setError(err.message || "Error al crear depósito");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveShed = async (shedId) => {
    if (!editingShedName.trim()) return;
    setIsLoading(true);
    try {
      await updateShed(shedId, { name: editingShedName.trim() });
      setEditingShedId(null);
      setSuccess("Depósito actualizado");
      await loadSheds(shedId);
    } catch (err) {
      setError(err.message || "Error al actualizar depósito");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteShed = async (shedId) => {
    if (!window.confirm("¿Eliminar este depósito? Debe estar vacío (sin zonas ni ítems activos).")) {
      return;
    }
    setIsLoading(true);
    try {
      await deleteShed(shedId);
      setSuccess("Depósito eliminado");
      await loadSheds();
    } catch (err) {
      setError(err.message || "Error al eliminar depósito");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!newZoneName.trim() || !selectedShedId) return;
    setIsLoading(true);
    try {
      await createZone({ name: newZoneName.trim(), shed_id: Number(selectedShedId) });
      setNewZoneName("");
      setSuccess("Zona creada");
      await loadZones(selectedShedId);
    } catch (err) {
      setError(err.message || "Error al crear zona");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveZone = async (zoneId) => {
    if (!editingZoneName.trim()) return;
    setIsLoading(true);
    try {
      await updateZone(zoneId, { name: editingZoneName.trim() });
      setEditingZoneId(null);
      setSuccess("Zona actualizada");
      await loadZones(selectedShedId);
    } catch (err) {
      setError(err.message || "Error al actualizar zona");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm("¿Eliminar esta zona? Solo es posible si no tiene ítems activos.")) {
      return;
    }
    setIsLoading(true);
    try {
      await deleteZone(zoneId);
      setSuccess("Zona eliminada");
      await loadZones(selectedShedId);
    } catch (err) {
      setError(err.message || "Error al eliminar zona");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dashboard title="Gestión de depósitos">
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {success && <div className="alert alert-success py-2">{success}</div>}

      <p className="app-muted mb-4">
        Administrá depósitos (galpones) y las zonas dentro de cada uno.
      </p>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-semibold mb-0 text-uppercase app-muted">Depósitos</h2>
          </div>

          <form className="d-flex gap-2 mb-3" onSubmit={handleCreateShed}>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Nuevo depósito..."
              value={newShedName}
              onChange={(e) => setNewShedName(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="btn btn-sm btn-primary text-nowrap"
              disabled={!newShedName.trim() || isLoading}
            >
              Crear
            </button>
          </form>

          <div className="list-group app-warehouse-list shadow-sm">
            {sheds.length === 0 ? (
              <div className="list-group-item text-muted small">No hay depósitos</div>
            ) : (
              sheds.map((shed) => (
                <div
                  key={shed.id}
                  className={`list-group-item ${
                    String(shed.id) === String(selectedShedId) ? "active" : ""
                  }`}
                  onClick={() => setSelectedShedId(String(shed.id))}
                >
                  {editingShedId === shed.id ? (
                    <div className="d-flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="form-control form-control-sm"
                        value={editingShedName}
                        onChange={(e) => setEditingShedName(e.target.value)}
                      />
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleSaveShed(shed.id)}
                        disabled={isLoading}
                      >
                        Guardar
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setEditingShedId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="d-flex justify-content-between align-items-center gap-2">
                      <span>{shed.name}</span>
                      <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            setEditingShedId(shed.id);
                            setEditingShedName(shed.name);
                          }}
                          disabled={isLoading}
                        >
                          Renombrar
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteShed(shed.id)}
                          disabled={isLoading}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="col-lg-7">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-semibold mb-0 text-uppercase app-muted">
              Zonas {selectedShed ? `· ${selectedShed.name}` : ""}
            </h2>
          </div>

          {!selectedShedId ? (
            <div className="text-muted small py-4">Seleccioná un depósito para ver sus zonas</div>
          ) : (
            <>
              <form className="d-flex gap-2 mb-3" onSubmit={handleCreateZone}>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Nueva zona (ej: Baños, Yesería)..."
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  className="btn btn-sm btn-primary text-nowrap"
                  disabled={!newZoneName.trim() || isLoading}
                >
                  Crear
                </button>
              </form>

              <div className="table-responsive">
                <table className="table app-table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th className="text-end">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.length === 0 ? (
                      <tr>
                        <td colSpan="2" className="text-center text-muted py-4">
                          Este depósito no tiene zonas
                        </td>
                      </tr>
                    ) : (
                      zones.map((zone) => (
                        <tr key={zone.id}>
                          <td>
                            {editingZoneId === zone.id ? (
                              <input
                                className="form-control form-control-sm"
                                value={editingZoneName}
                                onChange={(e) => setEditingZoneName(e.target.value)}
                              />
                            ) : (
                              zone.name
                            )}
                          </td>
                          <td className="text-end">
                            {editingZoneId === zone.id ? (
                              <div className="d-inline-flex gap-2">
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleSaveZone(zone.id)}
                                  disabled={isLoading}
                                >
                                  Guardar
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => setEditingZoneId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="d-inline-flex gap-2">
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => {
                                    setEditingZoneId(zone.id);
                                    setEditingZoneName(zone.name);
                                  }}
                                  disabled={isLoading}
                                >
                                  Renombrar
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => handleDeleteZone(zone.id)}
                                  disabled={isLoading}
                                >
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </Dashboard>
  );
};

export default WarehouseManagement;
