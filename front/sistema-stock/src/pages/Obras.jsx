import { useEffect, useState } from "react";
import { createObra, getAdminObras, updateObra } from "../api/obras";
import Dashboard from "./Dashboard";

const ObrasPage = () => {
  const [obras, setObras] = useState([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAdminObras();
      setObras(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar las obras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (obra) => {
    setEditing(obra.id);
    setName(obra.name);
    setError("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setName("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editing != null) {
        const current = obras.find((obra) => obra.id === editing);
        await updateObra(editing, { name: name.trim(), active: current?.active !== false });
      } else {
        await createObra({ name: name.trim() });
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || "No se pudo guardar la obra");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dashboard title="Obras">
      <p className="text-secondary">
        Estas son las obras a las que se retira. Al cambiar el nombre, el historial queda con el nombre nuevo.
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
        <div className="col-md-4 d-flex gap-2">
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
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? (
        <div className="text-secondary">Cargando...</div>
      ) : (
        <div className="table-responsive">
          <table className="table app-table mb-0">
            <thead>
              <tr>
                <th>Nombre</th>
                <th className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((obra) => (
                <tr key={obra.id}>
                  <td>{obra.name}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => startEdit(obra)}
                    >
                      Editar
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

export default ObrasPage;
