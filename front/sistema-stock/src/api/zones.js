import { apiFetch } from "./client";

export async function getZones(shedId) {
  const params = {};
  if (shedId) {
    params.shed_id = shedId;
  }
  const response = await apiFetch("/zones/", {
    method: "GET",
    params,
  });
  return Array.isArray(response) ? response : [];
}

export async function getZoneById(id) {
  return apiFetch(`/zones/${id}`);
}

export async function createZone({ name, shed_id }) {
  return apiFetch("/zones/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, shed_id: Number(shed_id) }),
  });
}

export async function updateZone(id, { name }) {
  return apiFetch(`/zones/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteZone(id) {
  return apiFetch(`/zones/${id}`, {
    method: "DELETE",
  });
}
