const twilio = require("twilio");
const { crearSolicitudTaxi } = require("../services/taxiServiceSoloTwilio");
const { twilioAccountSid, twilioAuthToken, publicUrl } = require("../configSoloTwilio");
const client = twilio(twilioAccountSid, twilioAuthToken);
const {
    guardarLlamadaPorSolicitud,
    obtenerLlamadaPorSolicitud,
    eliminarLlamadaPorSolicitud,
} = require("../llamadasActivas");


function decir(texto) {
    return { language: "es-ES", voice: "alice" };
}

function normalizarSiNoHayBody(req) {
    return req.body || {};
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
    });

    gather.say(decir(), texto);
    return response;
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
                direccionPendienteConfirmacion: null,
                direccionConfirmada: false,
                solicitudCreada: false,
                referencia: null,
                taxiAsignado: null,
                estado: null,
            });
        }

        const response = respuestaGather({
            texto: "Gracias por llamar a la central de taxis. ¿Me puedes decir tu nombre?",
            action: "/incoming-call/nombre",
        });

        res.type("text/xml");
        res.send(response.toString());
    });

    app.post("/incoming-call/asignada", (req, res) => {
        console.log(">>> POST /incoming-call/asignada");
        console.log("query:", req.query);

        const solicitudId = req.query.solicitudId;
        const llamada = obtenerLlamadaPorSolicitud(solicitudId);

        console.log("llamada recuperada:", llamada);

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

        response.say(
            { language: "es-ES", voice: "alice" },
            `Su taxi asignado es el número ${numeroTaxi}, conducido por ${nombreTaxista}. Gracias por llamar.`
        );

        response.hangup();

        eliminarLlamadaPorSolicitud(solicitudId);

        res.type("text/xml");
        res.send(response.toString());
    });

    app.post("/incoming-call/nombre", (req, res) => {
        const body = normalizarSiNoHayBody(req);
        const callSid = body.CallSid;
        const speech = (body.SpeechResult || "").trim();

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

    app.post("/incoming-call/direccion", (req, res) => {
        const body = req.body || {};
        const callSid = body.CallSid;
        const speech = (body.SpeechResult || "").trim();

        console.log(">>> POST /incoming-call/direccion");
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
            });

            gather.say(
                { language: "es-ES", voice: "alice" },
                "No he entendido bien la dirección. Por favor, repítela."
            );

            res.type("text/xml");
            return res.send(response.toString());
        }

        llamada.direccionPendienteConfirmacion = speech;
        llamada.direccionConfirmada = false;
        llamadas.set(callSid, llamada);

        const gather = response.gather({
            input: "speech",
            language: "es-ES",
            action: `${publicUrl}/incoming-call/confirmar-direccion`,
            method: "POST",
            speechTimeout: "auto",
            timeout: 5,
        });

        gather.say(
            { language: "es-ES", voice: "alice" },
            `He entendido esta dirección: ${speech}. Si es correcta, di sí. Si no, di no.`
        );

        res.type("text/xml");
        return res.send(response.toString());
    });

    app.post("/incoming-call/confirmar-direccion", (req, res) => {
        const body = req.body || {};
        const callSid = body.CallSid;
        const speech = (body.SpeechResult || "").trim().toLowerCase();

        console.log(">>> POST /incoming-call/confirmar-direccion");
        console.log("SpeechResult:", speech);
        console.log("CallSid:", callSid);

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

        const confirma = speech.includes("sí") || speech.includes("si");

        if (!confirma) {
            llamada.direccionPendienteConfirmacion = null;
            llamada.direccionConfirmada = false;
            llamadas.set(callSid, llamada);

            const gather = response.gather({
                input: "speech",
                language: "es-ES",
                action: `${publicUrl}/incoming-call/direccion`,
                method: "POST",
                speechTimeout: "auto",
                timeout: 5,
            });

            gather.say(
                { language: "es-ES", voice: "alice" },
                "De acuerdo. Dime de nuevo la dirección exacta de recogida."
            );

            res.type("text/xml");
            return res.send(response.toString());
        }

        llamada.recogida = llamada.direccionPendienteConfirmacion;
        llamada.direccionPendienteConfirmacion = null;
        llamada.direccionConfirmada = true;
        llamada.estado = "procesando";
        llamadas.set(callSid, llamada);

        response.say(
            { language: "es-ES", voice: "alice" },
            "Perfecto. Estamos buscando un taxi disponible."
        );
        response.pause({ length: 4 });
        response.redirect(
            { method: "POST" },
            `${publicUrl}/incoming-call/espera`
        );

        res.type("text/xml");
        res.send(response.toString());

        setImmediate(async () => {
            try {
                console.log("🚕 Lanzando crearSolicitudTaxi en segundo plano");
                console.log("llamada antes de crear solicitud:", llamada);

                const resultado = await crearSolicitudTaxi(llamada);

                console.log("resultado crearSolicitudTaxi:", resultado);

                llamada.solicitudCreada = resultado.ok;
                llamada.referencia = resultado.referencia || null;
                llamada.taxiAsignado = resultado.taxiAsignado || null;
                llamada.estado = resultado.estado || "ofertada";

                llamadas.set(callSid, llamada);

                if (resultado.referencia) {
                    guardarLlamadaPorSolicitud(resultado.referencia, llamada);
                    console.log("💾 Llamada guardada por solicitud:", resultado.referencia);
                }
            } catch (error) {
                console.error(
                    "❌ Error creando solicitud tras confirmar dirección:",
                    error.message
                );
                llamada.estado = "error";
                llamadas.set(callSid, llamada);
            }
        });
    });

    app.post("/incoming-call/espera", (req, res) => {
        const body = req.body || {};
        const callSid = body.CallSid;
        const llamada = llamadas.get(callSid);

        console.log(">>> POST /incoming-call/espera");
        console.log("callSid:", callSid);
        console.log("llamada:", llamada);

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
            response.say(
                { language: "es-ES", voice: "alice" },
                `Su taxi asignado es ${llamada.taxiAsignado}, conducido por ${llamada.nombreTaxista || "el taxista asignado"}. Gracias por llamar.`
            );
            response.hangup();

            if (llamada.referencia) {
                eliminarLlamadaPorSolicitud(llamada.referencia);
            }
            llamadas.delete(callSid);

            res.type("text/xml");
            return res.send(response.toString());
        }

        if (llamada.estado === "sin_taxista") {
            response.say(
                { language: "es-ES", voice: "alice" },
                "Lo sentimos, en este momento no hay taxis disponibles. Gracias por llamar."
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