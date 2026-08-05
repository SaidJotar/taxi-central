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

    if (!res.ok) {
        throw new Error(
            data?.error ||
            data?.message ||
            (typeof data === "string" ? data : null) ||
            `Error ${res.status}`
        );
    }

    return data;
}

export const api = {
    solicitarTaxi: (body) =>
        request("/cliente/solicitar", {
            method: "POST",
            body: JSON.stringify(body),
        }),

    estadoSolicitud: (id) =>
        request(`/cliente/estado/${id}`, {
            method: "GET",
        }),

    cancelarSolicitud: (id) =>
        request(`/cliente/cancelar/${id}`, {
            method: "POST",
        }),

    getMensajes: (solicitudId) =>
        request(`/cliente/mensajes/${encodeURIComponent(solicitudId)}`, {
            method: "GET",
        }),

    enviarMensaje: (solicitudId, texto) =>
        request(`/cliente/mensajes/${encodeURIComponent(solicitudId)}`, {
            method: "POST",
            body: JSON.stringify({ texto }),
        }),
    valorarServicio: (solicitudId, body) =>
        request(`/cliente/valorar/${encodeURIComponent(solicitudId)}`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
};