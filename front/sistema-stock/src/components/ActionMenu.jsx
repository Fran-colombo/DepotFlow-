import { useEffect, useRef, useState } from "react";

function tidy(items) {
  const list = items.filter(Boolean);
  return list.filter((entry, index) => {
    if (!entry.divider) return true;
    const before = list.slice(0, index).some((row) => !row.divider);
    const after = list.slice(index + 1).some((row) => !row.divider);
    return before && after && !list[index - 1]?.divider;
  });
}

export default function ActionMenu({ label, items, variant = "outline-secondary", disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const entries = tidy(items);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!entries.some((entry) => !entry.divider)) return null;

  return (
    <div className="position-relative" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm btn-${variant} dropdown-toggle`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div className="dropdown-menu show shadow-sm" style={{ right: 0, left: "auto", top: "100%", zIndex: 1000 }}>
          {entries.map((entry, index) =>
            entry.divider ? (
              <div key={`divider-${index}`} className="dropdown-divider"></div>
            ) : entry.file ? (
              <label key={entry.label} className="dropdown-item mb-0" style={{ cursor: "pointer" }}>
                {entry.label}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    setOpen(false);
                    entry.file(event);
                  }}
                />
              </label>
            ) : (
              <button
                key={entry.label}
                type="button"
                className={`dropdown-item${entry.danger ? " text-danger" : ""}`}
                disabled={entry.disabled}
                onClick={() => {
                  setOpen(false);
                  entry.onClick();
                }}
              >
                {entry.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
