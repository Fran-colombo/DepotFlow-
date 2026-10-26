import { useEffect, useMemo, useState } from "react";
import { devolverItem, retirarItem, trasladarItem } from "../api/items";
import { getExistencias, getLugares, openExistenciasPdf } from "../api/existencias";
import { moveItem } from "../api/movements";
import { getZones } from "../api/zones";
import PersonPicker from "../components/PersonPicker";
import useAuth from "../hooks/useAuth";
import Dashboard from "./Dashboard";
import NumberInput from "../components/NumberInput";

const rowKey = (row) => `${row.itemId}:${row.code || ""}:${row.description || ""}`;

const fold = (value) => (value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const Existencias = () => {
  const { email } = useAuth();
  const [lugares, setLugares] = useState({ obras: [], depositos: [] });
  const [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("");
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState([]);
  const [action, setAction] = useState(null);
  const [destination, setDestination] = useState("");
  const [person, setPerson] = useState("");
  const [zones, setZones] = useState([]);
  const [saving, setSaving] = useState(false);
  const [amounts, setAmounts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLugares()
      .then((data) => {
        if (!cancelled) {
          setLugares({
            obras: Array.isArray(data?.obras) ? data.obras : [],
            depositos: Array.isArray(data?.depositos) ? data.depositos : [],
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se pudieron cargar los lugares");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selection.startsWith("deposito:")) {
      setZones([]);
      return undefined;
    }
    const id = Number(selection.split(":")[1]);
    let cancelled = false;
    getZones(id)
      .then((data) => {
        if (!cancelled) setZones(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setZones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  useEffect(() => {
    if (!selection) {
      setStock(null);
      return undefined;
    }
    const [kind, rawId] = selection.split(":");
    const id = Number(rawId);
    if (!kind || !id) return undefined;
    let cancelled = false;
    setStock(null);
    setLoading(true);
    setError("");
    getExistencias(kind, id)
      .then((data) => {
        if (!cancelled) setStock(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setStock(null);
          setError(err.message || "No se pudo cargar el lugar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection, reloadKey]);

  const rows = useMemo(() => {
    const source = Array.isArray(stock?.rows) ? stock.rows : [];
    const term = fold(filter.trim());
    if (!term) return source;
    return source.filter((row) =>
      fold([row.code, row.description, row.people, row.zone].join(" ")).includes(term)
    );
  }, [stock, filter]);

  const kind = selection.startsWith("deposito:") ? "deposito" : "obra";
  const visibleKeys = rows.map(rowKey);
  const selectedRows = rows.filter((row) => selected.includes(rowKey(row)));
  const allVisible = rows.length > 0 && selectedRows.length === rows.length;

  const toggleRow = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisible) return prev.filter((key) => !visibleKeys.includes(key));
      return [...new Set([...prev, ...visibleKeys])];
    });
  };

  const asksQuantity = (row, nextAction) => row.quantity > 1 && !(nextAction === "zona" && row.code);

  const openAction = (next) => {
    const initial = {};
    selectedRows.forEach((row) => {
      if (asksQuantity(row, next)) initial[rowKey(row)] = String(row.quantity);
    });
    setAmounts(initial);
    setDestination("");
    setPerson("");
    setError("");
    setAction(next);
  };

  const generar = async () => {
    if (!selection || printing) return;
    const [placeKind, rawId] = selection.split(":");
    setPrinting(true);
    setError("");
    try {
      await openExistenciasPdf(placeKind, Number(rawId));
    } catch (err) {
      setError(err.message || "No se pudo generar la hoja");
    } finally {
      setPrinting(false);
    }
  };

  const applyAction = async () => {
    if (!action || saving || selectedRows.length === 0) return;
    const who = person.trim();
    if (action !== "zona" && !who) {
      setError(action === "devolver" ? "Indicá quién lo devuelve" : action === "retirar" ? "Indicá quién lo retira" : "Indicá quién lo mueve");
      return;
    }
    if ((action === "trasladar" || action === "retirar" || action === "zona") && !destination) {
      setError(action === "zona" ? "Elegí la zona" : "Elegí la obra");
      return;
    }
    const shedId = Number(selection.split(":")[1]);
    const ordered = [...selectedRows].sort((a, b) => (a.code ? 0 : 1) - (b.code ? 0 : 1));
    const chosen = new Map();
    for (const row of ordered) {
      if (!asksQuantity(row, action)) {
        chosen.set(rowKey(row), action === "zona" && row.code ? 1 : row.quantity);
        continue;
      }
      const typed = parseInt(amounts[rowKey(row)], 10);
      if (Number.isNaN(typed) || typed < 1 || typed > row.quantity) {
        setError(`La cantidad de ${row.code || row.description} tiene que estar entre 1 y ${row.quantity}`);
        return;
      }
      chosen.set(rowKey(row), typed);
    }
    setSaving(true);
    setError("");
    const failed = [];
    for (const row of ordered) {
      const label = row.code || row.description || "una pieza";
      const amount = chosen.get(rowKey(row));
      try {
        if (action === "trasladar") {
          await trasladarItem({
            itemId: row.itemId,
            amount,
            fromPlace: stock.place,
            toPlace: destination,
            personWhoMoved: who,
            ...(row.code ? { code: row.code } : {}),
          });
        } else if (action === "devolver") {
          await devolverItem({
            itemId: row.itemId,
            amount,
            place: stock.place,
            personWhoReturned: who,
            ...(row.code ? { codes: [row.code] } : {}),
          });
        } else if (action === "retirar") {
          await retirarItem({
            itemId: row.itemId,
            amount,
            place: destination,
            personWhoTook: who,
            ...(row.code ? { codes: [row.code] } : {}),
          });
        } else {
          await moveItem({
            item_id: row.itemId,
            from_shed_id: row.shedId || shedId,
            to_shed_id: row.shedId || shedId,
            from_zone_id: row.zoneId || null,
            to_zone_id: Number(destination),
            quantity: amount,
            username: email || "usuario",
            ...(row.code ? { codes: [row.code] } : {}),
          });
        }
      } catch (err) {
        failed.push(`${label}: ${err.message || "no se pudo"}`);
      }
    }
    setSaving(false);
    setAction(null);
    setSelected([]);
    setReloadKey((value) => value + 1);
    const moved = ordered.length - failed.length;
    if (failed.length === 0) {
      const message = action === "devolver"
        ? "Se devolvieron al depósito."
        : action === "retirar"
          ? "Se retiraron."
          : action === "zona"
            ? "Se movieron de zona."
            : "Se trasladaron.";
      setNotice({ type: "success", message });
      return;
    }
    setNotice({
      type: "error",
      message: moved > 0
        ? `Se movieron ${moved}. No se pudo: ${failed.join(" · ")}`
        : `No se pudo: ${failed.join(" · ")}`,
    });
  };

  const destinationObras = lugares.obras.filter((obra) => obra.name !== stock?.place);

  return (
    <Dashboard title="Existencias">
      <p className="text-secondary">
        Lo que hay ahora en una obra o en un depósito. Se pueden tildar las piezas para trasladarlas, devolverlas o retirarlas.
      </p>
      <div className="row g-3 align-items-end mb-4">
        <div className="col-md-5">
          <label className="form-label" htmlFor="existencias-lugar">Lugar</label>
          <select
            id="existencias-lugar"
            className="form-select"
            value={selection}
            onChange={(event) => {
              setSelection(event.target.value);
              setFilter("");
              setSelected([]);
              setNotice(null);
            }}
          >
            <option value="">Elegir</option>
            <optgroup label="Obras">
              {lugares.obras.map((obra) => (
                <option key={`obra-${obra.id}`} value={`obra:${obra.id}`}>{obra.name}</option>
              ))}
            </optgroup>
            <optgroup label="Depósitos">
              {lugares.depositos.map((shed) => (
                <option key={`deposito-${shed.id}`} value={`deposito:${shed.id}`}>{shed.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label" htmlFor="existencias-filtro">Buscar</label>
          <input
            id="existencias-filtro"
            className="form-control"
            placeholder="Código o nombre"
            value={filter}
            disabled={!selection}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <div className="col-md-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selection || loading || printing || !stock || stock.rows.length === 0}
            onClick={generar}
          >
            {printing ? "Generando…" : "Generar hoja"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {notice && (
        <div className={`alert ${notice.type === "success" ? "alert-success" : "alert-warning"}`}>
          {notice.message}
        </div>
      )}

      {!selection ? (
        <p className="app-muted mb-0">Elegí una obra o un depósito.</p>
      ) : loading ? (
        <p className="app-muted mb-0">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="app-muted mb-0">
          {filter.trim() ? "Nada coincide con esa búsqueda." : "No hay nada en este lugar."}
        </p>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {kind === "obra" ? (
              <>
                <button type="button" className="btn btn-info text-white" disabled={selectedRows.length === 0} onClick={() => openAction("trasladar")}>
                  Trasladar
                </button>
                <button type="button" className="btn btn-success" disabled={selectedRows.length === 0} onClick={() => openAction("devolver")}>
                  Devolver
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-info text-white" disabled={selectedRows.length === 0} onClick={() => openAction("zona")}>
                  Trasladar
                </button>
                <button type="button" className="btn btn-danger" disabled={selectedRows.length === 0} onClick={() => openAction("retirar")}>
                  Retirar
                </button>
              </>
            )}
            <span className="align-self-center text-secondary small">
              {selectedRows.length > 0 ? `${selectedRows.length} seleccionadas` : "Nada seleccionado"}
            </span>
          </div>
          <div className="table-responsive">
            <table className="table app-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={allVisible}
                      onChange={toggleAll}
                      aria-label="Seleccionar todo"
                    />
                  </th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  {kind === "obra" ? <th>Quién lo tiene</th> : <th>Zona</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = rowKey(row);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selected.includes(key)}
                          onChange={() => toggleRow(key)}
                          aria-label={`Seleccionar ${row.code || row.description}`}
                        />
                      </td>
                      <td>{row.code || "—"}</td>
                      <td>{row.description || "—"}</td>
                      <td>{row.quantity}</td>
                      <td>{kind === "obra" ? (row.people || "—") : (row.zone || "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {action && (
        <div
          className="modal show d-block fade"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1070 }}
          onClick={() => { if (!saving) setAction(null); }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(event) => event.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {action === "trasladar" && `Trasladar desde ${stock?.place || "la obra"}`}
                  {action === "devolver" && "Devolver al depósito"}
                  {action === "zona" && "Trasladar dentro del galpón"}
                  {action === "retirar" && "Retirar"}
                </h5>
                <button type="button" className="btn-close" disabled={saving} onClick={() => setAction(null)} aria-label="Cerrar"></button>
              </div>
              <div className="modal-body">
                <p className="text-secondary">{selectedRows.length} piezas.</p>
                {selectedRows.some((row) => asksQuantity(row, action)) && (
                  <div className="mb-3">
                    <label className="form-label">Cantidad</label>
                    {selectedRows.filter((row) => asksQuantity(row, action)).map((row) => (
                      <div className="d-flex align-items-center gap-2 mb-2" key={rowKey(row)}>
                        <span className="flex-grow-1">{row.code || row.description}</span>
                        <NumberInput
                          min="1"
                          max={row.quantity}
                          className="form-control"
                          style={{ width: 90 }}
                          value={amounts[rowKey(row)] ?? ""}
                          onChange={(event) => setAmounts((prev) => ({ ...prev, [rowKey(row)]: event.target.value }))}
                        />
                        <span className="text-secondary small">de {row.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(action === "trasladar" || action === "retirar") && (
                  <div className="mb-3">
                    <label className="form-label">Obra</label>
                    <select className="form-select" value={destination} onChange={(event) => setDestination(event.target.value)}>
                      <option value="">Elegir</option>
                      {(action === "trasladar" ? destinationObras : lugares.obras).map((obra) => (
                        <option key={obra.id} value={obra.name}>{obra.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {action === "zona" && (
                  <div className="mb-3">
                    <label className="form-label">Zona</label>
                    <select className="form-select" value={destination} onChange={(event) => setDestination(event.target.value)}>
                      <option value="">Elegir</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {action !== "zona" && (
                  <div className="mb-3">
                    <label className="form-label">
                      {action === "devolver" ? "Quién lo devuelve" : action === "retirar" ? "Quién lo retira" : "Quién lo mueve"}
                    </label>
                    <PersonPicker value={person} onChange={setPerson} disabled={saving} />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" disabled={saving} onClick={() => setAction(null)}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={applyAction}>
                  {saving ? "Moviendo…" : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Dashboard>
  );
};

export default Existencias;
