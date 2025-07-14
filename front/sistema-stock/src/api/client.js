export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("authToken");
  let url = import.meta.env.VITE_API_URL + endpoint;

  if (options.params) {
    const params = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, value);
      }
    });
    url += `?${params.toString()}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}), 
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: options.body,
  });

  const responseClone = response.clone();

  if (!response.ok) {
    try {
      const errorData = await responseClone.json();
      throw new Error(errorData.detail || "Error en la solicitud");
    } catch (e) {
      throw new Error( e.message || "Error en la solicitud");
    }
  }

  try {
    return await response.json();
  } catch (e) {
    return response.text(e);
  }
}