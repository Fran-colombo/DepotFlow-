import { useEffect, useMemo, useState } from "react";
import { getExistencias, getLugares, openExistenciasPdf } from "../api/existencias";
import Dashboard from "./Dashboard";

const Existencias = () => {
  const [lugares, setLugares] = useState({ obras: [], depositos: [] });
  const [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("");
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");

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
  }, [selection]);

  const rows = useMemo(() => {
    const source = Array.isArray(stock?.rows) ? stock.rows : [];
    const term = filter.trim().toLowerCase();
    if (!term) return source;
    return source.filter((row) =>
      [row.code, row.description, row.people, row.zone]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [stock, filter]);

  const kind = selection.startsWith("deposito:") ? "deposito" : "obra";

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

  return (
    <Dashboard title="Existencias">
      <p className="text-secondary">
        Lo que hay ahora en una obra o en un depósito. La hoja trae una casilla vacía para chequearlo en el lugar.
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

      {!selection ? (
        <p className="app-muted mb-0">Elegí una obra o un depósito.</p>
      ) : loading ? (
        <p className="app-muted mb-0">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="app-muted mb-0">
          {filter.trim() ? "Nada coincide con esa búsqueda." : "No hay nada en este lugar."}
        </p>
      ) : (
        <div className="table-responsive">
          <table className="table app-table mb-0">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Cantidad</th>
                {kind === "obra" ? <th>Quién lo tiene</th> : <th>Zona</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.code}-${row.description}-${index}`}>
                  <td>{row.code || "—"}</td>
                  <td>{row.description || "—"}</td>
                  <td>{row.quantity}</td>
                  <td>{kind === "obra" ? (row.people || "—") : (row.zone || "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dashboard>
  );
};

export default Existencias;
