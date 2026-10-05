import { useEffect, useState } from "react";
import { createCategory, getAdminCategories, updateCategory } from "../api/categories";
import Dashboard from "./Dashboard";

const emptyForm = { name: "", label: "", is_consumable: false };

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [pendingToggle, setPendingToggle] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [popupError, setPopupError] = useState("");

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
    setEditing(category);
    setEditForm({
      name: category.name,
      label: category.label,
      is_consumable: Boolean(category.is_consumable),
      active: category.active,
    });
    setPopupError("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createCategory({
        name: form.name.trim(),
        label: (form.label || form.name).trim(),
        is_consumable: Boolean(form.is_consumable),
      });
      setForm(emptyForm);
      setFeedback("Categoría agregada");
      await load();
    } catch (err) {
      setError(err.message || "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setPopupError("");
    try {
      await updateCategory(editing.id, {
        name: editForm.name.trim(),
        label: (editForm.label || editForm.name).trim(),
        is_consumable: Boolean(editForm.is_consumable),
        active: editing.active !== false,
      });
      setEditing(null);
      setFeedback("Categoría actualizada");
      await load();
    } catch (err) {
      setPopupError(err.message || "No se pudo guardar la categoría");
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = async () => {
    const category = pendingToggle;
    if (!category) return;
    setSaving(true);
    setPopupError("");
    const nextActive = !category.active;
    try {
      await updateCategory(category.id, {
        name: category.name,
        label: category.label,
        is_consumable: category.is_consumable,
        active: nextActive,
      });
      setPendingToggle(null);
      setFeedback(nextActive ? `${category.name} quedó activa` : `${category.name} quedó desactivada`);
      await load();
    } catch (err) {
      setPopupError(err.message || "No se pudo actualizar la categoría");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dashboard title="Categorías">
      <p className="text-secondary">
        El nombre es el que queda en cada artículo. La etiqueta corta es la que se ve en los desplegables. Desactivar una categoría la saca de las altas nuevas y conserva los artículos que ya la usan.
      </p>

      <form onSubmit={handleCreate} className="row g-3 align-items-end mb-4">
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
        <div className="col-md-2">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            Agregar
          </button>
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
                      onClick={() => {
                        setPopupError("");
                        setPendingToggle(category);
                      }}
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

      {editing && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => !saving && setEditing(null)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <form className="modal-content rounded shadow-lg" onSubmit={handleEdit}>
              <div className="modal-header">
                <h5 className="modal-title mb-0">Editar categoría</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Cerrar"
                  disabled={saving}
                  onClick={() => setEditing(null)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Nombre</label>
                  <input
                    className="form-control"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Etiqueta corta</label>
                  <input
                    className="form-control"
                    value={editForm.label}
                    onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    placeholder="Si queda vacía, se usa el nombre"
                  />
                </div>
                <div className="form-check">
                  <input
                    id="edit-category-consumable"
                    type="checkbox"
                    className="form-check-input"
                    checked={Boolean(editForm.is_consumable)}
                    onChange={(e) => setEditForm({ ...editForm, is_consumable: e.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="edit-category-consumable">
                    No vuelve
                  </label>
                  <div className="form-text">Insumo, grifería, inodoro o bidet: al retirarlo queda usado.</div>
                </div>
                {popupError && <div className="alert alert-danger py-2 mt-3 mb-0">{popupError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingToggle && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}
          onClick={() => !saving && setPendingToggle(null)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded shadow-lg">
              <div className="modal-header">
                <h5 className="modal-title mb-0">
                  {pendingToggle.active ? "Desactivar" : "Activar"} {pendingToggle.name}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Cerrar"
                  disabled={saving}
                  onClick={() => setPendingToggle(null)}
                ></button>
              </div>
              <div className="modal-body">
                {pendingToggle.active
                  ? "Va a salir de las altas nuevas. Los artículos que ya la usan se conservan."
                  : "Va a volver a aparecer para las altas nuevas."}
                {popupError && <div className="alert alert-danger py-2 mt-3 mb-0">{popupError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setPendingToggle(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={confirmToggle}>
                  {pendingToggle.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1070 }}
          onClick={() => setFeedback("")}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded shadow-lg">
              <div className="modal-header">
                <h5 className="modal-title mb-0">Listo</h5>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setFeedback("")}></button>
              </div>
              <div className="modal-body">{feedback}</div>
              <div className="modal-footer">
                <button type="button" className="btn btn-primary" onClick={() => setFeedback("")}>
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dashboard>
  );
};

export default CategoriesPage;
