import { apiFetch } from "./client";

export function listTransportes() {
  return apiFetch("/transportes");
}

export function listFines() {
  return apiFetch("/transportes/multas");
}

export function getTransporte(id) {
  return apiFetch(`/transportes/${id}`);
}

export function createTransporte(data) {
  return apiFetch("/transportes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTransporte(id, data) {
  return apiFetch(`/transportes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function sendTransporteToRepair(id, data) {
  return apiFetch(`/transportes/${id}/reparacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function returnTransporteFromRepair(id, data) {
  return apiFetch(`/transportes/${id}/reparacion/volver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function leaveTransporte(id, data) {
  return apiFetch(`/transportes/${id}/salida`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function returnTransporte(id, data) {
  return apiFetch(`/transportes/${id}/devolucion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function handOverTransporte(id, data) {
  return apiFetch(`/transportes/${id}/pase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function addPastUse(id, data) {
  return apiFetch(`/transportes/${id}/uso-pasado`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTransporteKm(id, km) {
  return apiFetch(`/transportes/${id}/km`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ km }),
  });
}

export function addServicePlace(id, data) {
  return apiFetch(`/transportes/${id}/lugares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateServicePlace(placeId, data) {
  return apiFetch(`/transportes/lugares/${placeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteServicePlace(placeId) {
  return apiFetch(`/transportes/lugares/${placeId}`, { method: "DELETE" });
}

export function addTransporteNote(id, data) {
  return apiFetch(`/transportes/${id}/notas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function lookupFine(id, occurredAt) {
  return apiFetch(`/transportes/${id}/multas/buscar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ occurred_at: occurredAt }),
  });
}

export function createFine(id, data) {
  return apiFetch(`/transportes/${id}/multas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function payFine(id) {
  return apiFetch(`/transportes/multas/${id}/pagar`, { method: "POST" });
}

export function updateFine(id, data) {
  return apiFetch(`/transportes/multas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function setFinePerson(id, person) {
  return apiFetch(`/transportes/multas/${id}/persona`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person }),
  });
}

export function consultRosario(id, data = {}) {
  return apiFetch(`/transportes/multas/${id}/rosario`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function listUsesOnDay(fecha, transportId) {
  const params = new URLSearchParams({ fecha });
  if (transportId) params.set("transport_id", String(transportId));
  return apiFetch(`/transportes/usos?${params.toString()}`);
}

export function getUseReport({ persona = "", transportId = "", desde = "", hasta = "" } = {}) {
  const params = new URLSearchParams();
  if (persona) params.set("persona", persona);
  if (transportId) params.set("transport_id", String(transportId));
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const query = params.toString();
  return apiFetch(`/transportes/usos/informe${query ? `?${query}` : ""}`);
}

export async function exportUseReport({ persona = "", transportId = "", desde = "", hasta = "" } = {}) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const response = await fetch(`${base}/transportes/usos/informe/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      persona: persona || null,
      transport_id: transportId || null,
      desde: desde || null,
      hasta: hasta || null,
    }),
  });
  if (!response.ok) {
    let message = "No se pudo exportar el informe";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(typeof message === "string" ? message : "No se pudo exportar el informe");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = match ? match[1].replace(/['"]/g, "") : "informe_usos.xlsx";
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function exportFines(ids) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const response = await fetch(`${base}/transportes/multas/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) {
    let message = "No se pudo exportar las multas";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(typeof message === "string" ? message : "No se pudo exportar las multas");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = match ? match[1].replace(/['"]/g, "") : "multas.xlsx";
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function transportImageUrl(row) {
  if (!row?.has_image) return null;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const version = encodeURIComponent(row.image_filename || "1");
  return `${base}/transportes/${row.id}/image?v=${version}`;
}

export function fineFileUrl(fine) {
  if (!fine?.has_file && !fine?.has_image) return null;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const version = encodeURIComponent(fine.image_filename || "1");
  return `${base}/transportes/multas/${fine.id}/image?v=${version}`;
}

export function fineFileKind(fine, file) {
  if (file) {
    const name = (file.name || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
    if (type.startsWith("image/")) return "image";
  }
  if (fine?.file_kind) return fine.file_kind;
  const stored = (fine?.image_filename || "").toLowerCase();
  if (stored.endsWith(".pdf")) return "pdf";
  if (fine?.has_file || fine?.has_image) return "image";
  return "";
}

export async function uploadFineFile(id, file) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${base}/transportes/multas/${id}/image`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });
  if (!response.ok) {
    let message = "No se pudo cargar el archivo de la multa";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(typeof message === "string" ? message : "No se pudo cargar el archivo de la multa");
  }
  return response.json();
}

export async function uploadTransporteImage(id, file) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${base}/transportes/${id}/image`, {
    method: "POST",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: formData,
  });
  if (!response.ok) {
    let message = "No se pudo cargar la imagen";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      /* ignore */
    }
    throw new Error(typeof message === "string" ? message : "No se pudo cargar la imagen");
  }
  return response.json();
}
