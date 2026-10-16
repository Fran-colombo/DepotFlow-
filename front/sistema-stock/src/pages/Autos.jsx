import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import useAuth from "../hooks/useAuth";
import PersonPicker from "../components/PersonPicker";
import FeedbackModal from "../components/FeedbackModal";
import {
  addServicePlace,
  addTransporteNote,
  createFine,
  createTransporte,
  deleteServicePlace,
  getTransporte,
  leaveTransporte,
  listFines,
  listTransportes,
  lookupFine,
  payFine,
  returnTransporte,
  setFinePerson,
  transportImageUrl,
  updateServicePlace,
  updateTransporte,
  updateTransporteKm,
  uploadTransporteImage,
} from "../api/transportes";

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

function toIso(dateText, timeText) {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((dateText || "").trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec((timeText || "").trim());
  if (!dateMatch || !timeMatch) {
    throw new Error("La fecha es día/mes/año y la hora de 00:00 a 23:59");
  }
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) {
    throw new Error("La fecha es día/mes/año y la hora de 00:00 a 23:59");
  }
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    throw new Error("Esa fecha no existe");
  }
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

function WhenFields({ date, time, onDate, onTime }) {
  return (
    <>
      <label className="form-label">Fecha</label>
      <input
        className="form-control mb-2"
        inputMode="numeric"
        placeholder="15/10/2026"
        value={date}
        onChange={(e) => onDate(e.target.value)}
      />
      <label className="form-label">Hora</label>
      <input
        className="form-control"
        inputMode="numeric"
        placeholder="08:43"
        value={time}
        onChange={(e) => onTime(e.target.value)}
      />
      <div className="form-text">Día/mes/año y hora de 00:00 a 23:59. Está puesta la de ahora. Cambiala si lo cargás después.</div>
    </>
  );
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
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [move, setMove] = useState(null);
  const [creating, setCreating] = useState(null);
  const [fining, setFining] = useState(false);
  const [finesOpen, setFinesOpen] = useState(false);
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
  const finePeople = [...new Set(fines.map((fine) => fine.person).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const hasNameless = fines.some((fine) => !fine.person);
  const shownFines = fines.filter((fine) => {
    if (fineScope === "activas" && fine.paid) return false;
    if (finePerson === "__none__") return !fine.person;
    if (finePerson && fine.person !== finePerson) return false;
    return true;
  });
  const activeFineCount = fines.filter((fine) => !fine.paid).length;

  const markListed = async (fine) => {
    try {
      await payFine(fine.id);
      await load();
      if (detailId) await openDetail(detailId);
      tell("success", "Quedó pagada.");
    } catch (err) {
      tell("error", err.message || "No se pudo marcar");
    }
  };

  const tell = (type, message) => setFeedback({ type, message });

  return (
    <Dashboard title="Autos">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Autos</h1>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => setFinesOpen(true)}>
            Ver multas{activeFineCount > 0 ? ` (${activeFineCount})` : ""}
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
                    <div className="app-muted small">{row.place}{row.open_person ? ` · ${row.open_person}` : ""}</div>
                    {row.with_name && <div className="app-muted small">Con {row.with_name}</div>}
                    {row.is_broken && <div className="small text-danger">Roto</div>}
                    {row.in_repair && <div className="small">Lo llevaron a arreglar</div>}
                    {row.current_km != null && <div className="small">Tiene {formatKm(row.current_km)} km</div>}
                    <KmLine row={row} />
                  </div>
                </button>
                <div className="card-footer bg-white border-0 pt-0 d-flex gap-2">
                  {!row.out ? (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setMove({ id: row.id, kind: "auto", action: "leave" })}>
                      Salir
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMove({ id: row.id, kind: "auto", action: "return" })}>
                      Devolver
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
                      {row.place}
                      {row.with_name ? ` · ${row.with_name}` : ""}
                      {row.open_person ? ` · ${row.open_person}` : ""}
                    </div>
                  </div>
                </button>
                <div className="card-footer bg-white border-0 pt-0 d-flex gap-2">
                  {!row.out ? (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setMove({ id: row.id, kind: "carro", action: "leave" })}>
                      Prestar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setMove({ id: row.id, kind: "carro", action: "return" })}>
                      Devolver
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {finesOpen && (
        <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1050 }} onClick={() => setFinesOpen(false)}>
          <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title mb-0">Multas</h5>
                <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setFinesOpen(false)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-2 mb-3">
                  <div className="col-md-6">
                    <label className="form-label">Cuáles</label>
                    <select className="form-select" value={fineScope} onChange={(e) => setFineScope(e.target.value)}>
                      <option value="activas">Activas</option>
                      <option value="todas">Todas</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Persona</label>
                    <select className="form-select" value={finePerson} onChange={(e) => setFinePerson(e.target.value)}>
                      <option value="">Todas</option>
                      {finePeople.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      {hasNameless && <option value="__none__">Sin nombre</option>}
                    </select>
                  </div>
                </div>
                {shownFines.length === 0 ? (
                  <p className="app-muted mb-0">No hay multas con ese filtro.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-bordered align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Patente</th>
                          <th>Auto</th>
                          <th>Persona</th>
                          <th>Estado</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownFines.map((fine) => (
                          <tr key={fine.id}>
                            <td>{formatWhen(fine.occurred_at)}</td>
                            <td>{fine.plate}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-link p-0"
                                onClick={() => {
                                  setFinesOpen(false);
                                  openDetail(fine.transport_id).catch((err) => tell("error", err.message));
                                }}
                              >
                                {fine.name}
                              </button>
                            </td>
                            <td>{fine.person || "Falta quién la manejaba"}</td>
                            <td>{fine.paid ? "Pagada" : "A pagar"}</td>
                            <td>
                              {isAdmin && !fine.paid && (
                                <button type="button" className="btn btn-sm btn-outline-success" onClick={() => markListed(fine)}>Marcar pagada</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
          onReturn={() => setMove({ id: detail.id, kind: detail.kind, action: "return" })}
          onFine={() => setFining(true)}
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
          onClose={() => setMove(null)}
          onDone={async (message) => {
            setMove(null);
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
      {fining && detail?.kind === "auto" && (
        <FineModal
          row={detail}
          onClose={() => setFining(false)}
          onDone={async (message) => {
            setFining(false);
            await refreshDetail();
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

function Detail({ row, isAdmin, onClose, onLeave, onReturn, onFine, onSaved, onError }) {
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
  const pending = fines.filter((fine) => !fine.paid);
  const paid = fines.filter((fine) => fine.paid);

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

  const markPaid = async (fine) => {
    setSaving(true);
    try {
      await payFine(fine.id);
      await onSaved("Quedó pagada.");
    } catch (err) {
      onError(err.message || "No se pudo marcar");
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
            <div className="app-muted small mb-2">{row.place}{row.open_person ? ` · ${row.open_person}` : ""}</div>
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
                    <input
                      className="form-control form-control-sm"
                      inputMode="numeric"
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
            <div className="d-flex gap-2 my-3">
              {!row.out ? (
                <button type="button" className="btn btn-outline-danger" onClick={onLeave}>
                  {row.kind === "auto" ? "Salir" : "Prestar"}
                </button>
              ) : (
                <button type="button" className="btn btn-outline-success" onClick={onReturn}>Devolver</button>
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
                <input className="form-control mb-2" inputMode="numeric" value={profile.last_service_km} onChange={(e) => setProfile({ ...profile, last_service_km: e.target.value })} placeholder="Km del service" />
                <input className="form-control mb-2" inputMode="numeric" value={profile.next_service_km} onChange={(e) => setProfile({ ...profile, next_service_km: e.target.value })} placeholder="Km del próximo service" />
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
                <div className="fw-semibold">Multas a pagar</div>
                {pending.length === 0 && <div className="app-muted small">No hay.</div>}
                <ul className="list-unstyled">
                  {pending.map((fine) => (
                    <PendingFine
                      key={fine.id}
                      fine={fine}
                      isAdmin={isAdmin}
                      saving={saving}
                      onPaid={() => markPaid(fine)}
                      onPerson={async (name) => {
                        setSaving(true);
                        try {
                          await setFinePerson(fine.id, name);
                          await onSaved("Quedó quién la manejaba.");
                        } catch (err) {
                          onError(err.message || "No se pudo completar");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                  ))}
                </ul>
                <div className="fw-semibold">Pagadas</div>
                {paid.length === 0 && <div className="app-muted small">No hay.</div>}
                <ul className="list-unstyled">
                  {paid.map((fine) => (
                    <li key={fine.id}>{formatWhen(fine.occurred_at)} · {fine.person || "Falta quién la manejaba"}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="fw-semibold">Historial</div>
              {(row.uses || []).length === 0 && <div className="app-muted small">Todavía no salió.</div>}
              <ul className="list-unstyled mb-0">
                {(row.uses || []).map((use) => (
                  <li key={use.id} className="mb-2">
                    <div>Salió {formatWhen(use.left_at)} · {use.person}</div>
                    {use.cart_name && <div className="small">Con el carro {use.cart_name}</div>}
                    {use.external_vehicle && <div className="small">Auto de afuera: {use.external_vehicle}</div>}
                    {use.returned_at ? (
                      <div className="small">Volvió {formatWhen(use.returned_at)}{use.km != null ? ` · ${use.km} km` : ""}</div>
                    ) : (
                      <div className="small">Sigue afuera{use.km != null ? ` · ${use.km} km` : ""}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
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

function PendingFine({ fine, isAdmin, saving, onPaid, onPerson }) {
  const [name, setName] = useState("");
  return (
    <li className="mb-3">
      <div className="d-flex justify-content-between gap-2">
        <span>
          {formatWhen(fine.occurred_at)}
          {fine.person ? ` · ${fine.person}` : ""}
        </span>
        {isAdmin && (
          <button type="button" className="btn btn-sm btn-outline-success" disabled={saving} onClick={onPaid}>Marcar pagada</button>
        )}
      </div>
      {!fine.person && (
        <div className="mt-1">
          <div className="small text-danger">Pendiente completar quién la manejaba.</div>
          {isAdmin && (
            <div className="d-flex gap-2 mt-1">
              <div className="flex-grow-1">
                <PersonPicker value={name} onChange={setName} disabled={saving} />
              </div>
              <button type="button" className="btn btn-sm btn-outline-primary" disabled={saving || !name.trim()} onClick={() => onPerson(name.trim())}>Completar</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function MoveModal({ move, carts, onClose, onDone, onError }) {
  const suggested = nowParts();
  const [person, setPerson] = useState("");
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState(suggested.time);
  const [km, setKm] = useState("");
  const [cartId, setCartId] = useState("");
  const [external, setExternal] = useState("");
  const [saving, setSaving] = useState(false);
  const leaving = move.action === "leave";

  const submit = async (event) => {
    event.preventDefault();
    if (leaving && !person.trim()) {
      onError("Indicá quién lo lleva");
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
          person: person.trim(),
          left_at: when,
          km: kilometers,
          ...(move.kind === "auto" && cartId ? { cart_id: Number(cartId) } : {}),
          ...(move.kind === "carro" ? { external_vehicle: external.trim() } : {}),
        });
        await onDone(move.kind === "auto" ? "Salió." : "Quedó prestado.");
      } else {
        await returnTransporte(move.id, { returned_at: when, km: kilometers });
        await onDone("Volvió.");
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
            <h5 className="modal-title mb-0">{leaving ? (move.kind === "auto" ? "Salir" : "Prestar") : "Devolver"}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {leaving && (
              <div className="mb-3">
                <label className="form-label">Quién lo lleva</label>
                <PersonPicker value={person} onChange={setPerson} />
              </div>
            )}
            <div className="mb-3">
              <WhenFields date={date} time={time} onDate={setDate} onTime={setTime} />
            </div>
            {move.kind === "auto" && (
              <div className="mb-3">
                <label className="form-label">Kilómetros</label>
                <input className="form-control" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Opcional" />
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
            {leaving && move.kind === "carro" && (
              <div className="mb-3">
                <label className="form-label">Auto de afuera</label>
                <input className="form-control" value={external} onChange={(e) => setExternal(e.target.value)} placeholder="Patente o de quién es" required />
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

function FineModal({ row, onClose, onDone, onError }) {
  const suggested = nowParts();
  const [date, setDate] = useState(suggested.date);
  const [time, setTime] = useState(suggested.time);
  const [matches, setMatches] = useState(null);
  const [choice, setChoice] = useState("");
  const [manual, setManual] = useState("");
  const [other, setOther] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = async () => {
    let when;
    try {
      when = toIso(date, time);
    } catch (err) {
      onError(err.message);
      return;
    }
    setSaving(true);
    setMatches(null);
    setChoice("");
    setOther(false);
    try {
      const data = await lookupFine(row.id, when);
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
        await createFine(row.id, { occurred_at: when, person: manual.trim() });
      } else if (other) {
        if (!manual.trim()) {
          onError("Escribí el nombre completo");
          return;
        }
        await createFine(row.id, { occurred_at: when, person: manual.trim() });
      } else if (matches.length === 1) {
        await createFine(row.id, { occurred_at: when, person: matches[0].person, use_id: matches[0].id });
      } else {
        const picked = matches.find((item) => String(item.id) === choice);
        if (!picked) {
          onError("Elegí quién la hizo");
          return;
        }
        await createFine(row.id, { occurred_at: when, person: picked.person, use_id: picked.id });
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
    <div className="modal show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1060 }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title mb-0">Multa {row.plate}</h5>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <label className="form-label">Patente</label>
            <input className="form-control mb-3" value={row.plate} readOnly />
            <div className="mb-3">
              <WhenFields
                date={date}
                time={time}
                onDate={(value) => { setDate(value); setMatches(null); }}
                onTime={(value) => { setTime(value); setMatches(null); }}
              />
            </div>
            <button type="button" className="btn btn-outline-primary mb-3" disabled={saving} onClick={search}>Buscar quién lo manejaba</button>
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
