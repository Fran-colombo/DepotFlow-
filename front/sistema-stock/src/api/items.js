import { apiFetch } from "./client";
import { formatISO } from "date-fns";

export const getItems = (filters = {}, page = 1, pageSize = 10) => {
  const params = {
    name: filters.name || undefined,
    category: filters.category || undefined,
    shed_id: filters.shed || undefined,
    page: page,
    pageSize: pageSize,
  };
  return apiFetch("/", {
    method: "GET",
    params: params,
  });
};

export async function searchItems(name) {
  return apiFetch(`/search?name=${encodeURIComponent(name)}`);
}

export async function getItemById(itemId) {
  return apiFetch(`/items/${itemId}`);
}

export async function getItemObservations(itemId) {
  return apiFetch(`/api/observations/item/${itemId}`);
}

export async function addObservation(itemId, description) {
  return apiFetch(`/api/observations/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ item_id: itemId, description }),
  });
}


export async function retirarItem(data) {
  return apiFetch("/historical/retirar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },  
    body: JSON.stringify(data),
  });
}


export async function devolverItem(data) {
  return apiFetch(`/historical/devolver`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data),
  });
}
export async function createItem(data) {
  return apiFetch("/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: data.name,
      description: data.description,
      quantity: data.quantity,
      category: data.category,
      shed_id: data.shed_id,
    }),
  });
}


export async function updateItem(item_id, data) {
  return apiFetch(`/items/by-id/${item_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data),
  });
}

export async function getHistorial() {
  return apiFetch("/historical/");
}

export async function getPendientes(filters = {}, page = 1, pageSize = 10) {
  const params = {
    person_who_took: filters.personWhoTook || undefined,
    place: filters.place || undefined,
    page,
    page_size: pageSize,
  };

  return apiFetch("/historical/pending", {
    method: "GET",
    params,
  });
}

export const getFilteredHistorial = async (filters = {}, page = 1, pageSize = 10) => {
  const params = {
    item_name: filters.itemName || undefined,
    user_name: filters.userName || undefined,
    place: filters.place || undefined,
    action: filters.action || undefined,
    item_category: filters.category || undefined,
    shedId: filters.shed || undefined,
    month: filters.month || undefined,
    year: filters.year || undefined,
    page: page,
    page_size: pageSize,
  };

  return apiFetch("/historical/", {
    method: "GET",
    params: params,
  });
};

export async function generarRemito(historyIds) {
  const token = localStorage.getItem("authToken");

  const response = await fetch(import.meta.env.VITE_API_URL + "/historical/remito", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(historyIds),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Error al generar remito");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  window.open(url);
}

export async function deleteProduct(params) {
  return apiFetch("/", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("authToken")}`,
    },
    body: JSON.stringify({
      ...params,
      date: params.date || formatISO(new Date()),
    }),
  });
}

export async function getItemDetails(itemId) {
  try {
    const data = await apiFetch(`/items/${itemId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
    });

    return {
      ...data.item,
      metadata: data.metadata,
      relations: data.relations,
    };
  } catch (error) {
    console.error("Error en getItemDetails:", error);
    throw error;
  }
}

export async function getDeletedItems({ name = "", category = "", year = "", month = "", page = 1, pageSize = 10 }) {
  const params = {
    name: name || undefined,
    category: category || undefined,
    page,
    page_size: pageSize,
  };

  if (year || month) {
    const from = new Date(`${year || "2000"}-${month || "01"}-01T00:00:00`);
    const to = new Date(from);
    to.setMonth(from.getMonth() + 1);
    params.from = from.toISOString();
    params.to = to.toISOString();
  }

  return apiFetch("/deleted-items", {
    method: "GET",
    params,
  });
}
