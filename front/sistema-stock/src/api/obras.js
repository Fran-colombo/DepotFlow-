import { apiFetch } from "./client";

export const OBRA_STAGES = [
  { value: "por_iniciar", label: "Por iniciar" },
  { value: "trabajando", label: "Trabajando" },
  { value: "terminaciones", label: "Terminaciones" },
  { value: "postventa", label: "Postventa" },
  { value: "finalizada", label: "Finalizada" },
];

export function getObras() {
  return apiFetch("/obras");
}

export function getAdminObras() {
  return apiFetch("/admin/obras");
}

export function createObra(data) {
  return apiFetch("/admin/obras", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateObra(obraId, data) {
  return apiFetch(`/admin/obras/${obraId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
