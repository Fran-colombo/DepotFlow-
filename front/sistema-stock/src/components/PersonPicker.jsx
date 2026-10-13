import { useEffect, useState } from "react";
import { getEmpleados } from "../api/empleados";

const OTHER = "__otros__";

const PersonPicker = ({ value, onChange, disabled = false }) => {
  const [people, setPeople] = useState([]);
  const [otherMode, setOtherMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEmpleados()
      .then((data) => {
        if (!cancelled) setPeople(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const names = people.filter((person) => person.active !== false).map((person) => person.name);
  const known = names.includes(value);
  const showOther = otherMode || Boolean(value && !known);

  if (names.length === 0) {
    return (
      <input
        className="form-control"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <>
      <select
        className="form-select"
        value={known ? value : showOther ? OTHER : ""}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER) {
            setOtherMode(true);
            if (known) onChange("");
            return;
          }
          setOtherMode(false);
          onChange(next);
        }}
      >
        <option value="">Elegir</option>
        {names.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
        <option value={OTHER}>Otros</option>
      </select>
      {showOther && (
        <input
          className="form-control mt-2"
          value={known ? "" : value}
          disabled={disabled}
          placeholder="Nombre"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
};

export default PersonPicker;
