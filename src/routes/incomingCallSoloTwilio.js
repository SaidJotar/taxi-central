const twilio = require("twilio");
const { crearSolicitudTaxi } = require("../services/taxiServiceSoloTwilio");
const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, publicUrl } = require("../configSoloTwilio");
const client = twilio(twilioAccountSid, twilioAuthToken);
const {
    guardarLlamadaPorSolicitud,
    obtenerLlamadaPorSolicitud,
    eliminarLlamadaPorSolicitud,
} = require("../llamadasActivas");

const { cancelarSolicitudPorCuelgue } = require("../services/cancelacionSolicitudService");
const { obtenerIo } = require("../socketSoloTwilio");

function decir(texto) {
    return { language: "es-ES", voice: "alice" };
}

function normalizarSiNoHayBody(req) {
    return req.body || {};
}

function limpiarTextoUbicacion(texto = "") {
    return texto
        .replace(/\s+/g, " ")
        .replace(/[.,;]+$/g, "")
        .trim();
}

function extraerDireccionYReferencia(texto = "") {
    const original = limpiarTextoUbicacion(texto);
    const lower = original.toLowerCase();

    const patrones = [
        "puerta trasera",
        "puerta de atrás",
        "puerta de atras",
        "puerta principal",
        "entrada principal",
        "entrada trasera",
        "frente a",
        "enfrente de",
        "frente al",
        "frente a la",
        "junto a",
        "al lado de",
        "al lado del",
        "al lado de la",
        "en la esquina de",
        "esquina con",
        "esquina de",
        "delante de",
        "detrás de",
        "detras de",
        "por la parte de",
        "a la altura de",
        "bajo",
        "debajo de",
    ];

    let mejorIndice = -1;
    let patronEncontrado = null;

    for (const patron of patrones) {
        const idx = lower.indexOf(patron);
        if (idx !== -1 && (mejorIndice === -1 || idx < mejorIndice)) {
            mejorIndice = idx;
            patronEncontrado = patron;
        }
    }

    if (mejorIndice === -1) {
        return {
            textoOriginal: original,
            direccionBase: original,
            referenciaRecogida: null,
            esCompuesta: false,
        };
    }

    const direccionBase = limpiarTextoUbicacion(original.slice(0, mejorIndice));
    const referenciaRecogida = limpiarTextoUbicacion(original.slice(mejorIndice));

    if (!direccionBase || !referenciaRecogida) {
        return {
            textoOriginal: original,
            direccionBase: original,
            referenciaRecogida: null,
            esCompuesta: false,
        };
    }

    return {
        textoOriginal: original,
        direccionBase,
        referenciaRecogida,
        esCompuesta: true,
        patron: patronEncontrado,
    };
}

function construirTextoConfirmacionUbicacion({ direccionBase, referenciaRecogida, textoOriginal }) {
    if (direccionBase && referenciaRecogida) {
        return `He entendido que la recogida es en ${direccionBase}, ${referenciaRecogida}.`;
    }

    if (direccionBase) {
        return `He entendido esta ubicación de recogida: ${direccionBase}.`;
    }

    return `He entendido esta ubicación: ${textoOriginal}.`;
}

function respuestaGather({ texto, action }) {
    const response = new twilio.twiml.VoiceResponse();
    const gather = response.gather({
        input: "speech",
        language: "es-ES",
        action,
        method: "POST",
        speechTimeout: "auto",
        timeout: 5,
        actionOnEmptyResult: true,
    });

    gather.say(decir(), texto);
    return response;
}

async function enviarSmsDatosTaxi({ telefonoCliente, nombreTaxista, telefonoTaxista, numeroTaxi }) {
    if (!telefonoCliente) {
        return;
    }

    const partes = [
        "Su taxi está de camino. Llegará pronto.",
        `Taxista: ${nombreTaxista || "No disponible"}.`,
        `Teléfono: ${telefonoTaxista || "No disponible"}.`,
        `Número de taxi: ${numeroTaxi || "No disponible"}.`,
    ];

    const body = partes.join(" ");

    await client.messages.create({
        body,
        from: twilioPhoneNumber,
        to: telefonoCliente,
    });
}

function registerIncomingCallRoute(app, llamadas) {
    app.post("/incoming-call", (req, res) => {
        const body = normalizarSiNoHayBody(req);

        const telefonoCliente =
            body.Direction === "outbound-api" ? body.To || null : body.From || null;

        const callSid = body.CallSid || null;

        if (callSid) {
            llamadas.set(callSid, {
                callSid,
                telefono: telefonoCliente,
                nombre: null,
                recogida: null,
                recogidaTextoOriginal: null,
                direccionBase: null,
                referenciaRecogida: null,
                direccionPendienteConfirmacion: null,
                direccionPendienteParseada: null,
                direccionConfirmada: false,
                solicitudCreada: false,
                referencia: null,
                taxiAsignado: null,
                nombreTaxista: null,
                telefonoTaxista: null,
                estado: null,
            });
        }

        const response = respuestaGather({
            texto: "Gracias por llamar a la central de taxis. ¿Dónde te gustaría que te recogiera?",
            action: `${publicUrl}/incoming-call/direccion`,
        });

        res.type("text/xml");
        res.send(response.toString());
    });

    app.post("/incoming-call/asignada", (req, res) => {

        const solicitudId = req.query.solicitudId;
        const llamada = obtenerLlamadaPorSolicitud(solicitudId);

        const response = new twilio.twiml.VoiceResponse();

        if (!llamada) {
            response.say(
                { language: "es-ES", voice: "alice" },
                "No hemos podido recuperar la asignación del taxi. Gracias por llamar."
            );
            response.hangup();
            res.type("text/xml");
            return res.send(response.toString());
        }

        const numeroTaxi = llamada.taxiAsignado || "su taxi";
        const nombreTaxista = llamada.nombreTaxista || "el taxista asignado";
        const telefonoTaxista = llamada.telefonoTaxista || "No disponible";

        response.say(
            { language: "es-ES", voice: "alice" },
            `Su taxi asignado es el número ${numeroTaxi}, conducido por ${nombreTaxista}. Gracias por llamar.`
        );

        response.hangup();

        res.type("text/xml");
        res.send(response.toString());

        setImmediate(async () => {
            try {
                await enviarSmsDatosTaxi({
                    telefonoCliente: llamada.telefono,
                    nombreTaxista,
                    telefonoTaxista,
                    numeroTaxi,
                });
            } catch (error) {
                console.error("❌ Error enviando SMS de taxi asignado:", error.message);
            } finally {
                eliminarLlamadaPorSolicitud(solicitudId);
            }
        });
    });
    /*
        app.post("/incoming-call/nombre", (req, res) => {
            const body = normalizarSiNoHayBody(req);
            const callSid = body.CallSid;
            const speech = (body.SpeechResult || "").trim();
    
            console.log("SpeechResult nombre:", speech);
    
            const llamada = llamadas.get(callSid);
            if (!llamada) {
                const response = new twilio.twiml.VoiceResponse();
                response.say(decir(), "No he podido recuperar la llamada. Inténtalo de nuevo.");
                response.hangup();
                res.type("text/xml");
                return res.send(response.toString());
            }
    
            if (!speech) {
                const response = respuestaGather({
                    texto: "No he entendido tu nombre. Por favor, repítelo despacio.",
                    action: "/incoming-call/nombre",
                });
                res.type("text/xml");
                return res.send(response.toString());
            }
    
            llamada.nombre = speech;
            llamadas.set(callSid, llamada);
    
            const response = respuestaGather({
                texto: `Gracias ${speech}. ¿Dónde te gustaría que te recogiera?`,
                action: "/incoming-call/direccion",
            });
    
            res.type("text/xml");
            res.send(response.toString());
        });
    */
    app.post("/incoming-call/direccion", (req, res) => {
        const body = req.body || {};
        const callSid = body.CallSid;
        const speech = limpiarTextoUbicacion(body.SpeechResult || "");

        console.log("SpeechResult direccion:", speech);

        const llamada = llamadas.get(callSid);
        const response = new twilio.twiml.VoiceResponse();

        if (!llamada) {
            response.say(
                { language: "es-ES", voice: "alice" },
                "No he podido recuperar la llamada."
            );
            response.hangup();
            res.type("text/xml");
            return res.send(response.toString());
        }

        if (!speech) {
            const gather = response.gather({
                input: "speech",
                language: "es-ES",
                action: `${publicUrl}/incoming-call/direccion`,
                method: "POST",
                speechTimeout: "auto",
                timeout: 5,
                actionOnEmptyResult: true,
            });

            gather.say(
                { language: "es-ES", voice: "alice" },
                "No he entendido bien la dirección o el lugar de recogida. Por favor, repítelo despacio."
            );

            res.type("text/xml");
            return res.send(response.toString());
        }

        const parseada = extraerDireccionYReferencia(speech);

        llamada.direccionPendienteConfirmacion = speech;
        llamada.direccionPendienteParseada = parseada;
        llamada.direccionConfirmada = false;
        llamadas.set(callSid, llamada);

        const textoConfirmacion = construirTextoConfirmacionUbicacion(parseada);

        const gather = response.gather({
            input: "dtmf",
            numDigits: 1,
            action: "/incoming-call/confirmar-direccion",
            method: "POST",
            timeout: 6,
            actionOnEmptyResult: true,
        });

        gather.say(
            { language: "es-ES", voice: "alice" },
            `${textoConfirmacion} Pulsa 1 para confirmar o 2 para repetir la dirección.`
        );

        const xml = response.toString();
        console.log("📤 TwiML /incoming-call/direccion (confirmar con teclado):", xml);

        res.type("text/xml");
        return res.send(xml);
    });

    app.post("/incoming-call/confirmar-direccion", (req, res) => {
        try {
            console.log("🔥 ENTRÓ /incoming-call/confirmar-direccion");
            console.log("BODY confirmar-direccion:", req.body);

            const body = req.body || {};
            const callSid = body.CallSid;
            const digits = (body.Digits || "").trim();

            const llamada = llamadas.get(callSid);
            const response = new twilio.twiml.VoiceResponse();

            if (!llamada) {
                response.say(
                    { language: "es-ES", voice: "alice" },
                    "No he podido recuperar la llamada."
                );
                response.hangup();
                res.type("text/xml");
                return res.send(response.toString());
            }

            if (!digits) {
                const gather = response.gather({
                    input: "dtmf",
                    numDigits: 1,
                    action: "/incoming-call/confirmar-direccion",
                    method: "POST",
                    timeout: 6,
                    actionOnEmptyResult: true,
                });

                gather.say(
                    { language: "es-ES", voice: "alice" },
                    "No he recibido ninguna opción. Pulsa 1 si la dirección es correcta o 2 para repetirla."
                );

                const xml = response.toString();
                console.log("📤 TwiML /incoming-call/confirmar-direccion (repetir confirmación):", xml);

                res.type("text/xml");
                return res.send(xml);
            }

            const confirma = digits === "1";
            const repetir = digits === "2";

            if (!confirma && !repetir) {
                const gather = response.gather({
                    input: "dtmf",
                    numDigits: 1,
                    action: "/incoming-call/confirmar-direccion",
                    method: "POST",
                    timeout: 6,
                    actionOnEmptyResult: true,
                });

                gather.say(
                    { language: "es-ES", voice: "alice" },
                    "Opción no válida. Pulsa 1 para confirmar o 2 para repetir la dirección."
                );

                const xml = response.toString();
                console.log("📤 TwiML /incoming-call/confirmar-direccion (opción inválida):", xml);

                res.type("text/xml");
                return res.send(xml);
            }

            if (repetir) {
                llamada.direccionPendienteConfirmacion = null;
                llamada.direccionPendienteParseada = null;
                llamada.direccionConfirmada = false;
                llamadas.set(callSid, llamada);

                const gather = response.gather({
                    input: "speech",
                    language: "es-ES",
                    action: "/incoming-call/direccion",
                    method: "POST",
                    speechTimeout: "auto",
                    timeout: 5,
                    actionOnEmptyResult: true,
                });

                gather.say(
                    { language: "es-ES", voice: "alice" },
                    "De acuerdo. Dime de nuevo la dirección o el lugar exacto de recogida."
                );

                const xml = response.toString();
                console.log("📤 TwiML /incoming-call/confirmar-direccion (volver a pedir dirección):", xml);

                res.type("text/xml");
                return res.send(xml);
            }

            const parseada =
                llamada.direccionPendienteParseada ||
                extraerDireccionYReferencia(llamada.direccionPendienteConfirmacion || "");

            llamada.recogida = llamada.direccionPendienteConfirmacion;
            llamada.recogidaTextoOriginal = parseada.textoOriginal;
            llamada.direccionBase = parseada.direccionBase;
            llamada.referenciaRecogida = parseada.referenciaRecogida;
            llamada.direccionPendienteConfirmacion = null;
            llamada.direccionPendienteParseada = null;
            llamada.direccionConfirmada = true;
            llamada.estado = "procesando";
            llamadas.set(callSid, llamada);

            response.say(
                { language: "es-ES", voice: "alice" },
                "Perfecto. Estamos buscando un taxi disponible."
            );

            response.redirect(
                { method: "POST" },
                "/incoming-call/espera"
            );

            const xml = response.toString();
            console.log("📤 TwiML /incoming-call/confirmar-direccion (a espera):", xml);

            res.type("text/xml");
            res.send(xml);

            setImmediate(async () => {
                try {
                    const resultado = await crearSolicitudTaxi(llamada);

                    llamada.solicitudCreada = resultado.ok;
                    llamada.referencia = resultado.referencia || null;
                    llamada.taxiAsignado = resultado.taxiAsignado || null;
                    llamada.estado = resultado.estado || "ofertada";

                    llamadas.set(callSid, llamada);

                    if (resultado.referencia) {
                        guardarLlamadaPorSolicitud(resultado.referencia, llamada);
                    }
                } catch (error) {
                    console.error("❌ Error creando solicitud tras confirmar dirección:", error.message);
                    llamada.estado = "error";
                    llamadas.set(callSid, llamada);
                }
            });
        } catch (error) {
            console.error("❌ Error en /incoming-call/confirmar-direccion:", error);

            const response = new twilio.twiml.VoiceResponse();
            response.say(
                { language: "es-ES", voice: "alice" },
                "Ha ocurrido un error confirmando la dirección."
            );
            response.hangup();

            res.type("text/xml");
            return res.send(response.toString());
        }
    });
    app.all("/incoming-call/status", async (req, res) => {
        console.log("🔥🔥🔥 ENTRÓ STATUS CALLBACK TWILIO");
        console.log("METHOD:", req.method);
        console.log("BODY:", req.body);
        console.log("QUERY:", req.query);

        try {
            const callSid = req.body?.CallSid || req.query?.CallSid || null;
            const callStatus = req.body?.CallStatus || req.query?.CallStatus || null;

            console.log("📞 Estado llamada Twilio:", { callSid, callStatus });

            if (!callSid || !callStatus) {
                return res.status(200).send("status-ok");
            }

            const estadosFinales = ["completed", "canceled", "busy", "failed", "no-answer"];

            if (!estadosFinales.includes(callStatus)) {
                return res.status(200).send("status-ok");
            }

            const llamada = llamadas.get(callSid);

            if (!llamada) {
                console.log("ℹ️ No había llamada activa en memoria para ese CallSid");
                return res.status(200).send("status-ok");
            }

            const solicitudId = llamada.referencia || null;

            if (!solicitudId) {
                llamadas.delete(callSid);
                return res.status(200).send("status-ok");
            }

            if (llamada.estado === "asignada" || llamada.taxiAsignado) {
                console.log("ℹ️ El cliente colgó pero ya había taxi asignado. No se cancela la solicitud.");
                eliminarLlamadaPorSolicitud(solicitudId);
                llamadas.delete(callSid);
                return res.status(200).send("status-ok");
            }

            console.log("📴 Cancelando solicitud por cuelgue:", {
                callSid,
                solicitudId,
                callStatus,
            });

            const ofertasCanceladas = await cancelarSolicitudPorCuelgue(solicitudId);
            const io = obtenerIo();

            for (const oferta of ofertasCanceladas || []) {
                io.to(`taxista:${oferta.taxistaId}`).emit("oferta:cancelada", {
                    ofertaId: oferta.ofertaId,
                    solicitudViajeId: solicitudId,
                    motivo: "cliente_colgo",
                });
            }

            eliminarLlamadaPorSolicitud(solicitudId);
            llamadas.delete(callSid);

            return res.status(200).send("status-ok");
        } catch (error) {
            console.error("❌ Error en status callback Twilio:", error.message);
            return res.status(200).send("status-error");
        }
    });
    app.post("/incoming-call/espera", (req, res) => {
        const body = req.body || {};
        const callSid = body.CallSid;
        const llamada = llamadas.get(callSid);

        const response = new twilio.twiml.VoiceResponse();

        if (!llamada) {
            response.say(
                { language: "es-ES", voice: "alice" },
                "No he podido recuperar el estado de la llamada."
            );
            response.hangup();
            res.type("text/xml");
            return res.send(response.toString());
        }

        if (llamada.taxiAsignado) {
            const numeroTaxi = llamada.taxiAsignado || "su taxi";
            const nombreTaxista = llamada.nombreTaxista || "el taxista asignado";
            const telefonoTaxista = llamada.telefonoTaxista || "No disponible";

            response.say(
                { language: "es-ES", voice: "alice" },
                `Su taxi asignado es el número ${numeroTaxi}, conducido por ${nombreTaxista}. Gracias por llamar.`
            );
            response.hangup();

            res.type("text/xml");
            res.send(response.toString());

            setImmediate(async () => {
                try {
                    await enviarSmsDatosTaxi({
                        telefonoCliente: llamada.telefono,
                        nombreTaxista,
                        telefonoTaxista,
                        numeroTaxi,
                    });
                } catch (error) {
                    console.error("❌ Error enviando SMS de taxi asignado:", error.message);
                } finally {
                    if (llamada.referencia) {
                        eliminarLlamadaPorSolicitud(llamada.referencia);
                    }
                    llamadas.delete(callSid);
                }
            });

            return;
        }

        if (llamada.estado === "sin_taxista") {
            response.say(
                { language: "es-ES", voice: "alice" },
                "Lo sentimos, en este momento no hay taxis disponibles. Vuelva a llamar en unos minutos."
            );
            response.hangup();

            if (llamada.referencia) {
                eliminarLlamadaPorSolicitud(llamada.referencia);
            }
            llamadas.delete(callSid);

            res.type("text/xml");
            return res.send(response.toString());
        }

        if (llamada.estado === "error") {
            response.say(
                { language: "es-ES", voice: "alice" },
                "Ha ocurrido un error al procesar su solicitud. Gracias por llamar."
            );
            response.hangup();

            if (llamada.referencia) {
                eliminarLlamadaPorSolicitud(llamada.referencia);
            }
            llamadas.delete(callSid);

            res.type("text/xml");
            return res.send(response.toString());
        }

        response.say(
            { language: "es-ES", voice: "alice" },
            "Seguimos buscando un taxi disponible. Un momento, por favor."
        );
        response.pause({ length: 6 });
        response.redirect(
            { method: "POST" },
            `${publicUrl}/incoming-call/espera`
        );

        res.type("text/xml");
        return res.send(response.toString());
    });

    app.post("/incoming-call/fin", (req, res) => {
        const response = new twilio.twiml.VoiceResponse();
        response.say(decir(), "Gracias por llamar.");
        response.hangup();
        res.type("text/xml");
        res.send(response.toString());
    });
}

module.exports = {
    registerIncomingCallRoute,
};