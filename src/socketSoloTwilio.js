const { Server } = require("socket.io");
const twilio = require("twilio");
const prisma = require("./services/bd");
const {
  obtenerLlamadaPorSolicitud,
  eliminarLlamadaPorSolicitud,
} = require("./llamadasActivas");
const {
  programarSiguienteOferta,
  intentarOfertarSolicitudPendienteATaxista,
} = require("./services/ofertasServiceSoloTwilio");
const {
  twilioAccountSid,
  twilioAuthToken,
  publicUrl,
} = require("./configSoloTwilio");

const twilioClient =
  twilioAccountSid && twilioAuthToken
    ? twilio(twilioAccountSid, twilioAuthToken)
    : null;

let io = null;

function iniciarSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "https://taxista.sjaceuta.es",
        "https://sjaceuta.es",
        "https://www.sjaceuta.es",
        "https://api.sjaceuta.es",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Taxista conectado por socket:", socket.id);

    socket.on("taxista:conectar", async ({ taxistaId }) => {
      try {
        if (!taxistaId) {
          socket.emit("error:general", {
            message: "Falta taxistaId en taxista:conectar",
          });
          return;
        }

        console.log("➡️ taxista:conectar recibido para", taxistaId);

        socket.join(`taxista:${taxistaId}`);

        const taxista = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: { vehiculo: true },
        });

        if (!taxista) {
          socket.emit("error:general", {
            message: "Taxista no encontrado",
          });
          return;
        }

        console.log(`✅ Taxista ${taxistaId} unido a sala taxista:${taxistaId}`);

        socket.emit("taxista:conectado", {
          ok: true,
          taxista,
        });
      } catch (error) {
        console.error("Error taxista:conectar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:cambiar_estado", async ({ taxistaId, estado }) => {
      try {
        if (!taxistaId || !estado) {
          socket.emit("error:general", {
            message: "Faltan taxistaId o estado",
          });
          return;
        }

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: { estado },
          include: { vehiculo: true },
        });

        socket.emit("taxista:estado_actualizado", {
          ok: true,
          taxista,
        });

        console.log(`🔄 Estado taxista ${taxistaId} -> ${estado}`);

        if (estado === "disponible") {
          const oferta = await intentarOfertarSolicitudPendienteATaxista(taxistaId);

          if (oferta) {
            console.log(
              `📨 Se ha lanzado una oferta pendiente al taxista ${taxistaId}`
            );
          }
        }
      } catch (error) {
        console.error("Error taxista:cambiar_estado:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("oferta:aceptar", async ({ ofertaId, taxistaId }) => {
      try {
        if (!ofertaId || !taxistaId) {
          socket.emit("error:general", {
            message: "Faltan ofertaId o taxistaId",
          });
          return;
        }

        const oferta = await prisma.ofertaSolicitud.findUnique({
          where: { id: ofertaId },
          include: {
            solicitudViaje: true,
            taxista: {
              include: {
                vehiculo: true,
              },
            },
          },
        });

        if (!oferta) {
          socket.emit("error:general", { message: "Oferta no encontrada" });
          return;
        }

        if (oferta.estado !== "pendiente") {
          socket.emit("error:general", {
            message: "La oferta ya no está disponible",
          });
          return;
        }

        if (!oferta.taxista || !oferta.taxista.vehiculo) {
          socket.emit("error:general", {
            message: "El taxista no tiene vehículo asociado",
          });
          return;
        }

        await prisma.ofertaSolicitud.update({
          where: { id: ofertaId },
          data: {
            estado: "aceptada",
            respondidaEn: new Date(),
          },
        });

        await prisma.asignacionSolicitud.create({
          data: {
            solicitudViajeId: oferta.solicitudViajeId,
            taxistaId,
            vehiculoId: oferta.taxista.vehiculo.id,
          },
        });

        await prisma.solicitudViaje.update({
          where: { id: oferta.solicitudViajeId },
          data: {
            estado: "asignada",
          },
        });

        await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            estado: "ocupado",
          },
        });

        const solicitudActualizada = await prisma.solicitudViaje.findUnique({
          where: { id: oferta.solicitudViajeId },
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

        const llamadaActiva = obtenerLlamadaPorSolicitud(oferta.solicitudViajeId);

        console.log("📞 Buscando llamada activa para solicitud:", oferta.solicitudViajeId);
        console.log("📞 llamadaActiva:", llamadaActiva);

        if (llamadaActiva) {
          const nombreTaxista =
            solicitudActualizada?.asignacion?.taxista?.nombreCompleto ||
            "el taxista asignado";

          const numeroTaxi =
            solicitudActualizada?.asignacion?.vehiculo?.numeroTaxi ||
            "su taxi";

          llamadaActiva.taxiAsignado = numeroTaxi;
          llamadaActiva.nombreTaxista = nombreTaxista;
          llamadaActiva.estado = "asignada";

          console.log(
            `📞 Taxi asignado a la llamada de la solicitud ${oferta.solicitudViajeId}: ${numeroTaxi} - ${nombreTaxista}`
          );
        }

        socket.emit("oferta:aceptada_ok", {
          ok: true,
          ofertaId,
          solicitudViajeId: oferta.solicitudViajeId,
          solicitud: solicitudActualizada,
        });

        console.log(`✅ Oferta ${ofertaId} aceptada por taxista ${taxistaId}`);
      } catch (error) {
        console.error("Error oferta:aceptar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("oferta:rechazar", async ({ ofertaId }) => {
      try {
        if (!ofertaId) {
          socket.emit("error:general", {
            message: "Falta ofertaId",
          });
          return;
        }

        const oferta = await prisma.ofertaSolicitud.findUnique({
          where: { id: ofertaId },
        });

        if (!oferta) {
          socket.emit("error:general", { message: "Oferta no encontrada" });
          return;
        }

        if (oferta.estado !== "pendiente") {
          socket.emit("error:general", {
            message: "La oferta ya no está disponible para rechazar",
          });
          return;
        }

        await prisma.ofertaSolicitud.update({
          where: { id: ofertaId },
          data: {
            estado: "rechazada",
            respondidaEn: new Date(),
          },
        });

        socket.emit("oferta:rechazada_ok", {
          ok: true,
          ofertaId,
        });

        console.log(`❌ Oferta ${ofertaId} rechazada`);

        await programarSiguienteOferta(oferta.solicitudViajeId);
      } catch (error) {
        console.error("Error oferta:rechazar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔴 Socket desconectado:", socket.id);
    });
  });

  return io;
}

function obtenerIo() {
  if (!io) {
    throw new Error("Socket.IO no está inicializado");
  }
  return io;
}

module.exports = {
  iniciarSocket,
  obtenerIo,
};