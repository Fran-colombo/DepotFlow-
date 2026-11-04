import { apiFetch } from "./client";

export function getReports() {
  return apiFetch("/admin/reports");
}

export function getReportSubcategories() {
  return apiFetch("/admin/reports/subcategories");
}

export function createReport(data) {
  return apiFetch("/admin/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateReport(reportId, data) {
  return apiFetch(`/admin/reports/${reportId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteReport(reportId) {
  return apiFetch(`/admin/reports/${reportId}`, { method: "DELETE" });
}

export function sendReportNow(reportId) {
  return apiFetch(`/admin/reports/${reportId}/send`, { method: "POST" });
}
