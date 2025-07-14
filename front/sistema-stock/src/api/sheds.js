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