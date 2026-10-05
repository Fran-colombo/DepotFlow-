import { useMemo, useState } from "react";

const ObraPicker = ({ obras, value, onChange }) => {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (obras || []).filter((obra) =>
      !term || obra.name.toLowerCase().includes(term)
    );
  }, [obras, query]);

  return (
    <div>
      <input
        className="form-control mb-2"
        placeholder="Buscar obra"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="border rounded" style={{ maxHeight: "20rem", overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div className="text-secondary small p-2">No hay obras con ese nombre</div>
        ) : (
          filtered.map((obra) => (
            <button
              key={obra.id}
              type="button"
              className={`list-group-item list-group-item-action border-0 text-start w-100 ${
                value === obra.name ? "active" : ""
              }`}
              onClick={() => onChange(obra.name)}
            >
              {obra.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ObraPicker;
