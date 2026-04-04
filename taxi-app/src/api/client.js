import { API_BASE_URL } from "../config/env";

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;

  const headers = {
    ...(options.headers || {}),
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";

  let data = null;

  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
  } else {
    try {
      data = await res.text();
    } catch (_) {
      data = null;
    }
  }

  if (res.status === 401) {
    const error = new Error(
      data?.error || data || "Sesión expirada"
    );
    error.isUnauthorized = true;
    throw error;
  }

  if (!res.ok) {
    throw new Error(data?.error || data || `Error ${res.status}`);
  }

  return data;
}

export const api = {
  guardarPushToken: (token, expoPushToken) =>
    request("/mobile/push-token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ expoPushToken }),
    }),

  getOfertaPendiente: (token) =>
    request("/mobile/oferta-pendiente", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  login: (telefono, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ telefono, password }),
    }),

  logout: (token) =>
    request("/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  register: async (form) => {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(form),
    });
  },

  verifyPhone: async (telefono, codigo) => {
    return request("/auth/verify-phone", {
      method: "POST",
      body: JSON.stringify({ telefono, codigo }),
    });
  },

  resendCode: async (telefono) => {
    return request("/auth/resend-code", {
      method: "POST",
      body: JSON.stringify({ telefono }),
    });
  },

  getParadasResumen: () => request("/mobile/paradas-resumen"),

  getServiciosHistorico: (token) =>
    request("/mobile/servicios", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  getObjetosPerdidos: (token) =>
    request("/mobile/objetos-perdidos", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  crearObjetoPerdido: (token, body) =>
    request("/mobile/objetos-perdidos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),

  marcarObjetoEntregado: (token, id) =>
    request(`/mobile/objetos-perdidos/${id}/entregar`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  eliminarObjetoPerdido: (token, id) =>
    request(`/mobile/objetos-perdidos/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),

  getObjetosPerdidosPublicos: (q = "") =>
    request(`/mobile/public/objetos-perdidos${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  actualizarPerfil: (token, body) =>
    request("/auth/perfil", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),

  forgotPassword: (telefono) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ telefono }),
    }),

  resetPassword: (telefono, codigo, nuevaPassword) =>
    request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ telefono, codigo, nuevaPassword }),
    }),
};