import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { getSheds } from "../api/sheds";
import { getZones, createZone, updateZone, deleteZone } from "../api/zones";

const ZonesPage = () => {
  const [sheds, setSheds] = useState([]);
  const [selectedShedId, setSelectedShedId] = useState("");
  const [zones, setZones] = useState([]);
  const [newZoneName, setNewZoneName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSheds = async () => {
      try {
        const data = await getSheds();
        setSheds(data);
        if (data.length > 0) {
          setSelectedShedId(String(data[0].id));
        }
      } catch (err) {
        console.error(err);
        setError("Error al cargar depósitos");
      }
    };
    loadSheds();
  }, []);

  const loadZones = async (shedId) => {
    if (!shedId) {
      setZones([]);
      return;
    }
    setIsLoading(true);
    setError("");
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
    loadZones(selectedShedId);
    setEditingId(null);
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

  const handleCreate = async (e) => {
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

  const handleStartEdit = (zone) => {
    setEditingId(zone.id);
    setEditingName(zone.name);
  };

  const handleSaveEdit = async (zoneId) => {
    if (!editingName.trim()) return;
    setIsLoading(true);
    try {
      await updateZone(zoneId, { name: editingName.trim() });
      setEditingId(null);
      setSuccess("Zona actualizada");
      await loadZones(selectedShedId);
    } catch (err) {
      setError(err.message || "Error al actualizar zona");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (zoneId) => {
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
    <Dashboard title="Administrar zonas">
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <label className="form-label fw-semibold">Depósito</label>
          <select
            className="form-select"
            value={selectedShedId}
            onChange={(e) => setSelectedShedId(e.target.value)}
          >
            {sheds.length === 0 && <option value="">Sin depósitos</option>}
            {sheds.map((shed) => (
              <option key={shed.id} value={shed.id}>
                {shed.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form className="row g-2 align-items-end mb-4" onSubmit={handleCreate}>
        <div className="col-md-6">
          <label className="form-label fw-semibold">Nueva zona</label>
          <input
            type="text"
            className="form-control"
            placeholder="Ej: Baños, Yesería..."
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            disabled={!selectedShedId || isLoading}
          />
        </div>
        <div className="col-md-3">
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={!selectedShedId || !newZoneName.trim() || isLoading}
          >
            Crear zona
          </button>
        </div>
      </form>

      {isLoading && zones.length === 0 ? (
        <div className="text-center my-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {zones.length === 0 ? (
                <tr>
                  <td colSpan="2" className="text-center text-muted py-4">
                    No hay zonas en este depósito
                  </td>
                </tr>
              ) : (
                zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      {editingId === zone.id ? (
                        <input
                          className="form-control"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                        />
                      ) : (
                        zone.name
                      )}
                    </td>
                    <td className="text-end">
                      {editingId === zone.id ? (
                        <div className="d-inline-flex gap-2">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleSaveEdit(zone.id)}
                            disabled={isLoading}
                          >
                            Guardar
                          </button>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setEditingId(null)}
                            disabled={isLoading}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="d-inline-flex gap-2">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleStartEdit(zone)}
                            disabled={isLoading}
                          >
                            Renombrar
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(zone.id)}
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
      )}
    </Dashboard>
  );
};

export default ZonesPage;
