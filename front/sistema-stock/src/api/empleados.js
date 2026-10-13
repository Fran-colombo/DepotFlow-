import { apiFetch } from "./client";

export function getEmpleados() {
  return apiFetch("/empleados");
}

export function getAdminEmpleados() {
  return apiFetch("/admin/empleados");
}

export function createEmpleado(data) {
  return apiFetch("/admin/empleados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateEmpleado(empleadoId, data) {
  return apiFetch(`/admin/empleados/${empleadoId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
