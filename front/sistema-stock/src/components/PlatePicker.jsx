import { useEffect, useMemo, useRef, useState } from "react";

const PlatePicker = ({ autos, value, onChange, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const cars = (autos || []).filter((row) => row.kind === "auto");
  const selected = cars.find((row) => row.id === value);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return cars;
    return cars.filter((row) => {
      const plate = (row.plate || "").toLowerCase();
      const name = (row.name || "").toLowerCase();
      return plate.includes(term) || name.includes(term);
    });
  }, [cars, query]);

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

  const choose = (row) => {
    onChange(row.id);
    setQuery("");
    setOpen(false);
  };

  const label = selected
    ? `${selected.plate || "Sin patente"}${selected.name ? ` · ${selected.name}` : ""}`
    : "Elegir patente";

  return (
    <div className="obra-picker" ref={rootRef}>
      <button
        type="button"
        className={`obra-picker-toggle${selected ? " is-selected" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="obra-picker-toggle-label">{label}</span>
        <span className="obra-picker-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="obra-picker-panel">
          <input
            className="form-control"
            placeholder="Buscar patente"
            value={query}
            autoFocus
            aria-label="Buscar patente"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
          <div className="obra-picker-list" role="listbox" aria-label="Patente">
            {filtered.length === 0 ? (
              <div className="obra-picker-empty">No hay autos con esa patente</div>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={value === row.id}
                  className={`obra-picker-option${value === row.id ? " is-selected" : ""}`}
                  onClick={() => choose(row)}
                >
                  <span className="obra-picker-name">{row.plate || "Sin patente"}</span>
                  <span className="obra-picker-tag">{row.name || ""}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatePicker;
