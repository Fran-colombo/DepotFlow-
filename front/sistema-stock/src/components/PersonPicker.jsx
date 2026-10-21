import { useEffect, useMemo, useRef, useState } from "react";
import { getEmpleados } from "../api/empleados";

const PersonPicker = ({ value, onChange, disabled = false }) => {
  const [people, setPeople] = useState([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getEmpleados()
      .then((data) => {
        if (!cancelled) setPeople(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const names = people.filter((person) => person.active !== false).map((person) => person.name);
  const known = names.includes(value);
  const showOther = otherMode || Boolean(ready && value && !known);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return names;
    return names.filter((name) => name.toLowerCase().includes(term));
  }, [names, query]);

  const choose = (name) => {
    setOtherMode(false);
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  const chooseOther = () => {
    setOtherMode(true);
    if (known) onChange("");
    setQuery("");
    setOpen(false);
  };

  const label = !ready ? "Cargando…" : known || value ? value : "Elegir";

  return (
    <div>
      <div className="obra-picker" ref={rootRef}>
        <button
          type="button"
          className={`obra-picker-toggle${known || value ? " is-selected" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled || !ready}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="obra-picker-toggle-label">{label}</span>
          <span className="obra-picker-caret" aria-hidden="true" />
        </button>
        {open && (
          <div className="obra-picker-panel">
            <input
              className="form-control"
              placeholder="Buscar persona"
              value={query}
              autoFocus
              aria-label="Buscar persona"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            <div className="obra-picker-list" role="listbox" aria-label="Persona">
              {filtered.length === 0 ? (
                <div className="obra-picker-empty">No hay personas con ese nombre</div>
              ) : (
                filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={value === name}
                    className={`obra-picker-option${value === name ? " is-selected" : ""}`}
                    onClick={() => choose(name)}
                  >
                    <span className="obra-picker-name">{name}</span>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              role="option"
              className="obra-picker-option"
              onClick={chooseOther}
            >
              <span className="obra-picker-name">Otros</span>
            </button>
          </div>
        )}
      </div>
      {showOther && (
        <input
          className="form-control mt-2"
          value={known ? "" : value}
          disabled={disabled}
          placeholder="Nombre"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};

export default PersonPicker;
