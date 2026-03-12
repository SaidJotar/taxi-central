const express = require("express");
const http = require("http");
const cors = require("cors");
const { port } = require("./configSoloTwilio");
const { registerIncomingCallRoute } = require("./routes/incomingCallSoloTwilio");
const { registerMediaStream } = require("./ws/mediaStream");
const { leerJsonArray } = require("./services/storageService");
const prisma = require("./services/bd");
const { iniciarSocket } = require("./socketSoloTwilio");
const { obtenerIo } = require("./socket");
const authRoutes = require("./routes/auth");

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://sjaceuta.es",
    "https://www.sjaceuta.es",
    "https://api.sjaceuta.es",
    "https://taxista.sjaceuta.es"
  ],
  credentials: true,
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/auth", authRoutes);

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
