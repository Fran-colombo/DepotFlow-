import { useEffect, useMemo, useRef, useState } from "react";

const ObraPicker = ({ obras, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const list = (obras || []).filter((obra) => obra.stage !== "finalizada" && obra.active !== false);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((obra) => obra.name.toLowerCase().includes(term));
  }, [list, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (list.length === 0) {
    return (
      <div className="obra-picker-empty">
        No hay obras abiertas. Un administrador las crea en Administración, Obras.
      </div>
    );
  }

  const selected = list.find((obra) => obra.name === value);

  const choose = (obra) => {
    onChange(obra.name);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="obra-picker" ref={rootRef}>
      <button
        type="button"
        className={`obra-picker-toggle${selected ? " is-selected" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="obra-picker-toggle-label">
          {selected ? selected.name : "Elegir obra"}
        </span>
        <span className="obra-picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="obra-picker-panel">
          <input
            className="form-control"
            placeholder="Buscar obra"
            value={query}
            autoFocus
            aria-label="Buscar obra"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="obra-picker-list" role="listbox" aria-label="Obra de destino">
            {filtered.length === 0 ? (
              <div className="obra-picker-empty">No hay obras con ese nombre</div>
            ) : (
              filtered.map((obra) => {
                const isSelected = value === obra.name;
                return (
                  <button
                    key={obra.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`obra-picker-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => choose(obra)}
                  >
                    <span className="obra-picker-name">{obra.name}</span>
                    <span className="obra-picker-tag">{obra.stage_label || ""}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ObraPicker;
