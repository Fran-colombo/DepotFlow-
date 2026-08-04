import { apiFetch } from "./client"

export async function signup(data) {
  return apiFetch("/signUp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data),
  });
}


export async function login(formData) {
  const body = new URLSearchParams();
  body.append("username", formData.username);
  body.append("password", formData.password);
  console.log("API URL:", import.meta.env.VITE_API_URL);

  try {
    const data = await apiFetch("/login", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    

    if (!data.access_token) {
      throw new Error("Formato de respuesta inválido: falta access_token");
    }

    return data;
  } catch (error) {
    console.error("Error en login:", error);
    throw new Error(error.message || "Error al iniciar sesión");
  }
}

export async function getUsers({ name = "", email = "", page = 1, pageSize = 20 }) {
  const token = localStorage.getItem("authToken")
  const params = new URLSearchParams()
  
  if (name) params.append("name", name)
  if (email) params.append("email", email)
  params.append("page", page)
  params.append("page_size", pageSize)

  const data = await apiFetch(`/admin/users?${params.toString()}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  })

  console.log(data)
  return data
}

export async function deleteUser(userId) {
  const token = localStorage.getItem("authToken")
  
  return await apiFetch(`/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  })
}

export async function updateUserPassword(userId, password) {
  const token = localStorage.getItem("authToken")

  return await apiFetch(`/admin/users/${userId}/password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  })
}

export const getCurrentUserName = async (token) => {
  const data = await apiFetch("/admin/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!data || !data.full_name) {
    throw new Error("Respuesta inválida del servidor");
  }
  // console.log("👉 data de getCurrentUserName:", data);
  return data.full_name;
};
