import { useEffect, useState } from "react";
import { createCategory, getAdminCategories, updateCategory } from "../api/categories";
import Dashboard from "./Dashboard";

const emptyForm = { name: "", label: "", is_consumable: false };

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAdminCategories();
      setCategories(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar las categorías");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (category) => {
    setEditing(category.id);
    setForm({
      name: category.name,
      label: category.label,
      is_consumable: Boolean(category.is_consumable),
      active: category.active,
    });
    setError("");
  };

  const cancelEdit = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name.trim(),
        label: (form.label || form.name).trim(),
        is_consumable: Boolean(form.is_consumable),
        ...(editing != null ? { active: form.active !== false } : {}),
      };
      if (editing != null) {
        await updateCategory(editing, payload);
      } else {
        await createCategory(payload);
      }
      cancelEdit();
      await load();
    } catch (err) {
      setError(err.message || "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (category) => {
    setError("");
    try {
      await updateCategory(category.id, {
        name: category.name,
        label: category.label,
        is_consumable: category.is_consumable,
        active: !category.active,
      });
      await load();
    } catch (err) {
      setError(err.message || "No se pudo actualizar la categoría");
    }
  };

  return (
    <Dashboard title="Categorías">
      <p className="text-secondary">
        El nombre es el que queda en cada artículo. La etiqueta corta es la que se ve en los desplegables. Desactivar una categoría la saca de las altas nuevas y conserva los artículos que ya la usan.
      </p>

      <form onSubmit={handleSubmit} className="row g-3 align-items-end mb-4">
        <div className="col-md-4">
          <label className="form-label">Nombre</label>
          <input
            className="form-control"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="col-md-4">
          <label className="form-label">Etiqueta corta</label>
          <input
            className="form-control"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Si queda vacía, se usa el nombre"
          />
        </div>
        <div className="col-md-2">
          <div className="form-check mb-2">
            <input
              id="category-consumable"
              type="checkbox"
              className="form-check-input"
              checked={Boolean(form.is_consumable)}
              onChange={(e) => setForm({ ...form, is_consumable: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="category-consumable">
              No vuelve
            </label>
            <div className="form-text">Insumo, grifería, inodoro o bidet: al retirarlo queda usado.</div>
          </div>
        </div>
        <div className="col-md-2 d-flex gap-2">
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
                <th>Etiqueta</th>
                <th>Comportamiento</th>
                <th>Estado</th>
                <th className="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className={category.active ? "" : "text-secondary"}>
                  <td>{category.name}</td>
                  <td>{category.label}</td>
                  <td>{category.is_consumable ? "No espera devolución" : "Puede volver"}</td>
                  <td>{category.active ? "Activa" : "Inactiva"}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary me-2"
                      onClick={() => startEdit(category)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => toggleActive(category)}
                    >
                      {category.active ? "Desactivar" : "Activar"}
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

export default CategoriesPage;
