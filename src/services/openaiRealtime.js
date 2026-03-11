const WebSocket = require("ws");
const { openaiApiKey, openaiRealtimeUrl, systemMessage, voice } = require("../config");

function createOpenAIRealtime() {
    return new WebSocket(openaiRealtimeUrl, {
        headers: {
            Authorization: `Bearer ${openaiApiKey}`,
        },
    });
}

function sendSessionUpdate(openaiWs) {
    const sessionUpdate = {
        type: "session.update",
        session: {
            type: "realtime",
            model: "gpt-realtime-mini",
            output_modalities: ["audio"],
            audio: {
                input: {
                    format: { type: "audio/pcmu" },
                    turn_detection: {
                        type: "server_vad",
                        silence_duration_ms: 1000,
                        prefix_padding_ms: 300,
                        create_response: true,
                        interrupt_response: false
                    },
                },
                output: {
                    format: { type: "audio/pcmu" },
                    voice,
                },
            },
            tools: [
                {
                    type: "function",
                    name: "store_customer_name",
                    description:
                        "Guardar el nombre del cliente cuando el asistente ya lo ha entendido.",
                    parameters: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            name: {
                                type: "string",
                                description: "Nombre del cliente",
                            },
                        },
                        required: ["name"],
                    },
                },
                {
                    type: "function",
                    name: "store_candidate_pickup_address",
                    description:
                        "Guardar una dirección candidata de recogida para repetirla y pedir confirmación al cliente.",
                    parameters: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            pickup_address: {
                                type: "string",
                                description: "Dirección de recogida entendida por el asistente",
                            },
                        },
                        required: ["pickup_address"],
                    },
                },
                {
                    type: "function",
                    name: "confirm_pickup_address",
                    description:
                        "Confirmar que el cliente ha dicho explícitamente que la dirección candidata es correcta.",
                    parameters: {
                        type: "object",
                        additionalProperties: false,
                        properties: {},
                        required: [],
                    },
                },
                {
                    type: "function",
                    name: "reject_pickup_address",
                    description:
                        "Marcar que la dirección candidata no era correcta o que el cliente la ha corregido.",
                    parameters: {
                        type: "object",
                        additionalProperties: false,
                        properties: {},
                        required: [],
                    },
                },
                {
                    type: "function",
                    name: "create_taxi_request",
                    description:
                        "Crear una solicitud de taxi solo cuando el nombre ya es conocido y la dirección ha sido confirmada por el cliente.",
                    parameters: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            name: {
                                type: "string",
                                description: "Nombre del cliente",
                            },
                            pickup_address: {
                                type: "string",
                                description: "Dirección exacta de recogida confirmada por el cliente",
                            },
                        },
                        required: ["name", "pickup_address"],
                    },
                },
            ],
            tool_choice: "auto",
            instructions: systemMessage,
        },
    };

    openaiWs.send(JSON.stringify(sessionUpdate));
}

function pedirNombre(openaiWs) {
    openaiWs.send(
        JSON.stringify({
            type: "response.create",
            response: {
                output_modalities: ["audio"],
                instructions:
                    "Saluda al cliente y pídele únicamente su nombre. Di una sola frase breve.",
            },
        })
    );
}

function pedirDireccion(openaiWs, nombre) {
    openaiWs.send(
        JSON.stringify({
            type: "response.create",
            response: {
                output_modalities: ["audio"],
                instructions:
                    `Da las gracias a ${nombre} y pide la dirección exacta de recogida. ` +
                    `Di una sola frase breve.`,
            },
        })
    );
}

function pedirConfirmacionDireccion(openaiWs, nombre, direccion) {
    openaiWs.send(
        JSON.stringify({
            type: "response.create",
            response: {
                output_modalities: ["audio"],
                instructions:
                    `Di exactamente: ${nombre}, he entendido esta dirección: ${direccion}. ` +
                    `¿Es correcta la dirección?. ` +
                    `Si el cliente responde sí, debes llamar a la función confirm_pickup_address. ` +
                    `Si responde no o corrige la dirección, debes llamar a reject_pickup_address.`
            },
        })
    );
}

function pedirDireccionOtraVez(openaiWs) {
    openaiWs.send(
        JSON.stringify({
            type: "response.create",
            response: {
                output_modalities: ["audio"],
                instructions:
                    "Indica al cliente que repita la dirección exacta de recogida. Di una sola frase breve.",
            },
        })
    );
}

function responderTool(openaiWs, callId, payload) {
    openaiWs.send(
        JSON.stringify({
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(payload),
            },
        })
    );
}

function informarResultadoSolicitud(openaiWs) {
    openaiWs.send(
        JSON.stringify({
            type: "response.create",
            response: {
                output_modalities: ["audio"],
                instructions:
                    "Informa al cliente usando solo la información del sistema. " +
                    "Si hay taxi asignado, di su nombre. " +
                    "Si no lo hay, di que la solicitud ha quedado registrada para revisión. " +
                    "No inventes tiempos.",
            },
        })
    );
}

module.exports = {
    createOpenAIRealtime,
    sendSessionUpdate,
    pedirNombre,
    pedirDireccion,
    pedirConfirmacionDireccion,
    pedirDireccionOtraVez,
    responderTool,
    informarResultadoSolicitud,
};