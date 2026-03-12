const twilio = require("twilio");
const { publicUrl } = require("../config");

function registerIncomingCallRoute(app, llamadas) {
  app.post("/incoming-call", (req, res) => {
    console.log(">>> POST /incoming-call RECIBIDO");
    console.log("Body:", req.body);

    const body = req.body || {};

    const telefonoCliente =
      body.Direction === "outbound-api"
        ? (body.To || null)
        : (body.From || null);

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
        ultimoCallIdStoreAddress: null,
      });
    }

    const wsUrl = `${publicUrl.replace("https://", "wss://")}/media-stream`;
    console.log("WS URL que devolvemos a Twilio:", wsUrl);

    const response = new twilio.twiml.VoiceResponse();

    response.say(
      { language: "es-ES", voice: "alice" },
      "Gracias por llamar a la Central de taxis. Espere un momento, por favor."
    );

    response.pause({ length: 1 });

    const connect = response.connect();
    connect.stream({ url: wsUrl });

    res.type("text/xml");
    res.send(response.toString());
  });
}

module.exports = {
  registerIncomingCallRoute,
};