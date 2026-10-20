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

export function setFinePerson(id, person) {
  return apiFetch(`/transportes/multas/${id}/persona`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person }),
  });
}

export function transportImageUrl(row) {
  if (!row?.has_image) return null;
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const version = encodeURIComponent(row.image_filename || "1");
  return `${base}/transportes/${row.id}/image?v=${version}`;
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
