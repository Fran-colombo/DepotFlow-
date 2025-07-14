import { apiFetch } from './client';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');

  if (!token) {
    console.error('No se encontró token de autenticación');
    localStorage.removeItem('authToken');
    window.location.href = '/login';
    throw new Error('Sesión no iniciada. Por favor inicie sesión nuevamente.');
  }

  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
};

export const getMovements = async (item_id) => {
  try {
    const response = await apiFetch(`/movements/by-item/${item_id}`, {
      ...getAuthHeaders(),
      method: 'GET'
    });
    return response;
  } catch (error) {
    const errorMessage = error.response?.data?.detail ||
                       error.message ||
                       'Error desconocido al obtener movimientos';
    throw new Error(errorMessage);
  }
};

export const getAvailableSheds = async () => {
  try {
    const response = await apiFetch('/sheds', {
      ...getAuthHeaders(),
      method: 'GET'
    });
    return response;
  } catch (error) {
    const errorMessage = error.response?.data?.detail ||
                       error.message ||
                       'Error desconocido al obtener galpones';
    throw new Error(errorMessage);
  }
};

export const moveItem = async (movementData) => {
  try {
    const payload = {
      item_id: movementData.item_id,
      from_shed_id: movementData.from_shed_id,
      to_shed_id: movementData.to_shed_id,
      quantity: movementData.quantity,
      username: movementData.username
    };

    console.log('Enviando datos:', payload);

    const response = await apiFetch('/movements/', {
      ...getAuthHeaders(),
      method: 'POST',
      body: JSON.stringify(payload)
    });

    console.log('Respuesta recibida:', response);
    return response;
  } catch (error) {
    console.error('Error detallado:', error);

    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
      throw new Error('Sesión expirada. Por favor inicie sesión nuevamente.');
    }

    throw new Error(error.response?.data?.detail ||
                  'Error al mover el ítem. Por favor intente nuevamente.');
  }
};