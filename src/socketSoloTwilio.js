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
const { verificarToken } = require("./services/authToken");
const { buscarParadaCercanaParaEntrada } = require("./services/paradasService");
const { distanciaMetros } = require("./services/geoUtils");

const twilioClient =
  twilioAccountSid && twilioAuthToken
    ? twilio(twilioAccountSid, twilioAuthToken)
    : null;

let io = null;

const sugerenciasParada = new Map();
const RADIO_ENTRADA_PARADA_METROS = 40;
const RADIO_SALIDA_PARADA_METROS = 80;
const TIEMPO_CONFIRMACION_PARADA_MS = 20000;
const COOLDOWN_RECHAZO_PARADA_MS = 60000;

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

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Token no proporcionado"));
      }

      const payload = verificarToken(token);

      if (!payload || payload.tipo !== "taxista") {
        return next(new Error("Token inválido"));
      }

      socket.taxistaAuth = {
        taxistaId: payload.sub,
        telefono: payload.telefono,
      };

      next();
    } catch (error) {
      console.error("error auth socket:", error.message);
      next(new Error("No autorizado"));
    }
  });

  io.on("connection", async (socket) => {

    try {
      const taxistaId = socket.taxistaAuth?.taxistaId;

      if (!taxistaId) {
        socket.disconnect();
        return;
      }

      socket.join(`taxista:${taxistaId}`);

      const taxista = await prisma.taxista.findUnique({
        where: { id: taxistaId },
        include: { vehiculo: true },
      });

      if (taxista) {
        socket.emit("taxista:conectado", {
          ok: true,
          taxista,
        });
      }
    } catch (error) {
      console.error("Error al conectar taxista:", error.message);
      socket.emit("error:general", { message: error.message });
    }

    socket.on("taxista:conectar", async () => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId) {
          socket.emit("error:general", {
            message: "No autorizado",
          });
          return;
        }
      } catch (error) {
        console.error("Error taxista:conectar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:confirmar_parada", async ({ paradaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan datos para confirmar parada",
          });
          return;
        }

        const sugerencia = sugerenciasParada.get(taxistaId);

        if (!sugerencia || sugerencia.paradaId !== paradaId) {
          socket.emit("error:general", {
            message: "No hay sugerencia de parada válida",
          });
          return;
        }

        if (Date.now() > sugerencia.expiraEn) {
          sugerenciasParada.delete(taxistaId);
          socket.emit("error:general", {
            message: "La sugerencia de parada ha expirado",
          });
          return;
        }

        sugerenciasParada.delete(taxistaId);

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            paradaId,
            enParadaDesde: new Date(),
            estado: "disponible",
          },
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        socket.emit("taxista:parada_confirmada", {
          ok: true,
          taxista,
        });

        console.log(`✅ Taxista ${taxistaId} confirmado en parada ${paradaId}`);

        await intentarOfertarSolicitudPendienteATaxista(taxistaId);

      } catch (error) {
        console.error("Error taxista:confirmar_parada:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("servicio:terminar", async ({ solicitudId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!solicitudId || !taxistaId) {
          socket.emit("error:general", {
            message: "Faltan datos para terminar el servicio",
          });
          return;
        }

        const solicitud = await prisma.solicitudViaje.findUnique({
          where: { id: solicitudId },
          include: {
            asignacion: true,
          },
        });

        if (!solicitud) {
          socket.emit("error:general", {
            message: "Solicitud no encontrada",
          });
          return;
        }

        if (!solicitud.asignacion || solicitud.asignacion.taxistaId !== taxistaId) {
          socket.emit("error:general", {
            message: "No autorizado para terminar este servicio",
          });
          return;
        }

        await prisma.solicitudViaje.update({
          where: { id: solicitudId },
          data: {
            estado: "completada",
          },
        });

        await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            estado: "disponible",
          },
        });

        const taxistaActualizado = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: { vehiculo: true },
        });

        socket.emit("servicio:terminado_ok", {
          ok: true,
          solicitudId,
          taxista: taxistaActualizado,
        });

        // IMPORTANTE: intentar lanzar una pendiente en cuanto quede libre
        intentarOfertarSolicitudPendienteATaxista(taxistaId);

      } catch (error) {
        console.error("Error servicio:terminar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:cambiar_estado", async ({ estado }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !estado) {
          socket.emit("error:general", {
            message: "Faltan credenciales o estado",
          });
          return;
        }

        const dataUpdate = { estado };

        if (estado !== "disponible") {
          dataUpdate.paradaId = null;
          dataUpdate.enParadaDesde = null;
        }

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: dataUpdate,
          include: { vehiculo: true, parada: true },
        });

        socket.emit("taxista:estado_actualizado", {
          ok: true,
          taxista,
        });

        if (estado === "disponible") {
          await intentarOfertarSolicitudPendienteATaxista(taxistaId);
        }
      } catch (error) {
        console.error("Error taxista:cambiar_estado:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("oferta:aceptar", async ({ ofertaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

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

        if (llamadaActiva) {
          const nombreTaxista =
            solicitudActualizada?.asignacion?.taxista?.nombreCompleto ||
            "el taxista asignado";

          const numeroTaxi =
            solicitudActualizada?.asignacion?.vehiculo?.numeroTaxi ||
            "su taxi";

          const telefonoTaxista =
            solicitudActualizada?.asignacion?.taxista?.telefono || null;

          llamadaActiva.taxiAsignado = numeroTaxi;
          llamadaActiva.nombreTaxista = nombreTaxista;
          llamadaActiva.telefonoTaxista = telefonoTaxista;
          llamadaActiva.estado = "asignada";
        }

        socket.emit("oferta:aceptada_ok", {
          ok: true,
          ofertaId,
          solicitudViajeId: oferta.solicitudViajeId,
          solicitud: {
            id: solicitudActualizada.id,
            nombreCliente: solicitudActualizada.nombreCliente,
            telefonoCliente: solicitudActualizada.telefonoCliente,
            direccionRecogida: solicitudActualizada.direccionRecogida,
            estado: solicitudActualizada.estado,
          },
        });

        console.log(`✅ Oferta ${ofertaId} aceptada por taxista ${taxistaId}`);
      } catch (error) {
        console.error("Error oferta:aceptar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:llegar_parada", async ({ paradaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan taxistaId o paradaId",
          });
          return;
        }

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            paradaId,
            enParadaDesde: new Date(),
            estado: "disponible",
          },
          include: { vehiculo: true, parada: true },
        });

        socket.emit("taxista:estado_actualizado", {
          ok: true,
          taxista,
        });

        await intentarOfertarSolicitudPendienteATaxista(taxistaId);

      } catch (error) {
        console.error("Error taxista:llegar_parada:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:ubicacion", async ({ lat, lng }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId) {
          socket.emit("error:general", {
            message: "No autorizado",
          });
          return;
        }

        if (typeof lat !== "number" || typeof lng !== "number") {
          socket.emit("error:general", {
            message: "Ubicación inválida",
          });
          return;
        }

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          socket.emit("error:general", {
            message: "Ubicación inválida",
          });
          return;
        }

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            lat,
            lng,
            ubicacionActualizadaEn: new Date(),
          },
          include: {
            parada: true,
            vehiculo: true,
          },
        });

        // Si ya está en una parada, comprobar salida automática
        if (taxista.paradaId && taxista.parada) {
          const distanciaSalida = distanciaMetros(
            lat,
            lng,
            taxista.parada.lat,
            taxista.parada.lng
          );

          const tiempoEnParadaMs = taxista.enParadaDesde
            ? Date.now() - new Date(taxista.enParadaDesde).getTime()
            : 0;

          if (
            tiempoEnParadaMs > 15000 &&
            distanciaSalida > RADIO_SALIDA_PARADA_METROS
          ) {
            const taxistaActualizado = await prisma.taxista.update({
              where: { id: taxistaId },
              data: {
                paradaId: null,
                enParadaDesde: null,
              },
              include: {
                vehiculo: true,
                parada: true,
              },
            });

            socket.emit("taxista:salio_parada", {
              ok: true,
              taxista: taxistaActualizado,
            });

            console.log(`🚕 Taxista ${taxistaId} salió automáticamente de parada`);
          }

          return;
        }

        // Si ya tiene sugerencia pendiente, no enviar otra
        const pendiente = sugerenciasParada.get(taxistaId);
        const ahora = Date.now();

        if (pendiente) {
          // si hay cooldown activo para la misma parada, no insistir
          if (pendiente.ignoradasHasta && ahora < pendiente.ignoradasHasta) {
            return;
          }

          // si hay sugerencia pendiente sin expirar, no duplicar
          if (pendiente.expiraEn && ahora < pendiente.expiraEn) {
            return;
          }
        }

        const paradaCercana = await buscarParadaCercanaParaEntrada(
          lat,
          lng,
          RADIO_ENTRADA_PARADA_METROS
        );

        if (!paradaCercana) {
          return;
        }

        // Evitar repetir la misma parada durante cooldown
        if (
          pendiente &&
          pendiente.paradaId === paradaCercana.id &&
          pendiente.ignoradasHasta &&
          ahora < pendiente.ignoradasHasta
        ) {
          return;
        }

        const expiraEn = ahora + TIEMPO_CONFIRMACION_PARADA_MS;

        sugerenciasParada.set(taxistaId, {
          paradaId: paradaCercana.id,
          expiraEn,
          ignoradasHasta: null,
        });

        socket.emit("taxista:parada_sugerida", {
          ok: true,
          parada: {
            id: paradaCercana.id,
            nombre: paradaCercana.nombre,
            direccion: paradaCercana.direccion,
            distanciaMetros: Math.round(paradaCercana.distanciaMetros),
          },
          expiresAt: new Date(expiraEn).toISOString(),
        });

      } catch (error) {
        console.error("Error taxista:ubicacion:", error.message);
      }
    });

    socket.on("taxista:rechazar_parada", async ({ paradaId, motivo }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan datos para rechazar parada",
          });
          return;
        }

        const sugerencia = sugerenciasParada.get(taxistaId);

        if (!sugerencia || sugerencia.paradaId !== paradaId) {
          return;
        }

        sugerenciasParada.set(taxistaId, {
          paradaId,
          expiraEn: null,
          ignoradasHasta: Date.now() + COOLDOWN_RECHAZO_PARADA_MS,
        });

        socket.emit("taxista:parada_rechazada_ok", {
          ok: true,
          paradaId,
          motivo: motivo || "rechazada",
        });

      } catch (error) {
        console.error("Error taxista:rechazar_parada:", error.message);
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

        await programarSiguienteOferta(oferta.solicitudViajeId);
      } catch (error) {
        console.error("Error oferta:rechazar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
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