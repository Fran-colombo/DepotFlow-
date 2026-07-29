import { apiFetch } from "./client";

export async function getSheds() {
  try {
    const response = await apiFetch("/sheds/");

    if (!response || !Array.isArray(response)) {
      throw new Error("Formato de respuesta inválido para sheds");
    }
    
    return response;
  } catch (error) {
    console.error("Error fetching sheds:", error);
    throw error;
  }
}

export async function getShedById(id) {
  return apiFetch(`/sheds/${id}`);
}

export async function createShed({ name }) {
  return apiFetch("/sheds/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function updateShed(id, { name }) {
  return apiFetch(`/sheds/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteShed(id) {
  return apiFetch(`/sheds/${id}`, {
    method: "DELETE",
  });
}
