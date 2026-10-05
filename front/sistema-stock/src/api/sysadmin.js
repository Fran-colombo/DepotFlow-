import { apiFetch } from "./client";

export function getSysadminTables() {
  return apiFetch("/admin/sysadmin/tables");
}

export function getSysadminRows(table, params) {
  return apiFetch(`/admin/sysadmin/${table}`, { params });
}

export function createSysadminRow(table, values) {
  return apiFetch(`/admin/sysadmin/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function updateSysadminRow(table, rowId, values) {
  return apiFetch(`/admin/sysadmin/${table}/${rowId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function deleteSysadminRow(table, rowId) {
  return apiFetch(`/admin/sysadmin/${table}/${rowId}`, {
    method: "DELETE",
  });
}
