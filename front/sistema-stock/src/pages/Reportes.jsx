import { useEffect, useMemo, useState } from "react";
import {
  createReport,
  deleteReport,
  getReports,
  getReportSubcategories,
  sendReportNow,
  updateReport,
} from "../api/reports";
import FeedbackModal from "../components/FeedbackModal";
import Dashboard from "./Dashboard";

const emptyForm = {
  name: "Pendientes por obra",
  frequency: "monthly",
  combine: true,
  enabled: true,
  item_ids: [],
};

const formatLastSent = (value) => {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return date.toLocaleString("es-AR");
};

const ReportesPage = () => {
  const [reports, setReports] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [reportsRes, itemsRes] = await Promise.all([getReports(), getReportSubcategories()]);
      setReports(Array.isArray(reportsRes?.data) ? reportsRes.data : []);
      setSubcategories(Array.isArray(itemsRes?.data) ? itemsRes.data : []);
      return true;
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudieron cargar los reportes" });
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleItems = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return subcategories;
    return subcategories.filter((item) => (
      (item.name || "").toLowerCase().includes(needle)
      || (item.category || "").toLowerCase().includes(needle)
    ));
  }, [filter, subcategories]);

  const startEdit = (report) => {
    setEditingId(report.id);
    setForm({
      name: report.name || "",
      frequency: report.frequency || "monthly",
      combine: report.combine !== false,
      enabled: report.enabled !== false,
      item_ids: Array.isArray(report.item_ids) ? report.item_ids : [],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const toggleItem = (itemId) => {
    setForm((current) => {
      const selected = new Set(current.item_ids);
      if (selected.has(itemId)) selected.delete(itemId);
      else selected.add(itemId);
      return { ...current, item_ids: Array.from(selected) };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    const payload = {
      name,
      frequency: form.frequency,
      combine: form.combine,
      enabled: form.enabled,
      item_ids: form.item_ids,
    };
    try {
      if (editingId != null) {
        await updateReport(editingId, payload);
        setFeedback({ type: "success", message: "Reporte actualizado" });
      } else {
        await createReport(payload);
        setFeedback({ type: "success", message: "Reporte creado" });
      }
      cancelEdit();
      await load({ silent: true });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async (report) => {
    setSendingId(report.id);
    try {
      const result = await sendReportNow(report.id);
      const count = result?.sent ?? 0;
      setFeedback({
        type: "success",
        message: count ? `Se enviaron ${count} mail${count === 1 ? "" : "s"}` : "No había pendientes para enviar",
      });
      await load({ silent: true });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo enviar" });
    } finally {
      setSendingId(null);
    }
  };

  const remove = async (report) => {
    if (!window.confirm(`¿Borrar el reporte ${report.name}?`)) return;
    try {
      await deleteReport(report.id);
      if (editingId === report.id) cancelEdit();
      await load({ silent: true });
      setFeedback({ type: "success", message: "Reporte borrado" });
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo borrar" });
    }
  };

  const allSelected = form.item_ids.length === 0;

  return (
    <Dashboard title="Reportes">
      <p className="text-secondary">
        El mail mensual agrupa lo que sigue afuera por obra, subcategoría y nombre o código.
        Podés armar más reportes, elegir subcategorías y si va todo en un mail o uno por subcategoría.
        El SMTP sigue en el .env.
      </p>

      <form onSubmit={handleSubmit} className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Nombre</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Frecuencia</label>
              <select
                className="form-select"
                value={form.frequency}
                onChange={(event) => setForm({ ...form, frequency: event.target.value })}
              >
                <option value="monthly">Mensual (día 1)</option>
                <option value="weekly">Semanal (lunes)</option>
              </select>
            </div>
            <div className="col-md-3 d-flex flex-column justify-content-end gap-2">
              <label className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={form.combine}
                  onChange={(event) => setForm({ ...form, combine: event.target.checked })}
                />
                <span className="form-check-label">Un solo mail</span>
              </label>
              <label className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={form.enabled}
                  onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
                />
                <span className="form-check-label">Activo</span>
              </label>
            </div>
          </div>

          <div className="mt-3">
            <div className="d-flex flex-wrap justify-content-between gap-2 align-items-end mb-2">
              <label className="form-label mb-0">Subcategorías</label>
              <input
                className="form-control form-control-sm"
                style={{ maxWidth: 280 }}
                placeholder="Filtrar"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <div className="form-text mb-2">
              {allSelected ? "Todas. Si marcás alguna, el reporte queda solo para esas." : `${form.item_ids.length} elegidas`}
            </div>
            <div className="border rounded p-2" style={{ maxHeight: 240, overflowY: "auto" }}>
              {visibleItems.length === 0 ? (
                <div className="app-muted small">No hay subcategorías con ese filtro.</div>
              ) : visibleItems.map((item) => (
                <label key={item.id} className="form-check mb-1">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={form.item_ids.includes(item.id)}
                    onChange={() => toggleItem(item.id)}
                  />
                  <span className="form-check-label">
                    {item.name}
                    {item.category ? <span className="app-muted"> · {item.category}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="d-flex gap-2 mt-3">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {editingId != null ? "Guardar" : "Crear reporte"}
            </button>
            {editingId != null && (
              <button className="btn btn-outline-secondary" type="button" onClick={cancelEdit}>
                Cancelar
              </button>
            )}
          </div>
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
      ) : reports.length === 0 ? (
        <div className="app-empty">No hay reportes.</div>
      ) : (
        <>
          <div className="d-md-none app-card-list">
            {reports.map((report) => (
              <div key={report.id} className="app-mobile-card">
                <div className="fw-semibold">{report.name}</div>
                <div className="app-muted small mb-2">
                  {report.frequency === "weekly" ? "Semanal" : "Mensual"}
                  {" · "}
                  {report.combine ? "Un mail" : "Uno por subcategoría"}
                  {" · "}
                  {report.enabled ? "Activo" : "Apagado"}
                </div>
                <div className="small mb-2">Último envío: {formatLastSent(report.last_sent)}</div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => startEdit(report)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={sendingId === report.id}
                    onClick={() => sendNow(report)}
                  >
                    Enviar ahora
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(report)}>
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="table-responsive d-none d-md-block">
            <table className="table app-table mb-0">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Frecuencia</th>
                  <th>Mails</th>
                  <th>Subcategorías</th>
                  <th>Último envío</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className={report.enabled ? "" : "text-secondary"}>
                    <td>{report.name}</td>
                    <td>{report.frequency === "weekly" ? "Semanal" : "Mensual"}</td>
                    <td>{report.combine ? "Uno solo" : "Por subcategoría"}</td>
                    <td>{report.item_ids?.length ? report.item_ids.length : "Todas"}</td>
                    <td>{formatLastSent(report.last_sent)}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-primary me-2" onClick={() => startEdit(report)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary me-2"
                        disabled={sendingId === report.id}
                        onClick={() => sendNow(report)}
                      >
                        Enviar ahora
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(report)}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Dashboard>
  );
};

export default ReportesPage;
