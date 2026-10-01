import { apiFetch } from "./client";

export function getCategories() {
  return apiFetch("/categories");
}

export function getAdminCategories() {
  return apiFetch("/admin/categories");
}

export function createCategory(data) {
  return apiFetch("/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateCategory(categoryId, data) {
  return apiFetch(`/admin/categories/${categoryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
