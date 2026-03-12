const WebSocket = require("ws");
const { openaiApiKey } = require("../config");
const { crearSolicitudTaxi } = require("../services/taxiService");
const {
    createOpenAIRealtime,
    sendSessionUpdate,
    pedirNombre,
    pedirDireccion,
    pedirConfirmacionDireccion,
    pedirDireccionOtraVez,
    responderTool,
} = require("../services/openaiRealtime");
const prisma = require("../services/bd");
const { obtenerIo } = require("../socket");
const {
    guardarLlamadaPorSolicitud,
    eliminarLlamadaPorSolicitud,
} = require("../llamadasActivas");

function registerMediaStream(server, llamadas) {
    const wss = new WebSocket.Server({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        if (req.url && req.url.startsWith("/media-stream")) {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
    });

    function textoPareceNombre(texto) {
        if (!texto || typeof texto !== "string") return false;

        const limpio = texto.trim();

        if (limpio.length < 2 || limpio.length > 40) return false;
        if (/\d/.test(limpio)) return false;

        const palabras = limpio.split(/\s+/);
        if (palabras.length > 4) return false;

        return true;
    }

    function textoPareceDireccion(texto) {
        if (!texto || typeof texto !== "string") return false;

        const limpio = texto.trim().toLowerCase();

        if (limpio.length < 5 || limpio.length > 120) return false;

        const tieneTipoVia =
            limpio.includes("calle") ||
            limpio.includes("avenida") ||
            limpio.includes("avda") ||
            limpio.includes("plaza") ||
            limpio.includes("paseo") ||
            limpio.includes("camino") ||
            limpio.includes("ronda") ||
            limpio.includes("carretera");

        const tieneNumero = /\d+/.test(limpio);

        return tieneTipoVia || tieneNumero;
    }

    wss.on("connection", (twilioWs, req) => {
        console.log("✅ Twilio WS conectado en", req.url);

        let streamSid = null;
        let callSid = null;
        let estadoLlamada = null;
        let openaiWs = null;
        let sessionReady = false;
        let hayAudioPendiente = false;
        let commitEnCurso = false;
        let pendingCommitTimeout = null;
        let speechStartedAt = null;
        let ultimaDuracionSpeechMs = 0;

        if (!openaiApiKey) {
            console.error("Falta OPENAI_API_KEY en .env");
            twilioWs.close();
            return;
        }

        openaiWs = createOpenAIRealtime();

        const cancelarCommitPendiente = () => {
            if (pendingCommitTimeout) {
                clearTimeout(pendingCommitTimeout);
                pendingCommitTimeout = null;
            }
        };

        const programarCommitSiHaceFalta = () => {
            cancelarCommitPendiente();

            if (!hayAudioPendiente || commitEnCurso) {
                return;
            }

            pendingCommitTimeout = setTimeout(() => {
                try {
                    if (
                        hayAudioPendiente &&
                        !commitEnCurso &&
                        openaiWs &&
                        openaiWs.readyState === WebSocket.OPEN
                    ) {
                        commitEnCurso = true;
                        console.log("📌 Forzando commit de audio corto");
                        openaiWs.send(
                            JSON.stringify({
                                type: "input_audio_buffer.commit",
                            })
                        );
                    }
                } catch (error) {
                    console.error("Error forzando commit:", error.message);
                    commitEnCurso = false;
                } finally {
                    pendingCommitTimeout = null;
                }
            }, 300);
        };

        openaiWs.on("open", () => {
            console.log("✅ OpenAI Realtime conectado");
            setTimeout(() => sendSessionUpdate(openaiWs), 250);
        });

        openaiWs.on("message", async (raw) => {
            try {
                const event = JSON.parse(raw.toString());

                switch (event.type) {
                    case "session.created":
                        console.log("🟢 session.created");
                        break;

                    case "session.updated":
                        console.log("🟢 session.updated");
                        sessionReady = true;
                        pedirNombre(openaiWs);
                        break;

                    case "input_audio_buffer.speech_started":
                        console.log("🟢 speech_started");

                        if (estadoLlamada?.bloquearConversacion) {
                            console.log("🔇 Conversación bloqueada mientras buscamos taxi");
                            break;
                        }

                        speechStartedAt = Date.now();
                        cancelarCommitPendiente();
                        break;

                    case "input_audio_buffer.speech_stopped":
                        console.log("🟢 speech_stopped");

                        if (estadoLlamada?.bloquearConversacion) {
                            console.log("🔇 Ignorando speech porque estamos esperando taxi");
                            break;
                        }

                        if (speechStartedAt) {
                            ultimaDuracionSpeechMs = Date.now() - speechStartedAt;
                            console.log("⏱️ Duración speech ms:", ultimaDuracionSpeechMs);
                        }

                        speechStartedAt = null;

                        programarCommitSiHaceFalta();
                        break;

                    case "input_audio_buffer.committed":
                        console.log("🟢 input_audio_buffer.committed");
                        cancelarCommitPendiente();
                        hayAudioPendiente = false;
                        commitEnCurso = false;
                        break;

                    case "conversation.item.done":
                        console.log("OpenAI event:", event.type);
                        //                        console.log("ITEM COMPLETO:", JSON.stringify(event.item, null, 2));
                        break;

                    case "response.function_call_arguments.done": {
                        console.log("🛠️ Tool call:", event.name);
                        console.log("Arguments:", event.arguments);

                        if (!estadoLlamada) break;

                        const args = JSON.parse(event.arguments || "{}");

                        if (event.name === "store_customer_name") {
                            const nombreCandidato = (args.name || "").trim();

                            // Si el usuario apenas habló, probablemente fue ruido
                            if (ultimaDuracionSpeechMs < 500) {
                                console.log("⚠️ Nombre rechazado por audio demasiado corto:", nombreCandidato);

                                responderTool(openaiWs, event.call_id, {
                                    ok: false,
                                    message: "No se entendió con claridad el nombre del cliente",
                                });

                                openaiWs.send(JSON.stringify({
                                    type: "response.create",
                                    response: {
                                        output_modalities: ["audio"],
                                        instructions:
                                            "Indica al cliente que no has entendido bien su nombre y que lo repita despacio. Di una sola frase breve."
                                    }
                                }));
                                break;
                            }

                            if (!textoPareceNombre(nombreCandidato)) {
                                console.log("⚠️ Nombre rechazado por formato sospechoso:", nombreCandidato);

                                responderTool(openaiWs, event.call_id, {
                                    ok: false,
                                    message: "El nombre no parece válido o no se entendió con claridad",
                                });

                                openaiWs.send(JSON.stringify({
                                    type: "response.create",
                                    response: {
                                        output_modalities: ["audio"],
                                        instructions:
                                            "Indica al cliente que no has entendido bien su nombre y que lo repita despacio. Di una sola frase breve."
                                    }
                                }));
                                break;
                            }

                            estadoLlamada.nombre = nombreCandidato;

                            responderTool(openaiWs, event.call_id, {
                                ok: true,
                                name: estadoLlamada.nombre,
                            });

                            if (estadoLlamada.nombre) {
                                pedirDireccion(openaiWs, estadoLlamada.nombre);
                            }
                        }

                        if (event.name === "store_candidate_pickup_address") {
                            const direccionCandidata = (args.pickup_address || "").trim();

                            if (ultimaDuracionSpeechMs < 700) {
                                console.log("⚠️ Dirección rechazada por audio demasiado corto:", direccionCandidata);

                                responderTool(openaiWs, event.call_id, {
                                    ok: false,
                                    message: "No se entendió con claridad la dirección",
                                });

                                openaiWs.send(JSON.stringify({
                                    type: "response.create",
                                    response: {
                                        output_modalities: ["audio"],
                                        instructions:
                                            "Indica al cliente que no has entendido bien la dirección y que repita solo la calle y el número. Di una sola frase breve."
                                    }
                                }));
                                break;
                            }

                            if (!textoPareceDireccion(direccionCandidata)) {
                                console.log("⚠️ Dirección rechazada por formato sospechoso:", direccionCandidata);

                                responderTool(openaiWs, event.call_id, {
                                    ok: false,
                                    message: "La dirección no parece válida o no se entendió con claridad",
                                });

                                openaiWs.send(JSON.stringify({
                                    type: "response.create",
                                    response: {
                                        output_modalities: ["audio"],
                                        instructions:
                                            "Indica al cliente que no has entendido bien la dirección y que repita solo la calle y el número. Di una sola frase breve."
                                    }
                                }));
                                break;
                            }

                            estadoLlamada.direccionPendienteConfirmacion = direccionCandidata;
                            estadoLlamada.direccionConfirmada = false;

                            responderTool(openaiWs, event.call_id, {
                                ok: true,
                                pickup_address: estadoLlamada.direccionPendienteConfirmacion,
                            });

                            if (estadoLlamada.direccionPendienteConfirmacion) {
                                pedirConfirmacionDireccion(
                                    openaiWs,
                                    estadoLlamada.nombre || "cliente",
                                    estadoLlamada.direccionPendienteConfirmacion
                                );
                            }
                        }

                        if (event.name === "confirm_pickup_address") {
                            if (!estadoLlamada.direccionPendienteConfirmacion) {
                                responderTool(openaiWs, event.call_id, {
                                    ok: false,
                                    message: "No hay dirección candidata para confirmar",
                                });
                                break;
                            }

                            estadoLlamada.recogida = estadoLlamada.direccionPendienteConfirmacion;
                            estadoLlamada.direccionConfirmada = true;
                            estadoLlamada.direccionPendienteConfirmacion = null;

                            responderTool(openaiWs, event.call_id, {
                                ok: true,
                                pickup_address: estadoLlamada.recogida,
                            });

                            console.log("✅ Dirección confirmada");

                            if (!estadoLlamada.solicitudCreada && estadoLlamada.nombre && estadoLlamada.recogida) {
                                const resultado = await crearSolicitudTaxi(estadoLlamada);

                                estadoLlamada.solicitudCreada = resultado.ok;
                                estadoLlamada.referencia = resultado.referencia || null;
                                estadoLlamada.taxiAsignado = resultado.taxiAsignado || null;
                                estadoLlamada.estado = resultado.estado || null;

                                if (resultado.referencia) {
                                    guardarLlamadaPorSolicitud(resultado.referencia, {
                                        openaiWs,
                                        twilioWs,
                                        callSid,
                                        streamSid,
                                        estadoLlamada,
                                    });
                                }

                                if (resultado.ofertaId && resultado.taxistaId) {
                                    const io = obtenerIo();

                                    const solicitud = await prisma.solicitudViaje.findUnique({
                                        where: { id: resultado.referencia },
                                    });

                                    console.log("📨 Emitiendo oferta a sala:", `taxista:${resultado.taxistaId}`);
                                    console.log("📨 Payload oferta:", {
                                        ofertaId: resultado.ofertaId,
                                        solicitudId: solicitud.id,
                                        taxistaId: resultado.taxistaId,
                                    });

                                    io.to(`taxista:${resultado.taxistaId}`).emit("oferta:recibida", {
                                        ofertaId: resultado.ofertaId,
                                        solicitud: {
                                            id: solicitud.id,
                                            nombreCliente: solicitud.nombreCliente,
                                            telefonoCliente: solicitud.telefonoCliente,
                                            direccionRecogida: solicitud.direccionRecogida,
                                        },
                                    });

                                    console.log(
                                        `📨 Oferta ${resultado.ofertaId} enviada a taxista:${resultado.taxistaId}`
                                    );

                                    openaiWs.send(JSON.stringify({
                                        type: "response.create",
                                        response: {
                                            output_modalities: ["audio"],
                                            instructions:
                                                "Di exactamente: Perfecto. Buscando taxi disponible."
                                        }
                                    }));

                                    estadoLlamada.esperandoAsignacion = true;
                                    estadoLlamada.bloquearConversacion = true;
                                } else {
                                    openaiWs.send(JSON.stringify({
                                        type: "response.create",
                                        response: {
                                            output_modalities: ["audio"],
                                            instructions:
                                                "Di exactamente: Perfecto. Tu solicitud queda pendiente hasta que haya un taxi disponible."
                                        }
                                    }));
                                }
                            } else {
                                openaiWs.send(JSON.stringify({
                                    type: "response.create",
                                    response: {
                                        output_modalities: ["audio"],
                                        instructions:
                                            "He confirmado la dirección, pero todavía falta algún dato para registrar la solicitud."
                                    }
                                }));
                            }

                            break;
                        }

                        if (event.name === "reject_pickup_address") {
                            estadoLlamada.direccionPendienteConfirmacion = null;
                            estadoLlamada.direccionConfirmada = false;

                            responderTool(openaiWs, event.call_id, {
                                ok: true,
                                message: "Dirección descartada",
                            });

                            pedirDireccionOtraVez(openaiWs);
                        }

                        if (event.name === "create_taxi_request") {
                            responderTool(openaiWs, event.call_id, {
                                ok: true,
                                mensaje: "La solicitud ya se gestiona al confirmar la dirección",
                                referencia: estadoLlamada?.referencia || null,
                                estado: estadoLlamada?.estado || null,
                                taxiAsignado: estadoLlamada?.taxiAsignado || null,
                            });

                            console.log("ℹ️ create_taxi_request ignorado porque ya se gestiona al confirmar dirección");
                            break;
                        }

                        break;
                    }

                    case "response.output_audio.delta":
                        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
                            twilioWs.send(
                                JSON.stringify({
                                    event: "media",
                                    streamSid,
                                    media: {
                                        payload: Buffer.from(event.delta, "base64").toString("base64"),
                                    },
                                })
                            );
                        }
                        break;

                    case "response.output_audio.done":
                        console.log("🔊 response.output_audio.done");
                        break;

                    case "response.output_audio_transcript.done":
                        console.log("📝 Asistente:", event.transcript);
                        break;

                    case "response.created":
                        console.log("🟢 response.created");
                        cancelarCommitPendiente();
                        break;

                    case "response.done":
                        console.log("🟢 response.done");
                        if (event.response) {
                            //                            console.log(
                            //                                "response.done payload:",
                            //                                JSON.stringify(event.response, null, 2)
                            //                            );
                        }
                        break;

                    case "error":
                        if (event.error?.code === "input_audio_buffer_commit_empty") {
                            console.warn("⚠️ Commit vacío ignorado");
                            cancelarCommitPendiente();
                            hayAudioPendiente = false;
                            commitEnCurso = false;
                            break;
                        }

                        console.error("❌ Error OpenAI:", event.error);
                        break;

                    default:
                        break;
                }
            } catch (err) {
                console.error("Error leyendo evento de OpenAI:", err.message);
            }
        });

        twilioWs.on("message", (message) => {
            try {
                const data = JSON.parse(message.toString());

                switch (data.event) {
                    case "connected":
                        console.log("Twilio stream conectado");
                        break;

                    case "start":
                        streamSid = data.start?.streamSid;
                        callSid = data.start?.callSid;

                        console.log("Inicio streamSid:", streamSid);
                        console.log("CallSid:", callSid);

                        estadoLlamada = llamadas.get(callSid) || {
                            callSid,
                            telefono: null,
                            nombre: null,
                            recogida: null,
                            direccionPendienteConfirmacion: null,
                            direccionConfirmada: false,
                            solicitudCreada: false,
                            referencia: null,
                            taxiAsignado: null,
                            estado: null,
                            esperandoAsignacion: false,
                            bloquearConversacion: false,
                        };

                        llamadas.set(callSid, estadoLlamada);
                        break;

                    case "media":
                        if (
                            sessionReady &&
                            openaiWs.readyState === WebSocket.OPEN &&
                            data.media?.payload
                        ) {

                            if (estadoLlamada?.bloquearConversacion) {
                                // Ignorar todo lo que diga el cliente mientras buscamos taxi
                                return;
                            }

                            hayAudioPendiente = true;

                            openaiWs.send(
                                JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: data.media.payload,
                                })
                            );
                        }
                        break;

                    case "stop":
                        console.log("Fin del stream Twilio");
                        if (callSid && estadoLlamada) {
                            console.log(
                                "📦 Estado final llamada:",
                                JSON.stringify(estadoLlamada, null, 2)
                            );
                        }

                        if (estadoLlamada?.referencia) {
                            eliminarLlamadaPorSolicitud(estadoLlamada.referencia);
                        }

                        if (openaiWs.readyState === WebSocket.OPEN) {
                            openaiWs.close();
                        }
                        if (callSid) {
                            llamadas.delete(callSid);
                        }
                        break;

                    default:
                        console.log("Evento WS no manejado:", data.event);
                }
            } catch (err) {
                console.error("Error parseando mensaje Twilio:", err.message);
            }
        });

        twilioWs.on("close", () => {
            console.log("Twilio WebSocket cerrado");

            cancelarCommitPendiente();

            if (estadoLlamada?.referencia) {
                eliminarLlamadaPorSolicitud(estadoLlamada.referencia);
            }

            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.close();
            }
            if (callSid) {
                llamadas.delete(callSid);
            }
        });

        twilioWs.on("error", (err) => {
            console.error("Error WebSocket Twilio:", err.message);
        });
    });
}

module.exports = {
    registerMediaStream,
};