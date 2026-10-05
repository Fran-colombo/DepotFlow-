import { useEffect, useState } from "react";
import {
  createSysadminRow,
  deleteSysadminRow,
  getSysadminRows,
  getSysadminTables,
  updateSysadminRow,
} from "../api/sysadmin";
import FeedbackModal from "../components/FeedbackModal";
import Dashboard from "./Dashboard";

const emptyDraft = (columns) => {
  const draft = {};
  columns.forEach((column) => {
    if (column.type === "boolean") draft[column.name] = false;
    else if (column.type === "enum") draft[column.name] = column.options?.[0] || "";
    else draft[column.name] = "";
  });
  return draft;
};

const SysadminPage = () => {
  const [tables, setTables] = useState([]);
  const [tableKey, setTableKey] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [confirmRow, setConfirmRow] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const table = tables.find((item) => item.key === tableKey);
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const loadRows = async (key, nextPage, nextQuery) => {
    if (!key) return;
    setLoading(true);
    try {
      const data = await getSysadminRows(key, { q: nextQuery, page: nextPage, page_size: pageSize });
      setRows(data.rows || []);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo cargar la tabla" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getSysadminTables()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setTables(list);
        if (list[0]) setTableKey(list[0].key);
        else setLoading(false);
      })
      .catch((err) => {
        setFeedback({ type: "error", message: err.message || "No se pudieron cargar las tablas" });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!tableKey) return;
    loadRows(tableKey, page, query);
  }, [tableKey, page]);

  const chooseTable = (key) => {
    setTableKey(key);
    setQuery("");
    setPage(1);
    setDraft(null);
    setDraftId(null);
  };

  const search = (event) => {
    event.preventDefault();
    setPage(1);
    loadRows(tableKey, 1, query);
  };

  const openCreate = () => {
    setDraftId(null);
    setDraft(emptyDraft(table?.columns || []));
  };

  const openEdit = (row) => {
    setDraftId(row.id);
    setDraft({ ...(row.values || {}) });
  };

  const setField = (name, value) => {
    setDraft((current) => ({ ...current, [name]: value }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!table) return;
    setSaving(true);
    const payload = {};
    table.columns.forEach((column) => {
      payload[column.name] = draft?.[column.name] ?? "";
    });
    try {
      if (draftId == null) {
        await createSysadminRow(table.key, payload);
        setFeedback({ type: "success", message: "Fila creada" });
      } else {
        await updateSysadminRow(table.key, draftId, payload);
        setFeedback({ type: "success", message: "Fila actualizada" });
      }
      setDraft(null);
      setDraftId(null);
      await loadRows(table.key, page, query);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmRow || !table) return;
    setSaving(true);
    try {
      await deleteSysadminRow(table.key, confirmRow.id);
      if (draftId === confirmRow.id) {
        setDraft(null);
        setDraftId(null);
      }
      setConfirmRow(null);
      setFeedback({ type: "success", message: "Fila borrada" });
      await loadRows(table.key, page, query);
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "No se pudo borrar" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dashboard title="Sysadmin">
      <p className="text-secondary">
        Corregí o borrá cualquier fila. Acá no se aplican las reglas del depósito. La contraseña y los tokens de Telegram no se editan.
      </p>
      <div className="row g-4">
        <div className="col-md-3">
          <div className="list-group">
            {tables.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`list-group-item list-group-item-action ${item.key === tableKey ? "active" : ""}`}
                onClick={() => chooseTable(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="col-md-9">
          <form className="d-flex gap-2 mb-3" onSubmit={search}>
            <input
              className="form-control"
              placeholder="Buscar por id o texto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="btn btn-outline-primary" type="submit">Buscar</button>
            <button className="btn btn-primary" type="button" onClick={openCreate} disabled={!table}>
              Nuevo
            </button>
          </form>
          {loading ? (
            <div className="text-secondary">Cargando...</div>
          ) : (
            <div className="table-responsive">
              <table className="table app-table mb-2">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Dato</th>
                    <th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-secondary">No hay filas.</td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.summary || "—"}</td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-outline-primary me-2" onClick={() => openEdit(row)}>
                          Editar
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmRow(row)}>
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="d-flex justify-content-between align-items-center">
            <span className="text-secondary small">{total} filas</span>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Anterior
              </button>
              <span className="small align-self-center">{page} / {pages}</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>

      {draft && table && (
        <div className="modal show d-block fade" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <form className="modal-content" onSubmit={save}>
              <div className="modal-header">
                <h5 className="modal-title mb-0">
                  {draftId == null ? "Nueva fila" : `Editar ${draftId}`} · {table.label}
                </h5>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setDraft(null)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  {table.columns.map((column) => (
                    <div className="col-md-6" key={column.name}>
                      <label className="form-label" htmlFor={`field-${column.name}`}>{column.label}</label>
                      {column.type === "boolean" ? (
                        <div className="form-check mt-2">
                          <input
                            id={`field-${column.name}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={Boolean(draft[column.name])}
                            onChange={(event) => setField(column.name, event.target.checked)}
                          />
                          <label className="form-check-label" htmlFor={`field-${column.name}`}>Sí</label>
                        </div>
                      ) : column.type === "enum" ? (
                        <select
                          id={`field-${column.name}`}
                          className="form-select"
                          value={draft[column.name] || ""}
                          onChange={(event) => setField(column.name, event.target.value)}
                        >
                          <option value="">—</option>
                          {(column.options || []).map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : column.type === "datetime" ? (
                        <input
                          id={`field-${column.name}`}
                          type="datetime-local"
                          className="form-control"
                          value={String(draft[column.name] || "").slice(0, 16)}
                          onChange={(event) => setField(column.name, event.target.value)}
                        />
                      ) : ["description", "damage_note", "repair_note", "deletion_reason"].includes(column.name) ? (
                        <textarea
                          id={`field-${column.name}`}
                          className="form-control"
                          rows="3"
                          value={draft[column.name] ?? ""}
                          onChange={(event) => setField(column.name, event.target.value)}
                        />
                      ) : (
                        <input
                          id={`field-${column.name}`}
                          type={column.type === "integer" ? "number" : "text"}
                          className="form-control"
                          value={draft[column.name] ?? ""}
                          onChange={(event) => setField(column.name, event.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setDraft(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmRow && (
        <div className="modal show d-block fade" tabIndex="-1" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1070 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title mb-0">Borrar fila {confirmRow.id}</h5>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setConfirmRow(null)}></button>
              </div>
              <div className="modal-body">
                Se borra {confirmRow.summary || "esta fila"} de {table?.label}. Si otras filas dependen de ella, se borran o se les saca el enlace.
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirmRow(null)}>Cancelar</button>
                <button type="button" className="btn btn-danger" disabled={saving} onClick={remove}>Borrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <FeedbackModal
        open={Boolean(feedback)}
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </Dashboard>
  );
};

export default SysadminPage;
