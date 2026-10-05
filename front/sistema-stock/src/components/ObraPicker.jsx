import { useMemo, useState } from "react";

const ObraPicker = ({ obras, value, onChange }) => {
  const [query, setQuery] = useState("");
  const list = obras || [];
  const showSearch = list.length > 6;
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!showSearch || !term) return list;
    return list.filter((obra) => obra.name.toLowerCase().includes(term));
  }, [list, query, showSearch]);

  if (list.length === 0) {
    return (
      <div className="obra-picker-empty">
        No hay obras cargadas. Un administrador las crea en Administración, Obras.
      </div>
    );
  }

  return (
    <div className="obra-picker">
      {showSearch && (
        <input
          className="form-control mb-2"
          placeholder="Buscar obra"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar obra"
        />
      )}
      <div className="obra-picker-list" role="radiogroup" aria-label="Obra de destino">
        {filtered.length === 0 ? (
          <div className="obra-picker-empty">No hay obras con ese nombre</div>
        ) : (
          filtered.map((obra) => {
            const selected = value === obra.name;
            return (
              <button
                key={obra.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`obra-picker-option${selected ? " is-selected" : ""}`}
                onClick={() => onChange(obra.name)}
              >
                <span className="obra-picker-mark" aria-hidden="true" />
                <span className="obra-picker-name">{obra.name}</span>
                {selected && <span className="obra-picker-tag">Elegida</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ObraPicker;
