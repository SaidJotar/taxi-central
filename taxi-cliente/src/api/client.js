import { API_BASE_URL } from "../config/env";

async function request(path, options = {}) {
    if (!API_BASE_URL) {
        throw new Error(
            "EXPO_PUBLIC_API_BASE_URL no está configurada. Revisa el archivo .env y reinicia Expo."
        );
    }

    const baseUrl = API_BASE_URL.replace(/\/+$/, "");
    const url = `${baseUrl}${path}`;

    const headers = {
        Accept: "application/json",
        ...(options.headers || {}),
    };

    if (options.body) {
        headers["Content-Type"] = "application/json";
    }

    let res;

    try {
        res = await fetch(url, {
            ...options,
            headers,
        });
    } catch (error) {
        console.log("❌ Error de red:", error);

        throw new Error(
            `No se pudo conectar con la API: ${url}`
        );
    }

    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();

    let data = null;

    if (contentType.includes("application/json")) {
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch (error) {
            throw new Error(
                `La API devolvió JSON inválido en ${path}`
            );
        }
    } else {
        /*
         * Importantísimo:
         * si Nginx/React/Vite devuelve index.html,
         * lo detectamos aquí inmediatamente.
         */
        if (
            raw?.trimStart().startsWith("<!DOCTYPE") ||
            raw?.trimStart().startsWith("<html")
        ) {
            throw new Error(
                `La URL ${url} está devolviendo HTML en vez de JSON. ` +
                `Revisa EXPO_PUBLIC_API_BASE_URL y la configuración de Nginx.`
            );
        }

        data = raw || null;
    }

    if (!res.ok) {
        throw new Error(
            data?.error ||
            data?.message ||
            (typeof data === "string" ? data : null) ||
            `Error HTTP ${res.status}`
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
        request(`/cliente/estado/${encodeURIComponent(id)}`, {
            method: "GET",
        }),

    cancelarSolicitud: (id) =>
        request(`/cliente/cancelar/${encodeURIComponent(id)}`, {
            method: "POST",
        }),

    getMensajes: (solicitudId) =>
        request(
            `/cliente/mensajes/${encodeURIComponent(solicitudId)}`,
            {
                method: "GET",
            }
        ),

    enviarMensaje: (solicitudId, texto) =>
        request(
            `/cliente/mensajes/${encodeURIComponent(solicitudId)}`,
            {
                method: "POST",
                body: JSON.stringify({ texto }),
            }
        ),

    valorarServicio: (solicitudId, body) =>
        request(
            `/cliente/valorar/${encodeURIComponent(solicitudId)}`,
            {
                method: "POST",
                body: JSON.stringify(body),
            }
        ),

    calcularReserva: (body) =>
        request("/cliente/reservas/calcular", {
            method: "POST",
            body: JSON.stringify(body),
        }),

    crearReserva: (body) =>
        request("/cliente/reservas", {
            method: "POST",
            body: JSON.stringify(body),
        }),

    getReservasCliente: (telefono) =>
        request(
            `/cliente/reservas?telefono=${encodeURIComponent(
                telefono
            )}`,
            {
                method: "GET",
            }
        ),

    cancelarReserva: (reservaId) =>
        request(
            `/cliente/reservas/${encodeURIComponent(
                reservaId
            )}/cancelar`,
            {
                method: "POST",
            }
        ),
};