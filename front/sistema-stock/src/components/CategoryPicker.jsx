import { useEffect, useMemo, useRef, useState } from "react";

const CategoryPicker = ({ categories, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const filtered = useMemo(() => {
    const source = categories || [];
    const term = query.trim().toLowerCase();
    if (!term) return source;
    return source.filter((cat) => {
      const label = (cat.label || cat.name || "").toLowerCase();
      return label.includes(term);
    });
  }, [categories, query]);

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

  const selected = (categories || []).find((cat) => cat.name === value);

  const choose = (cat) => {
    onChange(cat.name);
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
          {selected ? (selected.label || selected.name) : "Elegir categoría"}
        </span>
        <span className="obra-picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="obra-picker-panel">
          <input
            className="form-control"
            placeholder="Buscar categoría"
            value={query}
            autoFocus
            aria-label="Buscar categoría"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <div className="obra-picker-list" role="listbox" aria-label="Categoría">
            {filtered.length === 0 ? (
              <div className="obra-picker-empty">No hay categorías con ese nombre</div>
            ) : (
              filtered.map((cat) => {
                const isSelected = value === cat.name;
                return (
                  <button
                    key={cat.id || cat.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`obra-picker-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => choose(cat)}
                  >
                    <span className="obra-picker-name">{cat.label || cat.name}</span>
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

export default CategoryPicker;
