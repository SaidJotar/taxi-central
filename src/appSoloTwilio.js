const express = require("express");
const http = require("http");
const cors = require("cors");
const { port } = require("./configSoloTwilio");
const { registerIncomingCallRoute } = require("./routes/incomingCallSoloTwilio");
const { registerMediaStream } = require("./ws/mediaStream");
const { leerJsonArray } = require("./services/storageService");
const prisma = require("./services/bd");
const { iniciarSocket } = require("./socketSoloTwilio");
const { obtenerIo } = require("./socketSoloTwilio");
const authRoutes = require("./routes/auth");
const { geocodificarDireccion } = require("./services/geocodingService");
const { buscarParadaMasCercana } = require("./services/paradasService");
const mobileRoutes = require("./routes/mobile");

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://sjaceuta.es",
  "https://www.sjaceuta.es",
  "https://api.sjaceuta.es",
  "https://taxista.sjaceuta.es",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS no permitido para origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/mobile", mobileRoutes);

const server = http.createServer(app);
const llamadas = new Map();

app.get("/", (req, res) => {
  res.send("Servidor taxi-ai funcionando");
});

app.get("/taxistas", async (req, res) => {
  try {
    const taxistas = await prisma.taxista.findMany({
      include: {
        vehiculo: true,
      },
      orderBy: {
        creadoEn: "asc",
      },
    });

    res.json(taxistas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const { buscarSiguienteTaxistaDisponible, emitirOfertaATaxista } = require("./services/ofertasServiceSoloTwilio");

app.all("/debug-status", (req, res) => {
  console.log("🔥🔥🔥 ENTRÓ /debug-status");
  console.log("BODY:", req.body);
  console.log("QUERY:", req.query);
  res.status(200).send("debug-status-ok");
});

app.post("/test/oferta-real", async (req, res) => {
  try {
    const {
      nombreCliente = "Cliente Test",
      telefonoCliente = "+34600000000",
      direccionRecogida = "Gran Vía 25",
      direccionBase = null,
      referenciaRecogida = null,
    } = req.body || {};

    const textoParaGeo = direccionBase || direccionRecogida;

    let geo = null;
    let paradaSugerida = null;

    try {
      if (textoParaGeo) {
        geo = await geocodificarDireccion(textoParaGeo);
      }

      if (geo?.lat != null && geo?.lng != null) {
        paradaSugerida = await buscarParadaMasCercana(geo.lat, geo.lng);
      }
    } catch (e) {
      console.error("❌ Error geocodificando test/oferta-real:", e.message);
    }

    const solicitud = await prisma.solicitudViaje.create({
      data: {
        nombreCliente,
        telefonoCliente,
        direccionRecogida,
        direccionBase,
        referenciaRecogida,
        latRecogida: geo?.lat ?? null,
        lngRecogida: geo?.lng ?? null,
        paradaSugeridaId: paradaSugerida?.id ?? null,
        estado: "pendiente",
        confirmadaEn: new Date(),
      },
    });

    const taxista = await buscarSiguienteTaxistaDisponible(solicitud.id);

    if (!taxista) {
      return res.status(404).json({
        ok: false,
        error: "No hay taxistas disponibles",
        solicitud,
      });
    }

    await prisma.solicitudViaje.update({
      where: { id: solicitud.id },
      data: { estado: "ofertada" },
    });

    const oferta = await emitirOfertaATaxista({
      solicitud,
      taxista,
    });

    res.json({
      ok: true,
      solicitudId: solicitud.id,
      ofertaId: oferta.id,
      taxistaId: taxista.id,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.get("/vehiculos", async (req, res) => {
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      include: {
        taxista: true,
      },
      orderBy: {
        creadoEn: "asc",
      },
    });

    res.json(vehiculos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

registerIncomingCallRoute(app, llamadas);
registerMediaStream(server, llamadas);

iniciarSocket(server);

module.exports = {
  app,
  server,
  port,
};
