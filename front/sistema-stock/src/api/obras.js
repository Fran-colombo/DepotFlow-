import { apiFetch } from "./client";

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
