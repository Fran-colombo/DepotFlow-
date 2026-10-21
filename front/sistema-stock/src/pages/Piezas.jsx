import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { exportPieces, getItemById, getPiecePlaces, getUnitImageUrl, searchPieces } from "../api/items";
import { getCategories } from "../api/categories";
import { getSheds } from "../api/sheds";
import ItemDetailModal from "../components/ItemDetailModal";

const SITUATIONS = [
  ["", "Todas"],
  ["en_deposito", "En depósito"],
  ["fuera", "Fuera del depósito"],
  ["en_obra", "En obra"],
  ["fuera_de_servicio", "Fuera de servicio"],
  ["usadas", "Usadas"],
  ["con_stock", "Con stock"],
  ["sin_stock", "Sin stock"],
];

const Piezas = () => {
  const [query, setQuery] = useState("");
  const [broken, setBroken] = useState(false);
  const [withoutImage, setWithoutImage] = useState(false);
  const [situation, setSituation] = useState("");
  const [obra, setObra] = useState("");
  const [category, setCategory] = useState("");
  const [shedId, setShedId] = useState("");
  const [places, setPlaces] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sheds, setSheds] = useState([]);
  const [revision, setRevision] = useState(0);
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const filters = { broken, withoutImage, situation, obra, category, shedId };
  const filtering = Boolean(query.trim() || broken || withoutImage || situation || obra || category || shedId);
  const canExport = filtering;

  useEffect(() => {
    getPiecePlaces()
      .then((res) => setPlaces(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setPlaces([]));
    getCategories()
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
    getSheds()
      .then((data) => setSheds(Array.isArray(data) ? data : []))
      .catch(() => setSheds([]));
  }, []);

  const download = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    setError("");
    try {
      await exportPieces(query, filters);
    } catch (err) {
      setError(err.message || "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchPieces(query, { broken, withoutImage, situation, obra, category, shedId })
        .then((res) => {
          if (!cancelled) setPieces(Array.isArray(res?.data) ? res.data : []);
        })
        .catch((err) => {
          if (!cancelled) {
            setPieces([]);
            setError(err.message || "No se pudieron cargar las piezas");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, broken, withoutImage, situation, obra, category, shedId, revision]);

  const openPiece = async (piece) => {
    setError("");
    try {
      const res = await getItemById(piece.item_id);
      setDetail({ item: res.item, code: piece.code });
    } catch (err) {
      setError(err.message || "No se pudo abrir la pieza");
    }
  };

  const clearError = () => setError("");

  return (
    <Dashboard title="Piezas">
      <div className="mb-4">
        <label className="form-label" htmlFor="piece-filter">Buscar</label>
        <input
          id="piece-filter"
          className="form-control"
          placeholder="Código, nombre, parecido o sinónimo"
          value={query}
          onChange={(e) => {
            clearError();
            setQuery(e.target.value);
          }}
        />
        <div className="row g-2 mt-2">
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="pieces-situation">Situación</label>
            <select
              id="pieces-situation"
              className="form-select"
              value={situation}
              onChange={(e) => {
                clearError();
                setSituation(e.target.value);
              }}
            >
              {SITUATIONS.map(([value, label]) => (
                <option key={value || "todas"} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="pieces-obra">Obra</label>
            <select
              id="pieces-obra"
              className="form-select"
              value={obra}
              onChange={(e) => {
                clearError();
                setObra(e.target.value);
              }}
            >
              <option value="">Todas</option>
              {places.map((place) => (
                <option key={place.name} value={place.name}>{place.name}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="pieces-category">Categoría</label>
            <select
              id="pieces-category"
              className="form-select"
              value={category}
              onChange={(e) => {
                clearError();
                setCategory(e.target.value);
              }}
            >
              <option value="">Todas</option>
              {categories.map((row) => (
                <option key={row.id} value={row.name}>{row.label || row.name}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-sm-6 col-lg-3">
            <label className="form-label" htmlFor="pieces-shed">Depósito</label>
            <select
              id="pieces-shed"
              className="form-select"
              value={shedId}
              onChange={(e) => {
                clearError();
                setShedId(e.target.value);
              }}
            >
              <option value="">Todos</option>
              {sheds.map((shed) => (
                <option key={shed.id} value={shed.id}>{shed.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-3 mt-3 align-items-center">
          <div className="form-check mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="pieces-broken"
              checked={broken}
              onChange={(e) => {
                clearError();
                setBroken(e.target.checked);
              }}
            />
            <label className="form-check-label" htmlFor="pieces-broken">Rotas</label>
          </div>
          <div className="form-check mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="pieces-no-photo"
              checked={withoutImage}
              onChange={(e) => {
                clearError();
                setWithoutImage(e.target.checked);
              }}
            />
            <label className="form-check-label" htmlFor="pieces-no-photo">Sin foto</label>
          </div>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            disabled={!canExport || exporting}
            onClick={download}
          >
            {exporting ? "Exportando…" : "Exportar"}
          </button>
        </div>
        {!canExport && (
          <div className="form-text">Para exportar, buscá o elegí un filtro.</div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p className="app-muted mb-0">Cargando…</p>
      ) : pieces.length === 0 ? (
        <p className="app-muted mb-0">
          {filtering ? "No hay piezas con eso." : "No hay piezas."}
        </p>
      ) : (
        <div className="row g-3">
          {pieces.map((piece) => {
            const imageUrl = getUnitImageUrl(piece);
            return (
              <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={piece.id}>
                <button
                  type="button"
                  className="card h-100 w-100 text-start border shadow-sm"
                  onClick={() => openPiece(piece)}
                >
                  <div
                    className="d-flex align-items-center justify-content-center"
                    style={{ height: 200, background: "#f4f6f8" }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={piece.code}
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      />
                    ) : (
                      <i className="bi bi-image text-secondary fs-3"></i>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="fw-bold">{piece.code}</div>
                    {piece.name && <div>{piece.name}</div>}
                    {piece.is_broken && <div className="small text-danger">Rota</div>}
                    <div className="app-muted small">{piece.place}</div>
                    {piece.item_name && (
                      <div className="app-muted small">{piece.item_name}</div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {detail?.item && (
        <ItemDetailModal
          item={detail.item}
          isOpen
          focusCode={detail.code}
          onClose={() => setDetail(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
    </Dashboard>
  );
};

export default Piezas;
