import { useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./Dashboard";
import useAuth from "../hooks/useAuth";
import PersonPicker from "../components/PersonPicker";
import PlatePicker from "../components/PlatePicker";
import ObraPicker from "../components/ObraPicker";
import NumberInput from "../components/NumberInput";
import { getObras } from "../api/obras";
import FeedbackModal from "../components/FeedbackModal";
import {
  addServicePlace,
  addTransporteNote,
  createFine,
  createTransporte,
  deleteServicePlace,
  addPastUse,
  fineFileKind,
  fineFileUrl,
  getTransporte,
  handOverTransporte,
  leaveTransporte,
  listFines,
  listTransportes,
  listUsesOnDay,
  lookupFine,
  consultRosario,
  exportFines,
  returnTransporte,
  setFinePerson,
  transportImageUrl,
  updateServicePlace,
  updateTransporte,
  updateTransporteKm,
  updateFine,
  uploadFineFile,
  uploadTransporteImage,
} from "../api/transportes";

function FineFile({ fine, canEdit = false, busy = false, onReplace, compact = false }) {
  const inputRef = useRef(null);
  const url = fineFileUrl(fine);
  const kind = fineFileKind(fine);
  const picker = canEdit ? (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {url ? "Actualizar" : "Subir"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        hidden
        disabled={busy}
        onChange={(e) => {
          const next = e.target.files?.[0];
          e.target.value = "";
          if (next) onReplace?.(next);
        }}
      />
    </>
  ) : null;

  if (!url) {
    if (compact) return <span className="app-muted">—</span>;
    return canEdit ? <div className="fine-file">{picker}</div> : <span className="app-muted">—</span>;
  }

  return (
    <div className="fine-file">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`fine-file-preview${compact ? " fine-file-preview-sm" : ""}`}
        title={kind === "pdf" ? "Ver PDF" : "Ver foto"}
      >
        {kind === "pdf" ? (
          <span className="fine-file-pdf">
            <i className="bi bi-file-earmark-pdf-fill fs-4"></i>
            PDF
          </span>
        ) : (
          <img src={url} alt="Archivo de la multa" />
        )}
      </a>
      {!compact && picker}
    </div>
  );
}

const FINE_STATUSES = [
  { id: "a_pagar", label: "A pagar", badge: "bg-warning text-dark" },
  { id: "a_reclamar", label: "A reclamar", badge: "bg-secondary" },
  { id: "reclamo", label: "Reclamada", badge: "bg-info text-dark" },
  { id: "pagada", label: "Pagada", badge: "bg-success" },
];
const FINES_PER_PAGE = 10;

function fineStatus(fine) {
  if (FINE_STATUSES.some((item) => item.id === fine?.status)) return fine.status;
  return fine?.paid ? "pagada" : "a_pagar";
}

function fineStatusMeta(fine) {
  const id = fineStatus(fine);
  return FINE_STATUSES.find((item) => item.id === id) || FINE_STATUSES[0];
}

function formatPesos(amount) {
  if (amount == null || amount === "") return "—";
  return `$${Number(amount).toLocaleString("es-AR")}`;
}

function sumFineAmounts(list) {
  return (list || []).reduce((total, fine) => {
    const amount = Number(fine?.amount);
    return Number.isFinite(amount) ? total + amount : total;
  }, 0);
}

function unpaidFines(list) {
  return (list || []).filter((fine) => fineStatus(fine) !== "pagada");
}

function voluntaryLabel(value) {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "—";
}

function fineDayKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parsedDayKey(text) {
  const date = parseDate(text);
  if (!date || date.invalid) return "";
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowParts() {
  const date = new Date();
  return {
    date: `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

function parseTime(text) {
  const raw = (text || "").trim();
  let hour;
  let minute;
  if (/^\d{1,4}$/.test(raw)) {
    const split = raw.length <= 2 ? raw.length : raw.length - 2;
    hour = Number(raw.slice(0, split));
    minute = Number(raw.slice(split) || 0);
  } else {
    const match = /^(\d{1,2})\s*[:.,h\s-]\s*(\d{1,2})?$/i.exec(raw);
    if (!match) return null;
    hour = Number(match[1]);
    minute = Number(match[2] || 0);
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function parseDate(text) {
  const raw = (text || "").trim();
  const currentYear = new Date().getFullYear();
  let parts;
  if (/^\d{8}$/.test(raw)) parts = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
  else if (/^\d{6}$/.test(raw)) parts = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4)];
  else if (/^\d{4}$/.test(raw)) parts = [raw.slice(0, 2), raw.slice(2)];
  else parts = raw.split(/[/.,\s-]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = parts[2] ? Number(parts[2]) : currentYear;
  if (parts[2] && parts[2].length <= 2) year += 2000;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return { invalid: true };
  }
  return { day, month, year };
}

function formatDateText(text) {
  const date = parseDate(text);
  if (!date || date.invalid) return text;
  return `${pad2(date.day)}/${pad2(date.month)}/${date.year}`;
}

function formatTimeText(text) {
  const time = parseTime(text);
  return time ? `${pad2(time.hour)}:${pad2(time.minute)}` : text;
}

function toIso(dateText, timeText) {
  const date = parseDate(dateText);
  const time = parseTime(timeText);
  if (!date || !time) {
    throw new Error("La fecha es día/mes/año y la hora de 00:00 a 23:59");
  }
  if (date.invalid) throw new Error("Esa fecha no existe");
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}T${pad2(time.hour)}:${pad2(time.minute)}`;
}

function selectAll(event) {
  const input = event.target;
  setTimeout(() => input.select(), 0);
}

function selectDatePart(event) {
  const input = event.target;
  const value = input.value || "";
  const pos = input.selectionStart ?? 0;
  const parts = [];
  let start = 0;
  for (let i = 0; i <= value.length; i += 1) {
    if (i === value.length || value[i] === "/") {
      if (i > start) parts.push([start, i]);
      start = i + 1;
    }
  }
  const segment = parts.find(([from, to]) => pos >= from && pos <= to) || parts[0];
  if (!segment) return;
  const [from, to] = segment;
  setTimeout(() => input.setSelectionRange(from, to), 0);
}

const WHEN_HINT = "Está puesta la de ahora. En la fecha, tocá el día, el mes o el año para cambiar solo eso. Para las 8:00 alcanza con 800 o 8, y para el 15/10 con 15.10.";

function WhenFields({ date, time, onDate, onTime, hint = WHEN_HINT }) {
  return (
    <>
      <label className="form-label">Fecha</label>
      <input
        className="form-control mb-2"
        inputMode="decimal"
        placeholder="15/10/2026"
        value={date}
        onFocus={selectDatePart}
        onClick={selectDatePart}
        onChange={(e) => onDate(e.target.value)}
        onBlur={() => onDate(formatDateText(date))}
      />
      <label className="form-label">Hora</label>
      <input
        className="form-control"
        inputMode="decimal"
        placeholder="08:43"
        value={time}
        onFocus={selectAll}
        onChange={(e) => onTime(e.target.value)}
        onBlur={() => onTime(formatTimeText(time))}
      />
      {hint && <div className="form-text">{hint}</div>}
    </>
  );
}

function sinceLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  if (sameDay) return `desde ${time}`;
  const day = date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `desde ${day}, ${time}`;
}

function withSince(text, row) {
  const since = sinceLabel(row?.open_left_at);
  if (!since) return text;
  return text ? `${text} · ${since}` : since;
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function formatDay(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fineDueSoon(fine) {
  if (!fine?.due_at || fineStatus(fine) === "pagada") return false;
  const due = new Date(fine.due_at);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return (due - today) / 86400000 < 10;
}

function isoToDateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function dateTextToIso(text, label) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const date = parseDate(raw);
  if (!date) throw new Error(`${label} es día/mes/año`);
  if (date.invalid) throw new Error(`Esa ${label.toLowerCase()} no existe`);
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function optionalKm(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = parseInt(text, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error("Los kilómetros tienen que ser un número");
  }
  return parsed;
}

function Photo({ row, alt }) {
  const imageUrl = transportImageUrl(row);
  return (
    <div className="d-flex align-items-center justify-content-center" style={{ height: 180, background: "#f4f6f8" }}>
      {imageUrl ? (
        <img src={imageUrl} alt={alt} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      ) : (
        <i className="bi bi-image text-secondary fs-3"></i>
      )}
    </div>
  );
}

function formatKm(value) {
  return Number(value).toLocaleString("es-AR");
}

function KmLine({ row }) {
  if (row.km_until == null) return null;
  const close = row.km_until < 1000;
  if (row.km_until < 0) {
    return (
      <div className="small text-danger text-decoration-underline">
        Se pasó {formatKm(-row.km_until)} km del service
      </div>
    );
  }
  return (
    <div className={`small ${close ? "text-danger text-decoration-underline" : "app-muted"}`}>
      Faltan {formatKm(row.km_until)} km para el service
    </div>
  );
}

function canPass(row) {
  if (!row.out) return false;
  if (row.kind === "auto") return row.place === "En uso";
  return row.place === "Prestado" || (row.place || "").startsWith("En la obra");
}

function webHref(value) {
  const text = (value || "").trim();
  if (!text) return "";
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function serviceMessage(row, places) {
  const last = row.last_service_km != null ? `El último fue hecho a los ${formatKm(row.last_service_km)} km` : "";
  const next = row.next_service_km != null
    ? `hay que programar un turno para hacer el próximo antes de los ${formatKm(row.next_service_km)} km.`
    : "hay que programar un turno para hacer el próximo.";
  const when = last ? `${last}, ${next}` : next.charAt(0).toUpperCase() + next.slice(1);
  const lines = [
    `${row.name}, ${row.plate}, está por necesitar el service. ${when}`,
    "",
    "Estos son los lugares donde podés hacer el service:",
  ];
  places.forEach((place) => {
    lines.push("");
    lines.push(`*${place.name}*`);
    if (place.phone) lines.push(`Teléfono: ${place.phone}`);
    if (place.address) lines.push(`Dirección: ${place.address}`);
    if (place.website) lines.push(`Web: ${webHref(place.website)}`);
  });
  return lines.join("\n");
}

const Autos = () => {
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "sysadmin";
  const [rows, setRows] = useState([]);
  const [fines, setFines] = useState([]);
  const [fineScope, setFineScope] = useState("activas");
  const [finePerson, setFinePerson] = useState("");
  const [fineAutoId, setFineAutoId] = useState("");
  const [fineDate, setFineDate] = useState("");
  const [drivers, setDrivers] = useState(null);
  const [driversBusy, setDriversBusy] = useState(false);
  const [viewingFine, setViewingFine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [move, setMove] = useState(null);
  const [pastUse, setPastUse] = useState(null);
  const [creating, setCreating] = useState(null);
  const [fining, setFining] = useState(false);
  const [finesOpen, setFinesOpen] = useState(false);
  const [selectedFineIds, setSelectedFineIds] = useState([]);
  const [exportingFines, setExportingFines] = useState(false);
  const [claimingFine, setClaimingFine] = useState(null);
  const [finePage, setFinePage] = useState(1);
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    const [data, fineRows] = await Promise.all([listTransportes(), listFines()]);
    setRows(Array.isArray(data) ? data : []);
    setFines(Array.isArray(fineRows) ? fineRows : []);
  };

  const openDetail = async (id) => {
    const data = await getTransporte(id);
    setDetail(data);
    setDetailId(id);
  };

  const refreshDetail = async () => {
    await load();
    if (detailId) await openDetail(detailId);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listTransportes(), listFines()])
      .then(([data, fineRows]) => {
        if (cancelled) return;
        setRows(Array.isArray(data) ? data : []);
        setFines(Array.isArray(fineRows) ? fineRows : []);
      })
      .catch((err) => {
        if (!cancelled) setFeedback({ type: "error", message: err.message || "No se pudieron cargar" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const autos = rows.filter((row) => row.kind === "auto");
  const carts = rows.filter((row) => row.kind === "carro");
  const freeCarts = carts.filter((row) => !row.out);
  const autosOut = autos.filter((row) => row.place === "En uso" && !row.with_name);
  const finePeople = [...new Set(fines.map((fine) => fine.person).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const hasNameless = fines.some((fine) => !fine.person);
  const shownFines = fines.filter((fine) => {
    if (fineScope === "activas" && fineStatus(fine) === "pagada") return false;
    if (finePerson === "__none__") return !fine.person;
    if (finePerson && fine.person !== finePerson) return false;
    if (fineAutoId && fine.transport_id !== fineAutoId) return false;
    const wanted = parsedDayKey(fineDate);
    if (wanted && fineDayKey(fine.occurred_at) !== wanted) return false;
    return true;
  });
  const unpaidShown = unpaidFines(shownFines);
  const dueTotal = sumFineAmounts(unpaidShown);
  const withoutAmount = unpaidShown.filter((fine) => fine.amount == null || fine.amount === "").length;
  const paidShownTotal = sumFineAmounts(shownFines.filter((fine) => fineStatus(fine) === "pagada"));
  const activeFines = unpaidFines(fines);
  const activeFineCount = activeFines.length;
  const activeDueTotal = sumFineAmounts(activeFines);
  const fineMoneyCar = autos.find((row) => row.id === fineAutoId);
  const fineMoneyFilter = [
    fineAutoId && (fineMoneyCar?.plate || fineMoneyCar?.name),
    finePerson === "__none__" ? "sin nombre" : finePerson,
  ].filter(Boolean).join(" · ");
  const finePages = Math.max(1, Math.ceil(shownFines.length / FINES_PER_PAGE));
  const currentFinePage = Math.min(finePage, finePages);
  const pagedFines = shownFines.slice((currentFinePage - 1) * FINES_PER_PAGE, currentFinePage * FINES_PER_PAGE);
  const pagedFineIds = pagedFines.map((fine) => fine.id);
  const selectedFines = fines.filter((fine) => selectedFineIds.includes(fine.id));
  const selectedPagedCount = pagedFines.filter((fine) => selectedFineIds.includes(fine.id)).length;
  const allPagedSelected = pagedFines.length > 0 && selectedPagedCount === pagedFines.length;

  const toggleFine = (id) => {
    setSelectedFineIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAllShownFines = () => {
    setSelectedFineIds((prev) => {
      if (allPagedSelected) return prev.filter((id) => !pagedFineIds.includes(id));
      return [...new Set([...prev, ...pagedFineIds])];
    });
  };

  const exportSelectedFines = async () => {
    if (!selectedFines.length || exportingFines) return;
    setExportingFines(true);
    try {
      await exportFines(selectedFines.map((fine) => fine.id));
    } catch (err) {
      tell("error", err.message || "No se pudo exportar");
    } finally {
      setExportingFines(false);
    }
  };

  const changeFineStatus = async (fine, status, extra = {}) => {
    if (status === "a_reclamar" && extra.claim_reason == null) {
      setClaimingFine(fine);
      return;
    }
    try {
      const updated = await updateFine(fine.id, { status, ...extra });
      setClaimingFine(null);
      await load();
      if (detailId) await openDetail(detailId);
      if (viewingFine?.id === fine.id) setViewingFine(updated);
      tell("success", "Quedó el estado.");
    } catch (err) {
      tell("error", err.message || "No se pudo actualizar el estado");
    }
  };

  const searchDrivers = async () => {
    const date = formatDateText(fineDate);
    if (!parsedDayKey(date)) {
      tell("error", "Indicá la fecha para buscar quién manejaba");
      return;
    }
    setDriversBusy(true);
    try {
      const data = await listUsesOnDay(date, fineAutoId || undefined);
      setDrivers(Array.isArray(data) ? data : []);
    } catch (err) {
      tell("error", err.message || "No se pudo buscar quién manejaba");
    } finally {
      setDriversBusy(false);
    }
  };

  const tell = (type, message) => setFeedback({ type, message });

  return (
    <Dashboard title="Autos">
      <div className="d-flex justify-content-end align-items-center mb-3">
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setFinesOpen(true)}>
            Ver multas{activeFineCount > 0 ? ` (${activeFineCount}${activeDueTotal ? ` · ${formatPesos(activeDueTotal)}` : ""})` : ""}
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-primary" onClick={() => setCreating("auto")}>
              Agregar auto
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <p className="app-muted">Cargando…</p>
      ) : autos.length === 0 ? (
        <p className="app-muted">No hay autos.</p>
      ) : (
        <div className="row g-3">
          {autos.map((row) => (
            <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={row.id}>
              <div className="card h-100 border shadow-sm">
                <button type="button" className="btn p-0 text-start border-0" onClick={() => openDetail(row.id).catch((err) => tell("error", err.message))}>
                  <Photo row={row} alt={row.plate || row.name} />
                  <div className="card-body pb-2">
                    <div className="fw-bold">{row.plate || row.name}</div>
                    <div>{row.name}</div>
                    <div className="app-muted small">{withSince(`${row.place}${row.open_person ? ` · ${row.open_person}` : ""}`, row)}</div>
                    {row.with_name && <div className="app-muted small">Con {row.with_name}</div>}
                    {row.is_broken && <div className="small text-danger">Roto</div>}
                    {row.in_repair && <div className="small">Lo llevaron a arreglar</div>}
                    {row.current_km != null && <div className="small">Tiene {formatKm(row.current_km)} km</div>}
                    <KmLine row={row} />
                  </div>
                </button>
                <div className="card-footer bg-white border-0 pt-0 d-flex flex-wrap gap-2">
                  {!row.out ? (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setMove({ id: row.id, kind: "auto", action: "leave" })}>
                      Salir
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMove({ id: row.id, kind: "auto", action: "return", row })}>
                        Devolver
                      </button>
                      {canPass(row) && (
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setMove({ id: row.id, kind: "auto", action: "handover", row })}>
                          Pasar
                        </button>
                      )}
                    </>
                  )}
                  {isAdmin && (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPastUse(row)}>
                      Cargar uso pasado
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mt-4 mb-3">
        <h2 className="h5 mb-0">Carros</h2>
        {isAdmin && (
          <button type="button" className="btn btn-outline-primary" onClick={() => setCreating("carro")}>
            Agregar carro
          </button>
        )}
      </div>
      {carts.length === 0 ? (
        <p className="app-muted">No hay carros.</p>
      ) : (
        <div className="row g-3">
          {carts.map((row) => (
            <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={row.id}>
              <div className="card h-100 border shadow-sm">
                <button type="button" className="btn p-0 text-start border-0" onClick={() => openDetail(row.id).catch((err) => tell("error", err.message))}>
                  <Photo row={row} alt={row.name} />
                  <div className="card-body pb-2">
                    <div className="fw-bold">{row.name}</div>
                    <div className="app-muted small">
                      {withSince(`${row.place}${row.with_name ? ` · ${row.with_name}` : ""}${row.open_person ? ` · ${row.open_person}` : ""}`, row)}
                    </div>
                  </div>
                </button>
                <div className="card-footer bg-white border-0 pt-0 d-flex gap-2">
                  {!row.out ? (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setMove({ id: row.id, kind: "carro", action: "leave" })}>
                      Salir
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMove({ id: row.id, kind: "carro", action: "return" })}>
                        Devolver
                      </button>
                      {canPass(row) && (
                        <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setMove({ id: row.id, kind: "carro", action: "handover", row })}>
                          Pasar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {finesOpen && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }} onClick={() => setFinesOpen(false)}>
          <div className="modal-dialog modal-xl modal-dialog-centered fines-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title mb-0">Multas</h5>
                <button type="button" className="btn-close ms-auto" aria-label="Cerrar" onClick={() => setFinesOpen(false)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-3 col-6">
                    <label className="form-label">Cuáles</label>
                    <select className="form-select" value={fineScope} onChange={(e) => { setFineScope(e.target.value); setFinePage(1); }}>
                      <option value="activas">Activas</option>
                      <option value="todas">Todas</option>
                    </select>
                  </div>
                  <div className="col-md-3 col-6">
                    <label className="form-label">Auto</label>
                    <PlatePicker autos={autos} value={fineAutoId} onChange={(value) => { setFineAutoId(value); setFinePage(1); }} allowEmpty placeholder="Todos" />
                  </div>
                  <div className="col-md-3 col-6">
                    <label className="form-label">Fecha</label>
                    <input
                      className="form-control"
                      inputMode="decimal"
                      placeholder="15/10/2026"
                      value={fineDate}
                      onFocus={selectDatePart}
                      onClick={selectDatePart}
                      onChange={(e) => { setFineDate(e.target.value); setFinePage(1); }}
                      onBlur={() => setFineDate(formatDateText(fineDate))}
                    />
                  </div>
                  <div className="col-md-3 col-6">
                    <label className="form-label">Persona</label>
                    <select className="form-select" value={finePerson} onChange={(e) => { setFinePerson(e.target.value); setFinePage(1); }}>
                      <option value="">Todas</option>
                      {finePeople.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      {hasNameless && <option value="__none__">Sin nombre</option>}
                    </select>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-2 mt-2 mb-3">
                  <button type="button" className="btn btn-outline-secondary" disabled={driversBusy} onClick={searchDrivers}>
                    Quién manejaba
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={!selectedFines.length || exportingFines}
                    onClick={exportSelectedFines}
                  >
                    {exportingFines ? "Exportando…" : `Exportar${selectedFines.length ? ` (${selectedFines.length})` : ""}`}
                  </button>
                  {isAdmin && (
                    <button type="button" className="btn btn-primary ms-auto" onClick={() => setFining("list")}>
                      Cargar multa
                    </button>
                  )}
                </div>
                {drivers && (
                  <div className="border rounded p-2 mb-3 small">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <div className="fw-semibold">Quién manejaba el {formatDateText(fineDate) || "ese día"}</div>
                      <button type="button" className="btn-close btn-close-sm" aria-label="Cerrar" onClick={() => setDrivers(null)}></button>
                    </div>
                    {drivers.length === 0 ? (
                      <div className="app-muted">Nadie tiene un auto cargado ese día.</div>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {drivers.map((use) => (
                          <li key={use.id}>
                            {use.plate} · {use.name} · {use.person} · {formatWhen(use.left_at)}
                            {use.returned_at ? ` → ${formatWhen(use.returned_at)}` : " → sigue afuera"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {shownFines.length > 0 && (
                  <div className="border rounded px-3 py-2 mb-3 d-flex flex-wrap justify-content-between align-items-baseline gap-2">
                    <div>
                      <div className="small app-muted">Hay que poner{fineMoneyFilter ? ` · ${fineMoneyFilter}` : ""}</div>
                      <div className="fs-4 fw-semibold">
                        {dueTotal > 0 ? formatPesos(dueTotal) : withoutAmount ? "Falta cargar precios" : formatPesos(0)}
                      </div>
                    </div>
                    <div className="small app-muted">
                      {unpaidShown.length === 1 ? "1 multa" : `${unpaidShown.length} multas`}
                      {withoutAmount ? ` · ${withoutAmount} sin precio` : ""}
                      {fineScope === "todas" && paidShownTotal > 0 ? ` · pagado ${formatPesos(paidShownTotal)}` : ""}
                    </div>
                  </div>
                )}
                {shownFines.length === 0 ? (
                  <p className="app-muted mb-0">No hay multas con ese filtro.</p>
                ) : (
                  <div className="table-responsive fines-table-wrap">
                    <table className="table table-sm table-bordered align-middle mb-0">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={allPagedSelected}
                              onChange={toggleAllShownFines}
                              aria-label="Seleccionar todas"
                            />
                          </th>
                          <th>Fecha</th>
                          <th>Auto</th>
                          <th>Persona</th>
                          <th>Ubicación</th>
                          <th>$</th>
                          <th>Voluntario</th>
                          <th>Vence</th>
                          <th>Estado</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedFines.map((fine) => (
                          <tr key={fine.id} className={fineDueSoon(fine) ? "text-danger" : undefined}>
                            <td>
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={selectedFineIds.includes(fine.id)}
                                onChange={() => toggleFine(fine.id)}
                                aria-label={`Seleccionar multa ${fine.plate || fine.id}`}
                              />
                            </td>
                            <td>{formatWhen(fine.occurred_at)}</td>
                            <td>
                              <div>{fine.plate}</div>
                              <button
                                type="button"
                                className="btn btn-link p-0 small"
                                onClick={() => {
                                  setFinesOpen(false);
                                  openDetail(fine.transport_id).catch((err) => tell("error", err.message));
                                }}
                              >
                                {fine.name}
                              </button>
                            </td>
                            <td>{fine.person || "Falta quién"}</td>
                            <td className="small">{fine.lugar_infraccion || "—"}</td>
                            <td>{formatPesos(fine.amount)}</td>
                            <td>{voluntaryLabel(fine.voluntary)}</td>
                            <td className={fineDueSoon(fine) ? "fw-semibold" : undefined}>{formatDay(fine.due_at)}</td>
                            <td>
                              {isAdmin ? (
                                <select
                                  className="form-select form-select-sm"
                                  value={fineStatus(fine)}
                                  title={fine.claim_reason || undefined}
                                  onChange={(e) => changeFineStatus(fine, e.target.value)}
                                >
                                  {FINE_STATUSES.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`badge ${fineStatusMeta(fine).badge}`} title={fine.claim_reason || undefined}>{fineStatusMeta(fine).label}</span>
                              )}
                            </td>
                            <td>
                              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setViewingFine(fine)}>
                                Ver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {shownFines.length > 0 && (
                  <div className="d-flex justify-content-between align-items-center mt-2">
                    <span className="small app-muted">
                      {shownFines.length === 1 ? "1 multa" : `${shownFines.length} multas`}
                      {finePages > 1 ? ` · ${((currentFinePage - 1) * FINES_PER_PAGE) + 1}–${Math.min(currentFinePage * FINES_PER_PAGE, shownFines.length)}` : ""}
                    </span>
                    {finePages > 1 && (
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-secondary" disabled={currentFinePage <= 1} onClick={() => setFinePage(currentFinePage - 1)}>
                          Anterior
                        </button>
                        <button type="button" className="btn btn-light border" disabled>
                          {currentFinePage} / {finePages}
                        </button>
                        <button type="button" className="btn btn-outline-secondary" disabled={currentFinePage >= finePages} onClick={() => setFinePage(currentFinePage + 1)}>
                          Siguiente
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingFine && (
        <FineDetailModal
          fine={viewingFine}
          isAdmin={isAdmin}
          onClose={() => setViewingFine(null)}
          onChange={(next) => setViewingFine(next)}
          onRefresh={async (next) => {
            if (next) setViewingFine(next);
            await load();
            if (detailId) await openDetail(detailId);
          }}
        />
      )}

      {claimingFine && (
        <ClaimReasonModal
          fine={claimingFine}
          onClose={() => setClaimingFine(null)}
          onSave={(reason) => changeFineStatus(claimingFine, "a_reclamar", { claim_reason: reason })}
        />
      )}

      {detail && (
        <Detail
          row={detail}
          isAdmin={isAdmin}
          onClose={() => {
            setDetail(null);
            setDetailId(null);
          }}
          onLeave={() => setMove({ id: detail.id, kind: detail.kind, action: "leave" })}
          onReturn={() => setMove({ id: detail.id, kind: detail.kind, action: "return", row: detail })}
          onPass={() => setMove({ id: detail.id, kind: detail.kind, action: "handover", row: detail })}
          onPastUse={() => setPastUse(detail)}
          onFine={() => setFining("detail")}
          onOpenFine={(fine) => setViewingFine(fine)}
          onSaved={async (message) => {
            await refreshDetail();
            tell("success", message);
          }}
          onError={(message) => tell("error", message)}
        />
      )}
      {move && (
        <MoveModal
          move={move}
          carts={freeCarts}
          autosOut={autosOut}
          onClose={() => setMove(null)}
          onDone={async (message) => {
            setMove(null);
            await refreshDetail();
            tell("success", message);
          }}
          onError={(message) => tell("error", message)}
        />
      )}
      {pastUse && (
        <PastUseModal
          row={pastUse}
          carts={carts}
          autos={autos}
          onClose={() => setPastUse(null)}
          onDone={async (message) => {
            setPastUse(null);
            await refreshDetail();
            tell("success", message);
          }}
          onError={(message) => tell("error", message)}
        />
      )}
      {creating && (
        <CreateModal
          kind={creating}
          onClose={() => setCreating(null)}
          onDone={async (message) => {
            setCreating(null);
            await load();
            tell("success", message);
          }}
          onError={(message) => tell("error", message)}
        />
      )}
      {(fining === "list" || (fining === "detail" && detail?.kind === "auto")) && (
        <FineModal
          row={fining === "detail" ? detail : null}
          autos={autos}
          onClose={() => setFining(false)}
          onDone={async (message) => {
            setFining(false);
            await load();
            if (detailId) await openDetail(detailId);
            tell("success", message);
          }}
          onError={(message) => tell("error", message)}
        />
      )}
      <FeedbackModal
        open={Boolean(feedback)}
        type={feedback?.type}
        message={feedback?.message}
        onClose={() => setFeedback(null)}
      />
    </Dashboard>
  );
};

const USES_PER_PAGE = 8;

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatUseDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const text = date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function formatShortWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function formatDuration(from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "";
  const minutes = Math.round((end - start) / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  return `${rest} min`;
}

function UseEntry({ use, row }) {
  const joined = use.with_transport_id === row.id;
  const back = Boolean(use.returned_at);
  const sameDay = back && dayKey(use.left_at) === dayKey(use.returned_at);
  const duration = back ? formatDuration(use.left_at, use.returned_at) : "";
  const tags = [
    joined && use.person,
    use.obra && `Obra ${use.obra}`,
    use.cart_name && `Carro ${use.cart_name}`,
    use.with_transport_name && !joined && `Con ${use.with_transport_name}`,
    use.external_vehicle && `Auto de afuera: ${use.external_vehicle}`,
    use.km != null && `${formatKm(use.km)} km`,
  ].filter(Boolean);
  return (
    <li className="list-group-item">
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div style={{ minWidth: 0 }}>
          <div className="fw-semibold text-truncate">
            {joined ? `Se sumó el carro ${use.vehicle_name}` : use.person || "Sin persona"}
          </div>
          <div className="small">
            {formatTime(use.left_at)}
            {back ? ` a ${sameDay ? formatTime(use.returned_at) : formatShortWhen(use.returned_at)}` : " · sigue afuera"}
            {duration && <span className="app-muted"> · {duration}</span>}
          </div>
          {tags.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-1">
              {tags.map((text) => (
                <span key={text} className="badge rounded-pill text-bg-light border fw-normal">{text}</span>
              ))}
            </div>
          )}
        </div>
        <span className={`badge ${back ? "text-bg-success" : "text-bg-warning"}`}>{back ? "Volvió" : "Afuera"}</span>
      </div>
    </li>
  );
}

function UseHistory({ row }) {
  const uses = useMemo(() => (Array.isArray(row.uses) ? row.uses : []), [row.uses]);
  const [person, setPerson] = useState("");
  const [state, setState] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const people = useMemo(
    () => [...new Set(uses.map((use) => (use.person || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [uses],
  );

  const filtered = useMemo(() => uses.filter((use) => {
    if (person && (use.person || "").trim() !== person) return false;
    if (state === "out" && use.returned_at) return false;
    if (state === "back" && !use.returned_at) return false;
    const day = dayKey(use.left_at);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }), [uses, person, state, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / USES_PER_PAGE));
  const current = Math.min(page, pages);
  const groups = [];
  filtered.slice((current - 1) * USES_PER_PAGE, current * USES_PER_PAGE).forEach((use) => {
    const key = dayKey(use.left_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(use);
    else groups.push({ key, label: formatUseDay(use.left_at), items: [use] });
  });
  const filtering = Boolean(person || state || from || to);
  const change = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };
  const clear = () => {
    setPerson("");
    setState("");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <div className="border rounded p-3">
      <div className="d-flex justify-content-between align-items-baseline mb-2">
        <div className="fw-semibold">Historial de uso</div>
        {uses.length > 0 && (
          <div className="app-muted small">
            {filtered.length} {filtered.length === 1 ? "salida" : "salidas"}{filtering ? ` de ${uses.length}` : ""}
          </div>
        )}
      </div>
      {uses.length === 0 ? (
        <div className="app-muted small">Todavía no salió.</div>
      ) : (
        <>
          <div className="row g-2 mb-2">
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="uses-person">Quién</label>
              <select id="uses-person" className="form-select form-select-sm" value={person} onChange={change(setPerson)}>
                <option value="">Todos</option>
                {people.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="uses-state">Estado</label>
              <select id="uses-state" className="form-select form-select-sm" value={state} onChange={change(setState)}>
                <option value="">Todos</option>
                <option value="out">Sigue afuera</option>
                <option value="back">Volvió</option>
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="uses-from">Desde</label>
              <input id="uses-from" type="date" className="form-control form-control-sm" value={from} max={to || undefined} onChange={change(setFrom)} />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1" htmlFor="uses-to">Hasta</label>
              <input id="uses-to" type="date" className="form-control form-control-sm" value={to} min={from || undefined} onChange={change(setTo)} />
            </div>
          </div>
          {filtering && (
            <button type="button" className="btn btn-link btn-sm p-0 mb-2" onClick={clear}>Limpiar filtros</button>
          )}
          {filtered.length === 0 ? (
            <div className="app-muted small">No hay salidas con esos filtros.</div>
          ) : (
            groups.map((group) => (
              <div key={group.key || "sin-fecha"} className="mb-3">
                <div className="small fw-semibold text-secondary mb-1">{group.label}</div>
                <ul className="list-group">
                  {group.items.map((use) => (
                    <UseEntry key={use.id} use={use} row={row} />
                  ))}
                </ul>
              </div>
            ))
          )}
          {pages > 1 && (
            <div className="d-flex justify-content-between align-items-center">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                Anterior
              </button>
              <span className="small">Página {current} de {pages}</span>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Detail({ row, isAdmin, onClose, onLeave, onReturn, onPass, onPastUse, onFine, onOpenFine, onSaved, onError }) {
  const [shownNotes, setShownNotes] = useState(3);
  const [note, setNote] = useState("");
  const [noteBy, setNoteBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [kmEdit, setKmEdit] = useState(null);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: row.name || "",
    plate: row.plate || "",
    last_service_at: (row.last_service_at || "").slice(0, 10),
    last_service_km: row.last_service_km ?? "",
    next_service_km: row.next_service_km ?? "",
    is_broken: Boolean(row.is_broken),
    damage_note: row.damage_note || "",
    in_repair: Boolean(row.in_repair),
  });
  const notes = Array.isArray(row.notes) ? row.notes : [];
  const fines = Array.isArray(row.fines) ? row.fines : [];
  const pending = fines.filter((fine) => fineStatus(fine) !== "pagada");
  const paid = fines.filter((fine) => fineStatus(fine) === "pagada");
  const pendingDue = sumFineAmounts(pending);

  const savePhoto = async (file) => {
    if (!file) return;
    setSaving(true);
    try {
      await uploadTransporteImage(row.id, file);
      await onSaved("Quedó la foto.");
    } catch (err) {
      onError(err.message || "No se pudo cargar la foto");
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateTransporte(row.id, {
        name: profile.name.trim(),
        plate: profile.plate.trim(),
        last_service_at: profile.last_service_at || null,
        last_service_km: optionalKm(profile.last_service_km),
        next_service_km: optionalKm(profile.next_service_km),
        is_broken: profile.is_broken,
        damage_note: profile.damage_note.trim(),
        in_repair: profile.in_repair,
      });
      await onSaved("Se guardó la ficha.");
    } catch (err) {
      onError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const saveKm = async () => {
    setSaving(true);
    try {
      const km = optionalKm(kmEdit);
      if (km == null) throw new Error("Escribí los kilómetros que tiene");
      await updateTransporteKm(row.id, km);
      setKmEdit(null);
      await onSaved("Quedaron los km.");
    } catch (err) {
      onError(err.message || "No se pudieron guardar los km");
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await addTransporteNote(row.id, { description: note.trim(), observed_by: noteBy.trim() });
      setNote("");
      setNoteBy("");
      await onSaved("Se anotó.");
    } catch (err) {
      onError(err.message || "No se pudo anotar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }} onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">{row.kind === "auto" ? row.plate || row.name : row.name}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <Photo row={row} alt={row.name} />
            {isAdmin && (
              <input
                type="file"
                accept="image/*"
                className="form-control mt-2"
                onChange={(e) => savePhoto(e.target.files?.[0])}
              />
            )}
            <div className="mt-2">{row.name}</div>
            <div className="app-muted small mb-2">{withSince(`${row.place}${row.open_person ? ` · ${row.open_person}` : ""}`, row)}</div>
            {row.kind === "auto" && (
              <>
                {kmEdit == null ? (
                  <div className="d-flex align-items-center gap-2 small">
                    <span>{row.current_km != null ? `Tiene ${formatKm(row.current_km)} km` : "Todavía no tiene km cargados"}</span>
                    <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setKmEdit(row.current_km ?? "")}>
                      Actualizar km
                    </button>
                  </div>
                ) : (
                  <div className="d-flex align-items-center gap-2 my-1" style={{ maxWidth: 360 }}>
                    <NumberInput
                      className="form-control form-control-sm"
                      autoFocus
                      value={kmEdit}
                      placeholder="Km que tiene ahora"
                      onChange={(e) => setKmEdit(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveKm();
                        if (e.key === "Escape") setKmEdit(null);
                      }}
                    />
                    <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={saveKm}>Guardar</button>
                    <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={() => setKmEdit(null)}>Cancelar</button>
                  </div>
                )}
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <KmLine row={row} />
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setPlacesOpen(true)}>
                    Averiguar dónde hacerlo
                  </button>
                </div>
              </>
            )}
            <div className="d-flex flex-wrap gap-2 my-3">
              {!row.out ? (
                <button type="button" className="btn btn-outline-danger" onClick={onLeave}>
                  Salir
                </button>
              ) : (
                <button type="button" className="btn btn-outline-success" onClick={onReturn}>Devolver</button>
              )}
              {canPass(row) && (
                <button type="button" className="btn btn-outline-primary" onClick={onPass}>Pasar</button>
              )}
              {isAdmin && (
                <button type="button" className="btn btn-outline-secondary" onClick={onPastUse}>Cargar uso pasado</button>
              )}
              {isAdmin && row.kind === "auto" && (
                <button type="button" className="btn btn-outline-dark" onClick={onFine}>Multa</button>
              )}
            </div>

            {isAdmin && row.kind === "auto" && (
              <div className="border rounded p-3 mb-3">
                <div className="fw-semibold mb-2">Ficha</div>
                <input className="form-control mb-2" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Nombre" />
                <input className="form-control mb-2" value={profile.plate} onChange={(e) => setProfile({ ...profile, plate: e.target.value })} placeholder="Patente" />
                <label className="form-label mb-1">Último service</label>
                <input type="date" className="form-control mb-2" value={profile.last_service_at} onChange={(e) => setProfile({ ...profile, last_service_at: e.target.value })} />
                <NumberInput className="form-control mb-2" value={profile.last_service_km} onChange={(e) => setProfile({ ...profile, last_service_km: e.target.value })} placeholder="Km del service" />
                <NumberInput className="form-control mb-2" value={profile.next_service_km} onChange={(e) => setProfile({ ...profile, next_service_km: e.target.value })} placeholder="Km del próximo service" />
                <div className="form-check">
                  <input id="auto-roto" type="checkbox" className="form-check-input" checked={profile.is_broken} onChange={(e) => setProfile({ ...profile, is_broken: e.target.checked })} />
                  <label className="form-check-label" htmlFor="auto-roto">Roto</label>
                </div>
                {profile.is_broken && (
                  <textarea className="form-control my-2" rows="2" placeholder="Qué tiene" value={profile.damage_note} onChange={(e) => setProfile({ ...profile, damage_note: e.target.value })} />
                )}
                <div className="form-check mb-2">
                  <input id="auto-arreglo" type="checkbox" className="form-check-input" checked={profile.in_repair} onChange={(e) => setProfile({ ...profile, in_repair: e.target.checked })} />
                  <label className="form-check-label" htmlFor="auto-arreglo">Lo llevaron a arreglar</label>
                </div>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={saveProfile}>Guardar ficha</button>
              </div>
            )}

            {isAdmin && row.kind === "carro" && (
              <div className="border rounded p-3 mb-3">
                <input className="form-control mb-2" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Nombre" />
                <button type="button" className="btn btn-primary" disabled={saving} onClick={saveProfile}>Guardar</button>
              </div>
            )}

            {row.kind === "auto" && !isAdmin && (
              <div className="mb-3">
                {row.last_service_at && <div>Último service: {formatWhen(row.last_service_at)}</div>}
                {row.last_service_km != null && <div>Km del service: {row.last_service_km}</div>}
                {row.next_service_km != null && <div>Próximo service: {row.next_service_km} km</div>}
                {row.is_broken && <div>Roto{row.damage_note ? `: ${row.damage_note}` : ""}</div>}
                {row.in_repair && <div>Lo llevaron a arreglar</div>}
              </div>
            )}

            {row.kind === "auto" && (
              <div className="mb-3">
                <div className="fw-semibold">Notas</div>
                {notes.length === 0 && <div className="app-muted small">No hay notas.</div>}
                <ul className="list-unstyled mb-2">
                  {notes.slice(0, shownNotes).map((entry) => (
                    <li key={entry.id} className="mb-2">
                      <div>{entry.description}</div>
                      <div className="app-muted small">{formatWhen(entry.created_at)}{entry.observed_by ? ` · ${entry.observed_by}` : ""}</div>
                    </li>
                  ))}
                </ul>
                {notes.length > shownNotes && (
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShownNotes((count) => count + 5)}>Ver más</button>
                )}
                {isAdmin && (
                  <div className="d-flex flex-column gap-2 mt-2">
                    <input className="form-control" placeholder="Nota" value={note} onChange={(e) => setNote(e.target.value)} />
                    <input className="form-control" placeholder="Quién la anotó. Vacío: fuiste vos" value={noteBy} onChange={(e) => setNoteBy(e.target.value)} />
                    <button type="button" className="btn btn-outline-primary align-self-start" disabled={saving || !note.trim()} onClick={saveNote}>Anotar</button>
                  </div>
                )}
              </div>
            )}

            {row.kind === "auto" && (
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-semibold">Multas</div>
                    {pending.length > 0 && (
                      <div className="small app-muted">Hay que poner {pendingDue > 0 ? formatPesos(pendingDue) : "sin precios"}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={onFine}>Cargar</button>
                  )}
                </div>
                {fines.length === 0 && <div className="app-muted small">No hay.</div>}
                {pending.map((fine) => (
                  <FineSummaryRow key={fine.id} fine={fine} onOpen={() => onOpenFine?.(fine)} />
                ))}
                {paid.length > 0 && <div className="fw-semibold small mt-2">Pagadas</div>}
                {paid.map((fine) => (
                  <FineSummaryRow key={fine.id} fine={fine} onOpen={() => onOpenFine?.(fine)} />
                ))}
              </div>
            )}

            <UseHistory row={row} />
          </div>
        </div>
      </div>
      {placesOpen && (
        <ServicePlacesModal
          row={row}
          isAdmin={isAdmin}
          onClose={() => setPlacesOpen(false)}
          onSaved={onSaved}
          onError={onError}
        />
      )}
    </div>
  );
}

const EMPTY_PLACE = { name: "", phone: "", address: "", website: "" };

function PlaceForm({ initial, saving, onSubmit, onCancel }) {
  const [place, setPlace] = useState({ ...EMPTY_PLACE, ...initial });
  const set = (field) => (e) => setPlace({ ...place, [field]: e.target.value });
  return (
    <form
      className="border rounded p-2 mb-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: place.name.trim(),
          phone: place.phone.trim(),
          address: place.address.trim(),
          website: place.website.trim(),
        });
      }}
    >
      <input className="form-control form-control-sm mb-2" placeholder="Nombre" value={place.name} onChange={set("name")} required />
      <input className="form-control form-control-sm mb-2" placeholder="Teléfono" inputMode="tel" value={place.phone} onChange={set("phone")} />
      <input className="form-control form-control-sm mb-2" placeholder="Dirección" value={place.address} onChange={set("address")} />
      <input className="form-control form-control-sm mb-2" placeholder="Página web (opcional)" value={place.website} onChange={set("website")} />
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !place.name.trim()}>Guardar</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" disabled={saving} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

function ServicePlacesModal({ row, isAdmin, onClose, onSaved, onError }) {
  const places = Array.isArray(row.service_places) ? row.service_places : [];
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const run = async (action, message) => {
    setSaving(true);
    try {
      await action();
      setEditingId(null);
      setAdding(false);
      await onSaved(message);
    } catch (err) {
      onError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const share = () => {
    const text = serviceMessage(row, places);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">Dónde hacer el service · {row.plate || row.name}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="small app-muted mb-3">
              {row.last_service_km != null ? `Último service a los ${formatKm(row.last_service_km)} km. ` : ""}
              {row.next_service_km != null ? `El próximo antes de los ${formatKm(row.next_service_km)} km.` : ""}
            </div>
            {places.length === 0 && !adding && (
              <p className="app-muted">
                {isAdmin ? "Todavía no cargaste lugares para este auto." : "Todavía no hay lugares cargados. Pedile a un admin que los cargue."}
              </p>
            )}
            {places.map((place) => (
              editingId === place.id ? (
                <PlaceForm
                  key={place.id}
                  initial={place}
                  saving={saving}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(data) => run(() => updateServicePlace(place.id, data), "Quedó el lugar.")}
                />
              ) : (
                <div key={place.id} className="border rounded p-2 mb-2">
                  <div className="fw-semibold">{place.name}</div>
                  {place.phone && (
                    <div className="small">Teléfono: <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`}>{place.phone}</a></div>
                  )}
                  {place.address && (
                    <div className="small">
                      Dirección:{" "}
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address)}`} target="_blank" rel="noreferrer">
                        {place.address}
                      </a>
                    </div>
                  )}
                  {place.website && (
                    <div className="small">
                      Web: <a href={webHref(place.website)} target="_blank" rel="noreferrer">{place.website}</a>
                    </div>
                  )}
                  {isAdmin && (
                    <div className="d-flex gap-2 mt-1">
                      <button type="button" className="btn btn-link btn-sm p-0" disabled={saving} onClick={() => { setAdding(false); setEditingId(place.id); }}>Editar</button>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 text-danger"
                        disabled={saving}
                        onClick={() => {
                          if (window.confirm(`¿Sacar ${place.name}?`)) {
                            run(() => deleteServicePlace(place.id), "Se sacó el lugar.");
                          }
                        }}
                      >
                        Sacar
                      </button>
                    </div>
                  )}
                </div>
              )
            ))}
            {isAdmin && (adding ? (
              <PlaceForm
                initial={EMPTY_PLACE}
                saving={saving}
                onCancel={() => setAdding(false)}
                onSubmit={(data) => run(() => addServicePlace(row.id, data), "Quedó el lugar.")}
              />
            ) : (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => { setEditingId(null); setAdding(true); }}>
                Agregar lugar
              </button>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
            <button type="button" className="btn btn-success" disabled={places.length === 0} onClick={share}>
              <i className="bi bi-whatsapp me-1"></i>Compartir por WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FineSummaryRow({ fine, onOpen }) {
  const meta = fineStatusMeta(fine);
  const dueSoon = fineDueSoon(fine);
  return (
    <div className={`fine-row${dueSoon ? " text-danger" : ""}`}>
      <span>{formatWhen(fine.occurred_at)}</span>
      <span>{fine.person || "Falta quién"}</span>
      {fine.lugar_infraccion && <span className={dueSoon ? "" : "app-muted"}>{fine.lugar_infraccion}</span>}
      {fine.due_at && <span className={dueSoon ? "fw-semibold" : "app-muted"}>Vence {formatDay(fine.due_at)}</span>}
      {fine.claim_reason && <span className="app-muted" title={fine.claim_reason}>Motivo: {fine.claim_reason}</span>}
      <FineFile fine={fine} compact />
      <span className={`badge ${meta.badge}`}>{meta.label}</span>
      <span>{formatPesos(fine.amount)}</span>
      <button type="button" className="btn btn-sm btn-link p-0 ms-auto" onClick={onOpen}>Ver</button>
    </div>
  );
}

function draftFromFine(fine) {
  return {
    person: fine.person || "",
    status: fineStatus(fine),
    amount: fine.amount == null ? "" : String(fine.amount),
    voluntary: fine.voluntary === true ? "yes" : fine.voluntary === false ? "no" : "",
    lugar: fine.lugar_infraccion || "",
    acta: fine.acta || "",
    infraccion: fine.infraccion || "",
    municipal_section: fine.municipal_section || "",
    issued: isoToDateText(fine.issued_at),
    due: isoToDateText(fine.due_at),
    reason: fine.claim_reason || "",
  };
}

function FineDetailModal({ fine, isAdmin, onClose, onChange, onRefresh }) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFromFine(fine));
  const [matches, setMatches] = useState(null);
  const [choice, setChoice] = useState("");
  const [candidates, setCandidates] = useState([]);
  const meta = fineStatusMeta(fine);
  const dueSoon = fineDueSoon(fine);

  useEffect(() => {
    setDraft(draftFromFine(fine));
  }, [fine]);

  const setField = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  const save = async () => {
    const amountText = String(draft.amount ?? "").trim();
    let amount = null;
    if (amountText !== "") {
      amount = Number(amountText);
      if (!Number.isFinite(amount) || amount < 0) {
        setNotice({ type: "error", text: "El precio tiene que ser un número" });
        return;
      }
      amount = Math.round(amount);
    }
    let issuedAt;
    let dueAt;
    try {
      issuedAt = dateTextToIso(draft.issued, "La emisión");
      dueAt = dateTextToIso(draft.due, "El vencimiento");
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Revisá las fechas" });
      return;
    }
    const reason = String(draft.reason || "").trim();
    if (draft.status === "a_reclamar" && !reason) {
      setNotice({ type: "error", text: "Indicá el motivo del reclamo" });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const next = await updateFine(fine.id, {
        person: draft.person,
        status: draft.status,
        amount,
        voluntary: draft.voluntary === "yes" ? true : draft.voluntary === "no" ? false : null,
        lugar_infraccion: draft.lugar,
        acta: draft.acta,
        infraccion: draft.infraccion,
        municipal_section: draft.municipal_section,
        issued_at: issuedAt,
        due_at: dueAt,
        claim_reason: reason,
      });
      await onRefresh?.(next);
      setSavedOpen(true);
    } catch (err) {
      setNotice({ type: "error", text: err.message || "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  const searchDriver = async () => {
    setSaving(true);
    setMatches(null);
    setChoice("");
    setNotice(null);
    try {
      const data = await lookupFine(fine.transport_id, fine.occurred_at);
      const found = Array.isArray(data?.matches) ? data.matches : [];
      setMatches(found);
      if (found.length === 1) {
        setChoice(String(found[0].id));
        setDraft((current) => ({ ...current, person: found[0].person }));
      }
    } catch (err) {
      setNotice({ type: "error", text: err.message || "No se pudo buscar" });
    } finally {
      setSaving(false);
    }
  };

  const pickMatch = (item) => {
    setChoice(String(item.id));
    setDraft((current) => ({ ...current, person: item.person }));
  };

  const consult = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const data = await consultRosario(fine.id, {});
      if (data?.fine) onChange(data.fine);
      if (data?.matched) {
        setCandidates([]);
        await onRefresh?.(data.fine);
        setNotice({ type: "ok", text: "Quedaron los datos de Rosario." });
      } else {
        const rows = Array.isArray(data?.candidates) ? data.candidates : [];
        setCandidates(rows);
        setNotice({
          type: rows.length ? "ok" : "error",
          text: rows.length
            ? "Hay varias actas. Elegí una o cargá los datos a mano."
            : "Rosario no trajo un acta para esa fecha. Cargá los datos a mano.",
        });
      }
    } catch (err) {
      setCandidates([]);
      setNotice({
        type: "error",
        text: `${err.message || "No se pudo consultar Rosario"} Cargá precio, ubicación y el resto a mano.`,
      });
    } finally {
      setSaving(false);
    }
  };

  const applyCandidate = async (hit) => {
    setSaving(true);
    setNotice(null);
    try {
      const data = await consultRosario(fine.id, { apply: true, ...hit });
      setCandidates([]);
      await onRefresh?.(data.fine);
      setNotice({ type: "ok", text: "Quedó el acta." });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "No se pudo usar esa acta" });
    } finally {
      setSaving(false);
    }
  };

  const replaceFile = async (file) => {
    setSaving(true);
    setNotice(null);
    try {
      await uploadFineFile(fine.id, file);
      const next = await updateFine(fine.id, {});
      await onRefresh?.(next);
      setNotice({ type: "ok", text: "Quedó el archivo." });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "No se pudo actualizar el archivo" });
    } finally {
      setSaving(false);
    }
  };

  const consulted = fine.consulted_at ? formatWhen(fine.consulted_at) : "";

  return (
    <>
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1080 }} onClick={onClose}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">Multa {fine.plate || ""}</h5>
            <button type="button" className="btn-close ms-auto" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {notice && (
              <div className={`alert ${notice.type === "ok" ? "alert-success" : "alert-warning"} py-2`} role="status">
                {notice.text}
              </div>
            )}
            <div className="row g-3">
              <div className="col-md-6">
                <div className="form-label">Fecha</div>
                <div>{formatWhen(fine.occurred_at)}</div>
              </div>
              <div className="col-md-6">
                <div className="form-label">Auto</div>
                <div>{fine.plate}{fine.name ? ` · ${fine.name}` : ""}</div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Estado</label>
                {isAdmin ? (
                  <select className="form-select" value={draft.status} disabled={saving} onChange={(e) => setField("status")(e.target.value)}>
                    {FINE_STATUSES.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <div><span className={`badge ${meta.badge}`}>{meta.label}</span></div>
                )}
              </div>
              {draft.status === "a_reclamar" && (
                <div className="col-12">
                  <label className="form-label">Motivo del reclamo</label>
                  {isAdmin ? (
                    <textarea
                      className="form-control"
                      rows={2}
                      value={draft.reason}
                      disabled={saving}
                      onChange={(e) => setField("reason")(e.target.value)}
                      placeholder="Por qué se va a reclamar"
                    />
                  ) : (
                    <div>{fine.claim_reason || "—"}</div>
                  )}
                </div>
              )}
              <div className="col-md-6">
                <label className="form-label">Precio</label>
                {isAdmin ? (
                  <NumberInput className="form-control" value={draft.amount} min={0} disabled={saving} onChange={(e) => setField("amount")(e.target.value)} placeholder="0" />
                ) : (
                  <div>{formatPesos(fine.amount)}</div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label">Pago voluntario</label>
                {isAdmin ? (
                  <select className="form-select" value={draft.voluntary} disabled={saving} onChange={(e) => setField("voluntary")(e.target.value)}>
                    <option value="">Sin dato</option>
                    <option value="yes">Sí</option>
                    <option value="no">No</option>
                  </select>
                ) : (
                  <div>{voluntaryLabel(fine.voluntary)}</div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label">Emisión</label>
                {isAdmin ? (
                  <input
                    className="form-control"
                    inputMode="decimal"
                    placeholder="15/10/2026"
                    value={draft.issued}
                    disabled={saving}
                    onFocus={selectDatePart}
                    onClick={selectDatePart}
                    onChange={(e) => setField("issued")(e.target.value)}
                    onBlur={() => setField("issued")(formatDateText(draft.issued))}
                  />
                ) : (
                  <div>{formatDay(fine.issued_at)}</div>
                )}
              </div>
              <div className="col-md-6">
                <label className={`form-label${dueSoon ? " text-danger" : ""}`}>Vencimiento</label>
                {isAdmin ? (
                  <>
                    <input
                      className={`form-control${dueSoon ? " text-danger" : ""}`}
                      inputMode="decimal"
                      placeholder="30/10/2026"
                      value={draft.due}
                      disabled={saving}
                      onFocus={selectDatePart}
                      onClick={selectDatePart}
                      onChange={(e) => setField("due")(e.target.value)}
                      onBlur={() => setField("due")(formatDateText(draft.due))}
                    />
                    <div className={`form-text${dueSoon ? " text-danger" : ""}`}>
                      {dueSoon ? "Faltan menos de 10 días. Ahí se termina el pago voluntario." : "Ahí se termina el pago voluntario."}
                    </div>
                  </>
                ) : (
                  <div className={dueSoon ? "text-danger fw-semibold" : undefined}>{formatDay(fine.due_at)}</div>
                )}
              </div>
              <div className="col-12">
                <label className="form-label">Ubicación</label>
                {isAdmin ? (
                  <input className="form-control" value={draft.lugar} disabled={saving} onChange={(e) => setField("lugar")(e.target.value)} placeholder="Dónde se hizo la multa" />
                ) : (
                  <div>{fine.lugar_infraccion || "—"}</div>
                )}
              </div>
              <div className="col-12">
                <label className="form-label">Persona</label>
                {isAdmin ? (
                  <>
                    <PersonPicker value={draft.person} onChange={setField("person")} disabled={saving} />
                    <button type="button" className="btn btn-link btn-sm p-0 mt-1" disabled={saving} onClick={searchDriver}>
                      Buscar quién lo manejaba en esa fecha
                    </button>
                    {matches && matches.length === 1 && (
                      <div className="small mt-1">En ese momento manejaba {matches[0].person}.</div>
                    )}
                    {matches && matches.length > 1 && (
                      <div className="mt-2">
                        {matches.map((item) => (
                          <div className="form-check" key={item.id}>
                            <input
                              id={`detail-fine-${item.id}`}
                              type="radio"
                              className="form-check-input"
                              name="detail-fine-person"
                              checked={choice === String(item.id)}
                              onChange={() => pickMatch(item)}
                            />
                            <label className="form-check-label" htmlFor={`detail-fine-${item.id}`}>{item.person}</label>
                          </div>
                        ))}
                      </div>
                    )}
                    {matches && matches.length === 0 && (
                      <div className="small text-danger mt-1">En ese momento no hay nadie cargado. Completalo a mano.</div>
                    )}
                  </>
                ) : (
                  <div>{fine.person || "Falta quién la manejaba"}</div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label">Acta</label>
                {isAdmin ? (
                  <input className="form-control" value={draft.acta} disabled={saving} onChange={(e) => setField("acta")(e.target.value)} />
                ) : (
                  <div>{fine.acta || "—"}</div>
                )}
              </div>
              <div className="col-md-6">
                <label className="form-label">En Rosario</label>
                {isAdmin ? (
                  <input className="form-control" value={draft.municipal_section} disabled={saving} onChange={(e) => setField("municipal_section")(e.target.value)} placeholder="Sin juzgar, etc." />
                ) : (
                  <div>{fine.municipal_section || "—"}</div>
                )}
              </div>
              <div className="col-12">
                <label className="form-label">Infracción</label>
                {isAdmin ? (
                  <input className="form-control" value={draft.infraccion} disabled={saving} onChange={(e) => setField("infraccion")(e.target.value)} />
                ) : (
                  <div>{fine.infraccion || "—"}</div>
                )}
              </div>
              <div className="col-12">
                <div className="form-label">Archivo</div>
                <FineFile fine={fine} canEdit={isAdmin} busy={saving} onReplace={replaceFile} />
              </div>
            </div>
            {consulted && <div className="app-muted small mt-3">Última consulta a Rosario: {consulted}</div>}
            {isAdmin && (
              <button type="button" className="btn btn-outline-primary mt-3" disabled={saving} onClick={consult}>
                {saving ? "Consultando…" : "Consultar Rosario"}
              </button>
            )}
            {candidates.length > 0 && (
              <div className="mt-3">
                <div className="fw-semibold mb-2">Elegí el acta</div>
                {candidates.map((hit) => (
                  <div key={`${hit.acta}-${hit.occurred_at}`} className="border rounded p-2 mb-2">
                    <div>{hit.acta || "Sin acta"} · {hit.occurred_display || formatWhen(hit.occurred_at)}</div>
                    {hit.infraccion && <div className="small">{hit.infraccion}</div>}
                    {hit.lugar && <div className="small">{hit.lugar}</div>}
                    <div className="small">
                      {formatPesos(hit.amount)} · Voluntario: {voluntaryLabel(hit.voluntary)}
                      {hit.due_at ? ` · Vence ${formatDay(hit.due_at)}` : ""}
                    </div>
                    {isAdmin && (
                      <button type="button" className="btn btn-sm btn-primary mt-1" disabled={saving} onClick={() => applyCandidate(hit)}>
                        Usar esta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cerrar</button>
            {isAdmin && (
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    <FeedbackModal
      open={savedOpen}
      type="success"
      message="Se guardó."
      zIndex={1090}
      onClose={() => setSavedOpen(false)}
    />
    </>
  );
}

function ClaimReasonModal({ fine, onClose, onSave }) {
  const [reason, setReason] = useState(fine.claim_reason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const text = String(reason || "").trim();
    if (!text) {
      setError("Indicá el motivo del reclamo");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(text);
    } catch (err) {
      setError(err.message || "No se pudo guardar el motivo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">Motivo del reclamo</h5>
            <button type="button" className="btn-close ms-auto" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-warning py-2">{error}</div>}
            <p className="small mb-2">{fine.plate || fine.name || "Esta multa"} pasa a <strong>A reclamar</strong>. Comentá por qué.</p>
            <textarea
              className="form-control"
              rows={3}
              value={reason}
              disabled={saving}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              placeholder="Por qué se va a reclamar"
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoveModal({ move, carts, autosOut, onClose, onDone, onError }) {
  const suggested = nowParts();
  const [person, setPerson] = useState("");
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState(suggested.time);
  const [km, setKm] = useState("");
  const [cartId, setCartId] = useState("");
  const [external, setExternal] = useState("");
  const [vehicle, setVehicle] = useState(autosOut.length ? "nuestro" : "afuera");
  const [autoId, setAutoId] = useState("");
  const [obra, setObra] = useState("");
  const [obras, setObras] = useState([]);
  const [cartToo, setCartToo] = useState(true);
  const [saving, setSaving] = useState(false);
  const leaving = move.action === "leave";
  const passing = move.action === "handover";
  const cartLeaving = leaving && move.kind === "carro";
  const withOurs = cartLeaving && vehicle === "nuestro";
  const soloObra = cartLeaving && vehicle === "obra";

  useEffect(() => {
    if (!cartLeaving) return undefined;
    let cancelled = false;
    getObras()
      .then((data) => {
        if (!cancelled) setObras(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setObras([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cartLeaving]);
  const chosenAuto = autosOut.find((row) => String(row.id) === autoId);
  const returnRow = move.action === "return" && move.kind === "auto" ? move.row : null;
  const passRow = passing ? move.row : null;
  const passCart = passRow?.kind === "auto" ? passRow.with_name : "";
  const title = leaving
    ? (move.kind === "auto" ? "Salir" : "Salir con el carro")
    : passing
      ? (move.kind === "auto" ? "Pasar el auto" : "Pasar el carro")
      : "Devolver";

  const pickAuto = (value) => {
    setAutoId(value);
    const auto = autosOut.find((row) => String(row.id) === value);
    if (auto?.open_person && !person.trim()) setPerson(auto.open_person);
  };

  const submit = async (event) => {
    event.preventDefault();
    if ((leaving || passing) && !soloObra && !person.trim()) {
      onError(passing ? "Indicá quién lo agarra" : "Indicá quién lo lleva");
      return;
    }
    if (soloObra && !obra.trim()) {
      onError("Elegí la obra");
      return;
    }
    if (withOurs && !chosenAuto) {
      onError("Elegí con qué auto sale");
      return;
    }
    let when;
    try {
      when = toIso(date, time);
    } catch (err) {
      onError(err.message);
      return;
    }
    setSaving(true);
    try {
      const kilometers = optionalKm(km);
      if (leaving) {
        await leaveTransporte(move.id, {
          person: soloObra ? "" : person.trim(),
          left_at: when,
          km: kilometers,
          ...(move.kind === "auto" && cartId ? { cart_id: Number(cartId) } : {}),
          ...(cartLeaving && withOurs ? { with_transport_id: chosenAuto.id } : {}),
          ...(cartLeaving && !withOurs && !soloObra ? { external_vehicle: external.trim() } : {}),
          ...(soloObra ? { obra: obra.trim() } : {}),
        });
        if (move.kind === "auto") await onDone("Salió.");
        else if (soloObra) await onDone(`Quedó en ${obra.trim()}.`);
        else await onDone(withOurs ? `Salió con ${chosenAuto.plate || chosenAuto.name}.` : "Salió con el auto de afuera.");
      } else if (passing) {
        const result = await handOverTransporte(move.id, {
          person: person.trim(),
          at: when,
          km: kilometers,
          cart_too: cartToo,
        });
        await onDone(`Ahora lo tiene ${person.trim()}${result?.cart_passed ? ", con el carro" : ""}.`);
      } else {
        const result = await returnTransporte(move.id, { returned_at: when, km: kilometers, cart_too: cartToo });
        await onDone(result?.cart_returned ? "Volvieron el auto y el carro." : "Volvió.");
      }
    } catch (err) {
      onError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title mb-0">{title}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {cartLeaving && (
              <div className="mb-3">
                <label className="form-label">Con qué auto sale</label>
                <div className="form-check">
                  <input
                    id="carro-nuestro"
                    type="radio"
                    className="form-check-input"
                    checked={vehicle === "nuestro"}
                    disabled={!autosOut.length}
                    onChange={() => setVehicle("nuestro")}
                  />
                  <label className="form-check-label" htmlFor="carro-nuestro">Un auto nuestro que ya está afuera</label>
                </div>
                <div className="form-check">
                  <input id="carro-afuera" type="radio" className="form-check-input" checked={vehicle === "afuera"} onChange={() => setVehicle("afuera")} />
                  <label className="form-check-label" htmlFor="carro-afuera">Un auto de afuera</label>
                </div>
                <div className="form-check">
                  <input id="carro-obra" type="radio" className="form-check-input" checked={vehicle === "obra"} onChange={() => setVehicle("obra")} />
                  <label className="form-check-label" htmlFor="carro-obra">Solo la obra</label>
                </div>
                {!autosOut.length && (
                  <div className="form-text">No hay autos nuestros afuera sin carro. Si sale junto con un auto, usá Salir en el auto y elegí el carro.</div>
                )}
                {withOurs && (
                  <select className="form-select mt-2" value={autoId} onChange={(e) => pickAuto(e.target.value)}>
                    <option value="">Elegí el auto</option>
                    {autosOut.map((auto) => (
                      <option key={auto.id} value={auto.id}>
                        {auto.plate || auto.name}{auto.open_person ? ` · lo tiene ${auto.open_person}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {!withOurs && !soloObra && (
                  <input className="form-control mt-2" value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Patente o de quién es" required />
                )}
                {soloObra && (
                  <div className="mt-2">
                    <ObraPicker obras={obras} value={obra} onChange={setObra} />
                  </div>
                )}
              </div>
            )}
            {passRow && (
              <p className="mb-3">
                Lo tiene <strong>{passRow.open_person || "alguien"}</strong>
                {passRow.open_left_at ? ` desde ${formatWhen(passRow.open_left_at)}` : ""}. No hace falta devolverlo: se lo pasa a otro.
              </p>
            )}
            {(leaving || passing) && !soloObra && (
              <div className="mb-3">
                <label className="form-label">{passing ? "Quién lo agarra" : "Quién lo lleva"}</label>
                <PersonPicker value={person} onChange={setPerson} />
              </div>
            )}
            <div className="mb-3">
              <WhenFields date={date} time={time} onDate={setDate} onTime={setTime} />
            </div>
            {move.kind === "auto" && (
              <div className="mb-3">
                <label className="form-label">Kilómetros</label>
                <NumberInput className="form-control" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Opcional" />
                <div className="form-text">Si los ponés, quedan como los km que tiene el auto.</div>
              </div>
            )}
            {leaving && move.kind === "auto" && (
              <div className="mb-3">
                <label className="form-label">Carro</label>
                <select className="form-select" value={cartId} onChange={(e) => setCartId(e.target.value)}>
                  <option value="">Sin carro</option>
                  {carts.map((cart) => (
                    <option key={cart.id} value={cart.id}>{cart.name}</option>
                  ))}
                </select>
              </div>
            )}
            {returnRow?.with_name && (
              returnRow.joined_cart_id ? (
                <div className="form-check">
                  <input id="carro-vuelve" type="checkbox" className="form-check-input" checked={cartToo} onChange={(e) => setCartToo(e.target.checked)} />
                  <label className="form-check-label" htmlFor="carro-vuelve">También volvió el carro {returnRow.with_name}</label>
                </div>
              ) : (
                <div className="form-text">Vuelve también el carro {returnRow.with_name}, porque salieron juntos.</div>
              )
            )}
            {passCart && (
              <>
                <div className="form-check">
                  <input id="carro-pasa" type="checkbox" className="form-check-input" checked={cartToo} onChange={(e) => setCartToo(e.target.checked)} />
                  <label className="form-check-label" htmlFor="carro-pasa">El carro {passCart} también pasa</label>
                </div>
                {!cartToo && <div className="form-text">El carro {passCart} vuelve al depósito a esa hora.</div>}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PAST_HINT = "Para las 8:00 alcanza con 800 o 8, y para el 15/10 con 15.10.";

function PastUseModal({ row, carts, autos, onClose, onDone, onError }) {
  const today = nowParts().date;
  const [person, setPerson] = useState("");
  const [leftDate, setLeftDate] = useState(today);
  const [leftTime, setLeftTime] = useState("");
  const [backDate, setBackDate] = useState(today);
  const [backTime, setBackTime] = useState("");
  const [km, setKm] = useState("");
  const [cartId, setCartId] = useState("");
  const [vehicle, setVehicle] = useState("nuestro");
  const [autoId, setAutoId] = useState("");
  const [external, setExternal] = useState("");
  const [saving, setSaving] = useState(false);
  const isAuto = row.kind === "auto";
  const otherCarts = carts.filter((cart) => cart.id !== row.id);

  const changeLeftDate = (value) => {
    if (backDate === leftDate) setBackDate(value);
    setLeftDate(value);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!person.trim()) {
      onError("Indicá quién lo tuvo");
      return;
    }
    if (!isAuto && vehicle === "nuestro" && !autoId) {
      onError("Elegí con qué auto salió");
      return;
    }
    let leftAt;
    let returnedAt;
    let kilometers;
    try {
      leftAt = toIso(leftDate, leftTime);
      returnedAt = toIso(backDate, backTime);
      kilometers = optionalKm(km);
    } catch (err) {
      onError(err.message);
      return;
    }
    if (returnedAt <= leftAt) {
      onError("La vuelta tiene que ser después de la salida");
      return;
    }
    setSaving(true);
    try {
      await addPastUse(row.id, {
        person: person.trim(),
        left_at: leftAt,
        returned_at: returnedAt,
        ...(isAuto ? { km: kilometers } : {}),
        ...(isAuto && cartId ? { cart_id: Number(cartId) } : {}),
        ...(!isAuto && vehicle === "nuestro" ? { with_transport_id: Number(autoId) } : {}),
        ...(!isAuto && vehicle === "afuera" ? { external_vehicle: external.trim() } : {}),
      });
      await onDone("Quedó cargado el uso.");
    } catch (err) {
      onError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title mb-0">Cargar uso pasado · {row.plate || row.name}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <p className="app-muted small">
              Para anotar un uso que ya terminó. Se puede cargar aunque ahora esté afuera, siempre que no se pise con otro uso.
            </p>
            <div className="mb-3">
              <label className="form-label">Quién lo tuvo</label>
              <PersonPicker value={person} onChange={setPerson} />
            </div>
            <div className="border rounded p-2 mb-3">
              <div className="fw-semibold mb-1">Salió</div>
              <WhenFields date={leftDate} time={leftTime} onDate={changeLeftDate} onTime={setLeftTime} hint="" />
            </div>
            <div className="border rounded p-2 mb-3">
              <div className="fw-semibold mb-1">Volvió</div>
              <WhenFields date={backDate} time={backTime} onDate={setBackDate} onTime={setBackTime} hint={PAST_HINT} />
            </div>
            {isAuto ? (
              <>
                <div className="mb-3">
                  <label className="form-label">Kilómetros al volver</label>
                  <NumberInput className="form-control" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Opcional" />
                  <div className="form-text">Solo cambian los km del auto si son más de los que tiene.</div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Carro</label>
                  <select className="form-select" value={cartId} onChange={(e) => setCartId(e.target.value)}>
                    <option value="">Sin carro</option>
                    {otherCarts.map((cart) => (
                      <option key={cart.id} value={cart.id}>{cart.name}</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="mb-3">
                <label className="form-label">Con qué auto salió</label>
                <div className="form-check">
                  <input id="pasado-nuestro" type="radio" className="form-check-input" checked={vehicle === "nuestro"} onChange={() => setVehicle("nuestro")} />
                  <label className="form-check-label" htmlFor="pasado-nuestro">Un auto nuestro</label>
                </div>
                <div className="form-check">
                  <input id="pasado-afuera" type="radio" className="form-check-input" checked={vehicle === "afuera"} onChange={() => setVehicle("afuera")} />
                  <label className="form-check-label" htmlFor="pasado-afuera">Un auto de afuera</label>
                </div>
                {vehicle === "nuestro" ? (
                  <select className="form-select mt-2" value={autoId} onChange={(e) => setAutoId(e.target.value)}>
                    <option value="">Elegí el auto</option>
                    {autos.map((auto) => (
                      <option key={auto.id} value={auto.id}>{auto.plate || auto.name}</option>
                    ))}
                  </select>
                ) : (
                  <input className="form-control mt-2" value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Patente o de quién es" required />
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateModal({ kind, onClose, onDone, onError }) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createTransporte({
        kind,
        name: name.trim(),
        ...(kind === "auto" ? { plate: plate.trim() } : {}),
      });
      if (file) await uploadTransporteImage(created.id, file);
      await onDone(kind === "auto" ? "Quedó el auto." : "Quedó el carro.");
    } catch (err) {
      onError(err.message || "No se pudo crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <form className="modal-content" onSubmit={submit}>
          <div className="modal-header">
            <h5 className="modal-title mb-0">{kind === "auto" ? "Agregar auto" : "Agregar carro"}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <input className="form-control mb-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required />
            {kind === "auto" && (
              <input className="form-control mb-2" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Patente" required />
            )}
            <input type="file" accept="image/*" className="form-control" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FineModal({ row, autos, onClose, onDone, onError }) {
  const suggested = nowParts();
  const [autoId, setAutoId] = useState(row?.id || "");
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState(suggested.time);
  const [file, setFile] = useState(null);
  const [matches, setMatches] = useState(null);
  const [choice, setChoice] = useState("");
  const [manual, setManual] = useState("");
  const [other, setOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const auto = row || (autos || []).find((item) => item.id === autoId) || null;
  const pickPlate = !row;
  const fileKind = fineFileKind(null, file);

  useEffect(() => {
    if (!file || fileKind === "pdf") {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, fileKind]);

  const resetDriver = () => {
    setMatches(null);
    setChoice("");
    setOther(false);
  };

  const persist = async (payload) => {
    const created = await createFine(auto.id, payload);
    if (file) {
      if (!created?.id) throw new Error("Quedó la multa, pero no se pudo guardar el archivo");
      await uploadFineFile(created.id, file);
    }
  };

  const search = async () => {
    if (!auto) {
      onError("Elegí la patente");
      return;
    }
    let when;
    try {
      when = toIso(date, time);
    } catch (err) {
      onError(err.message);
      return;
    }
    setSaving(true);
    resetDriver();
    try {
      const data = await lookupFine(auto.id, when);
      const found = Array.isArray(data?.matches) ? data.matches : [];
      setMatches(found);
      if (found.length === 1) setChoice(String(found[0].id));
    } catch (err) {
      onError(err.message || "No se pudo buscar");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!auto) {
      onError("Elegí la patente");
      return;
    }
    if (!matches) {
      onError("Buscá primero quién lo manejaba");
      return;
    }
    let when;
    try {
      when = toIso(date, time);
    } catch (err) {
      onError(err.message);
      return;
    }
    setSaving(true);
    try {
      if (matches.length === 0) {
        await persist({ occurred_at: when, person: manual.trim() });
      } else if (other) {
        if (!manual.trim()) {
          onError("Escribí el nombre completo");
          return;
        }
        await persist({ occurred_at: when, person: manual.trim() });
      } else if (matches.length === 1) {
        await persist({ occurred_at: when, person: matches[0].person, use_id: matches[0].id });
      } else {
        const picked = matches.find((item) => String(item.id) === choice);
        if (!picked) {
          onError("Elegí quién la hizo");
          return;
        }
        await persist({ occurred_at: when, person: picked.person, use_id: picked.id });
      }
      const pendingName = matches.length === 0 && !manual.trim();
      await onDone(pendingName ? "Quedó la multa. Falta completar quién la manejaba." : "Quedó la multa.");
    } catch (err) {
      onError(err.message || "No se pudo cargar la multa");
    } finally {
      setSaving(false);
    }
  };

  const foundOne = matches && matches.length === 1 ? matches[0] : null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1070 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">{auto?.plate ? `Multa ${auto.plate}` : "Cargar multa"}</h5>
            <button type="button" className="btn-close ms-auto" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <label className="form-label">Patente</label>
            {pickPlate ? (
              <div className="mb-3">
                <PlatePicker
                  autos={autos}
                  value={autoId}
                  disabled={saving}
                  onChange={(id) => {
                    setAutoId(id);
                    resetDriver();
                  }}
                />
              </div>
            ) : (
              <input className="form-control mb-3" value={auto?.plate || ""} readOnly />
            )}
            <div className="mb-3">
              <WhenFields
                date={date}
                time={time}
                onDate={(value) => { setDate(value); resetDriver(); }}
                onTime={(value) => { setTime(value); resetDriver(); }}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Archivo de la multa</label>
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="form-control"
                disabled={saving}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div className="form-text">PDF o foto.</div>
              {fileKind === "pdf" && file && (
                <div className="fine-file-preview mt-2" style={{ width: 88, height: 72 }} title={file.name}>
                  <span className="fine-file-pdf">
                    <i className="bi bi-file-earmark-pdf-fill fs-3"></i>
                    PDF
                  </span>
                </div>
              )}
              {preview && (
                <img
                  src={preview}
                  alt="Vista previa de la multa"
                  className="fine-file-preview mt-2"
                  style={{ width: "auto", height: 120, maxWidth: "100%" }}
                />
              )}
            </div>
            <button type="button" className="btn btn-outline-primary mb-3" disabled={saving || !auto} onClick={search}>Buscar quién lo manejaba</button>
            {matches && matches.length === 0 && (
              <div>
                <p className="text-danger">En ese momento no hay nadie cargado. Buscalo o escribilo a mano. Si no lo sabés ahora, podés guardar la multa igual.</p>
                <PersonPicker value={manual} onChange={setManual} />
              </div>
            )}
            {foundOne && !other && (
              <div>
                <p>El {date.trim()} a las {time.trim()} manejaba {foundOne.person}. ¿Cargamos la multa a su nombre?</p>
                <button type="button" className="btn btn-link p-0" onClick={() => setOther(true)}>Escribir otro</button>
              </div>
            )}
            {foundOne && other && (
              <PersonPicker value={manual} onChange={setManual} />
            )}
            {matches && matches.length > 1 && (
              <div>
                {matches.map((item) => (
                  <div className="form-check" key={item.id}>
                    <input
                      id={`fine-${item.id}`}
                      type="radio"
                      className="form-check-input"
                      name="fine-person"
                      checked={!other && choice === String(item.id)}
                      onChange={() => { setChoice(String(item.id)); setOther(false); }}
                    />
                    <label className="form-check-label" htmlFor={`fine-${item.id}`}>
                      El {date.trim()} a las {time.trim()} manejaba {item.person}. ¿Cargamos la multa a su nombre?
                    </label>
                  </div>
                ))}
                <div className="form-check">
                  <input id="fine-other" type="radio" className="form-check-input" name="fine-person" checked={other} onChange={() => { setOther(true); setChoice(""); }} />
                  <label className="form-check-label" htmlFor="fine-other">Escribir otro</label>
                </div>
                {other && (
                  <div className="mt-2">
                    <PersonPicker value={manual} onChange={setManual} />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={saving || !matches} onClick={save}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Autos;
