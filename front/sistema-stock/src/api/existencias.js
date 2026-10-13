import { apiFetch } from "./client";

export function getLugares() {
  return apiFetch("/existencias/lugares");
}

export function getExistencias(kind, id) {
  return apiFetch("/existencias", {
    params: { kind, id },
  });
}

export async function openExistenciasPdf(kind, id) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const params = new URLSearchParams({ kind, id: String(id) });
  const response = await fetch(`${base}/existencias/pdf?${params.toString()}`, {
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) {
    let message = "No se pudo generar la hoja";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      /* the body is not JSON */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
}
