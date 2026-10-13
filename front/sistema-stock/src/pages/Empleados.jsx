import { useEffect, useState } from "react";
import { createEmpleado, getAdminEmpleados, updateEmpleado } from "../api/empleados";
import FeedbackModal from "../components/FeedbackModal";
import Dashboard from "./Dashboard";

const EmpleadosPage = () => {
  const [empleados, setEmpleados] = useState([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await getAdminEmpleados();
      setEmpleados(Array.isArray(data) ? data : []);
      return true;
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudieron cargar los empleados" });
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (row) => {
    setEditing(row.id);
    setName(row.name);
  };

  const cancelEdit = () => {
    setEditing(null);
    setName("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (editing != null) {
        const current = empleados.find((row) => row.id === editing);
        await updateEmpleado(editing, { name: trimmed, active: current ? current.active : true });
        setFeedback({ type: "success", message: "Se guardó el empleado." });
      } else {
        await createEmpleado({ name: trimmed, active: true });
        setFeedback({ type: "success", message: "Se agregó el empleado." });
      }
      setName("");
      setEditing(null);
      await load({ silent: true });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    setSavingId(row.id);
    try {
      await updateEmpleado(row.id, { name: row.name, active: !row.active });
      setFeedback({
        type: "success",
        message: row.active ? `${row.name} quedó inactivo` : `${row.name} quedó activo`,
      });
      await load({ silent: true });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo cambiar el estado" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dashboard title="Empleados">
      <p className="text-secondary">
        Estas personas aparecen al retirar o devolver. Si no está en la lista, se elige Otros y se escribe el nombre.
      </p>
      <form onSubmit={handleSubmit} className="row g-3 align-items-end mb-4">
        <div className="col-md-6">
          <label className="form-label">Nombre</label>
          <input
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="col-md-6 d-flex gap-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {editing != null ? "Guardar" : "Agregar"}
          </button>
          {editing != null && (
            <button className="btn btn-outline-secondary" type="button" onClick={cancelEdit}>
              Cancelar
            </button>
          )}
        </div>
      </form>
      <FeedbackModal
        open={Boolean(feedback)}
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
      {loading ? (
        <div className="text-secondary">Cargando...</div>
      ) : (
        <div className="table-responsive">
          <table className="table app-table mb-0">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Activo</th>
                <th className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((row) => (
                <tr key={row.id} className={row.active ? "" : "text-secondary"}>
                  <td>{row.name}</td>
                  <td>{row.active ? "Sí" : "No"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary me-2"
                      onClick={() => startEdit(row)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      disabled={savingId === row.id}
                      onClick={() => toggleActive(row)}
                    >
                      {row.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dashboard>
  );
};

export default EmpleadosPage;
