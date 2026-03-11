const express = require("express");
const http = require("http");
const { port } = require("./config");
const { registerIncomingCallRoute } = require("./routes/incomingCall");
const { registerMediaStream } = require("./ws/mediaStream");
const { leerJsonArray } = require("./services/storageService");
const prisma = require("./services/bd");
const { iniciarSocket } = require("./socket");
const { obtenerIo } = require("./socket");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const server = http.createServer(app);
const llamadas = new Map();

app.get("/", (req, res) => {
  res.send("Servidor taxi-ai funcionando");
});

//app.get("/solicitudes", (req, res) => {
//  res.json(leerJsonArray("solicitudes.json"));
//});

app.get("/solicitudes", async (req, res) => {
  try {
    const solicitudes = await prisma.solicitudViaje.findMany({
      orderBy: {
        creadaEn: "desc",
      },
    });

    res.json(solicitudes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

//app.get("/taxis", (req, res) => {
//  res.json(leerJsonArray("taxis.json"));
//});

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

app.get("/ofertas", async (req, res) => {
  try {
    const ofertas = await prisma.ofertaSolicitud.findMany({
      include: {
        solicitudViaje: true,
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
      orderBy: {
        ofrecidaEn: "desc",
      },
    });

    res.json(ofertas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/solicitudes/:id", async (req, res) => {
  try {
    const solicitud = await prisma.solicitudViaje.findUnique({
      where: { id: req.params.id },
      include: {
        asignacion: {
          include: {
            taxista: true,
            vehiculo: true,
          },
        },
        ofertas: true,
      },
    });

    if (!solicitud) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json(solicitud);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/prueba/oferta/:taxistaId", async (req, res) => {
  try {
    const { taxistaId } = req.params;

    const solicitud = await prisma.solicitudViaje.create({
      data: {
        nombreCliente: "Cliente Demo",
        telefonoCliente: "600000999",
        direccionRecogida: "Calle Mayor 10",
        estado: "ofertada",
        origen: "operador",
        confirmadaEn: new Date(),
      },
    });

    const oferta = await prisma.ofertaSolicitud.create({
      data: {
        solicitudViajeId: solicitud.id,
        taxistaId,
        estado: "pendiente",
      },
    });

    const io = obtenerIo();

    io.to(`taxista:${taxistaId}`).emit("oferta:recibida", {
      ofertaId: oferta.id,
      solicitud: {
        id: solicitud.id,
        nombreCliente: solicitud.nombreCliente,
        telefonoCliente: solicitud.telefonoCliente,
        direccionRecogida: solicitud.direccionRecogida,
      },
    });

    res.json({
      ok: true,
      ofertaId: oferta.id,
      solicitudId: solicitud.id,
    });
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