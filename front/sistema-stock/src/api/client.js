import { noteActivity } from "../sessionActivity";

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

function formatDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        return item?.msg || item?.message || "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.message || "";
  }
  return String(detail);
}

export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("authToken");
  const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  let url = `${base}${endpoint}`;

  if (options.params) {
    const params = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== "") params.append(key, item);
        });
        return;
      }
      if (value !== undefined && value !== "") {
        params.append(key, value);
      }
    });
    url += `?${params.toString()}`;
  }

  const headers = { ...(options.headers || {}) };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const isLogin = endpoint === "/login" || endpoint.startsWith("/login?");
  if (response.status === 401 && !isLogin) {
    unauthorizedHandler?.();
  }

  if (!response.ok) {
    let message = "Error en la solicitud";
    const contentType = response.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const errorData = await response.json();
        message = formatDetail(errorData.detail) || errorData.message || message;
      } else {
        const text = await response.text();
        if (text) message = text;
      }
    } catch {
      /* keep default message */
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (response.status === 204) {
    noteActivity();
    return null;
  }
  if (contentType.includes("application/json")) {
    const data = await response.json();
    noteActivity();
    return data;
  }
  const text = await response.text();
  noteActivity();
  return text;
}
