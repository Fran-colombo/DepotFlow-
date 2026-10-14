import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import { exportPieces, getItemById, getUnitImageUrl, searchPieces } from "../api/items";
import ItemDetailModal from "../components/ItemDetailModal";

const Piezas = () => {
  const [query, setQuery] = useState("");
  const [broken, setBroken] = useState(false);
  const [withoutImage, setWithoutImage] = useState(false);
  const [revision, setRevision] = useState(0);
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const canExport = Boolean(query.trim() || broken || withoutImage);

  const download = async () => {
    if (!canExport || exporting) return;
    setExporting(true);
    setError("");
    try {
      await exportPieces(query, { broken, withoutImage });
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
      searchPieces(query, { broken, withoutImage })
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
  }, [query, broken, withoutImage, revision]);

  const openPiece = async (piece) => {
    setError("");
    try {
      const res = await getItemById(piece.item_id);
      setDetail({ item: res.item, code: piece.code });
    } catch (err) {
      setError(err.message || "No se pudo abrir la pieza");
    }
  };

  return (
    <Dashboard title="Piezas">
      <div className="mb-4">
        <label className="form-label" htmlFor="piece-filter">Buscar</label>
        <input
          id="piece-filter"
          className="form-control"
          placeholder="Código, nombre o subcategoría"
          value={query}
          onChange={(e) => {
            setError("");
            setQuery(e.target.value);
          }}
        />
        <div className="d-flex flex-wrap gap-3 mt-3">
          <div className="form-check mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="pieces-broken"
              checked={broken}
              onChange={(e) => {
                setError("");
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
                setError("");
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
          <div className="form-text">Para exportar, buscá o marcá Rotas o Sin foto.</div>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <p className="app-muted mb-0">Cargando…</p>
      ) : pieces.length === 0 ? (
        <p className="app-muted mb-0">
          {query.trim() || broken || withoutImage ? "No hay piezas con eso." : "No hay piezas."}
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
