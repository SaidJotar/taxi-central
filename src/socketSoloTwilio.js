const { Server } = require("socket.io");
const prisma = require("./services/bd");
const { obtenerLlamadaPorSolicitud } = require("./llamadasActivas");
const {
  programarSiguienteOferta,
  intentarOfertarSolicitudPendienteATaxista,
} = require("./services/ofertasServiceSoloTwilio");
const { verificarToken } = require("./services/authToken");
const { distanciaMetros } = require("./services/geoUtils");
const {
  buscarParadaCercanaParaEntrada,
  obtenerColaParada,
} = require("./services/paradasService");

let io = null;

const sugerenciasParada = new Map();
const autoEntradaParadaTimers = new Map();

const RADIO_ENTRADA_PARADA_METROS = 40;
const RADIO_SALIDA_PARADA_METROS = 80;
const TIEMPO_CONFIRMACION_PARADA_MS = 10000;
const COOLDOWN_RECHAZO_PARADA_MS = 60000;
const GPS_CADUCADO_MS = 120000;

function limpiarTimerAutoEntrada(taxistaId) {
  const timer = autoEntradaParadaTimers.get(taxistaId);
  if (timer) {
    clearTimeout(timer);
    autoEntradaParadaTimers.delete(taxistaId);
  }
}

function limpiarSugerenciaParada(taxistaId) {
  sugerenciasParada.delete(taxistaId);
  limpiarTimerAutoEntrada(taxistaId);

  if (io) {
    io.to(`taxista:${taxistaId}`).emit("taxista:parada_sugerida_cancelada", {
      ok: true,
    });
  }
}

function limpiarTimerAutoEntrada(taxistaId) {
  const timer = autoEntradaParadaTimers.get(taxistaId);
  if (timer) {
    clearTimeout(timer);
    autoEntradaParadaTimers.delete(taxistaId);
  }
}

function cancelarSugerenciaParada(socket, taxistaId, motivo = "salio_del_radio") {
  const sugerencia = sugerenciasParada.get(taxistaId);

  if (!sugerencia) return;

  limpiarSugerenciaParada(taxistaId);

  socket.emit("taxista:parada_sugerida_cancelada", {
    ok: true,
    paradaId: sugerencia.paradaId,
    motivo,
  });
}

async function emitirColaParadaActualizada(paradaId) {
  if (!io || !paradaId) return;

  const cola = await obtenerColaParada(paradaId);

  io.emit("parada:cola_actualizada", {
    paradaId,
    cola,
  });
}

async function desconectarTaxistasSinGps() {
  if (!io) return;

  const limite = new Date(Date.now() - GPS_CADUCADO_MS);

  const taxistas = await prisma.taxista.findMany({
    where: {
      estado: "disponible",
      OR: [
        { ubicacionActualizadaEn: null },
        { ubicacionActualizadaEn: { lt: limite } },
      ],
    },
    include: {
      parada: true,
      vehiculo: true,
    },
  });

  for (const taxista of taxistas) {
    const paradaAnteriorId = taxista.paradaId || null;

    const actualizado = await prisma.taxista.update({
      where: { id: taxista.id },
      data: {
        estado: "desconectado",
        paradaId: null,
        enParadaDesde: null,
      },
      include: {
        vehiculo: true,
        parada: true,
      },
    });

    sugerenciasParada.delete(taxista.id);
    limpiarTimerAutoEntrada(taxista.id);

    io.to(`taxista:${taxista.id}`).emit(
      "taxista:estado_actualizado",
      {
        ok: true,
        taxista: actualizado,
      }
    );

    io.to(`taxista:${taxista.id}`).emit("taxista:gps_requerido", {
      ok: false,
      message: "GPS inactivo. Has sido pasado a desconectado.",
    });

    if (paradaAnteriorId) {
      await emitirColaParadaActualizada(paradaAnteriorId);
    }
  }
}

function iniciarSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:5173",
        "https://taxista.sjaceuta.es",
        "https://sjaceuta.es",
        "https://www.sjaceuta.es",
        "https://api.sjaceuta.es",
        "https://objetos.sjaceuta.es",
      ],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  setInterval(() => {
    desconectarTaxistasSinGps().catch((err) => {
      console.error("Error comprobando taxistas sin GPS:", err.message);
    });
  }, 15000);

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
        include: {
          vehiculo: true,
          parada: true,
        },
      });

      if (taxista) {
        socket.emit("taxista:conectado", {
          ok: true,
          taxista,
        });
      }

      if (taxista?.paradaId) {
        await emitirColaParadaActualizada(taxista.paradaId);
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

        const taxista = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        if (taxista) {
          socket.emit("taxista:conectado", {
            ok: true,
            taxista,
          });
        }
      } catch (error) {
        console.error("Error taxista:conectar:", error.message);
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

        const actual = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        if (!actual) {
          socket.emit("error:general", {
            message: "Taxista no encontrado",
          });
          return;
        }

        if (estado === "disponible") {
          const gpsReciente =
            actual.ubicacionActualizadaEn &&
            Date.now() -
            new Date(actual.ubicacionActualizadaEn).getTime() <=
            GPS_CADUCADO_MS;

          if (!gpsReciente) {
            socket.emit("taxista:gps_requerido", {
              ok: false,
              message: "Activa el GPS para poder ponerte disponible.",
            });

            socket.emit("error:general", {
              message: "GPS inactivo o sin actualizar",
            });

            return;
          }
        }

        // Guardamos la parada antes de eliminarla
        const paradaAnteriorId = actual.paradaId || null;

        const dataUpdate = {
          estado,
        };

        if (estado !== "disponible") {
          dataUpdate.paradaId = null;
          dataUpdate.enParadaDesde = null;

          limpiarSugerenciaParada(taxistaId);
        }

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: dataUpdate,
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        socket.emit("taxista:estado_actualizado", {
          ok: true,
          taxista,
        });

        // Si salió de una parada, avisar a todos con la nueva cola
        if (
          paradaAnteriorId &&
          estado !== "disponible"
        ) {
          await emitirColaParadaActualizada(paradaAnteriorId);
        }

        if (estado === "disponible") {
          await intentarOfertarSolicitudPendienteATaxista(taxistaId);
        }
      } catch (error) {
        console.error("Error taxista:cambiar_estado:", error.message);

        socket.emit("error:general", {
          message: error.message,
        });
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
        /*
        console.log("📍 backend recibe ubicación", {
          taxistaId,
          lat,
          lng,
          at: new Date().toISOString(),
        });
*/
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

        // Si está desconectado, no gestionar paradas
        if (taxista.estado === "desconectado") {
          cancelarSugerenciaParada(socket, taxistaId, "desconectado");
          return;
        }

        // --------------------------------------------------
        // YA ESTÁ EN PARADA -> comprobar salida automática
        // --------------------------------------------------
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
                estado: "disponible",
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

            await emitirColaParadaActualizada(taxista.paradaId);

            const oferta = await intentarOfertarSolicitudPendienteATaxista(
              taxistaId
            );

          }

          return;
        }

        // --------------------------------------------------
        // NO ESTÁ EN PARADA -> comprobar posible entrada
        // --------------------------------------------------
        const pendiente = sugerenciasParada.get(taxistaId);
        const ahora = Date.now();

        // Si está en cooldown por rechazo, no volver a sugerir
        if (pendiente?.ignoradasHasta && ahora < pendiente.ignoradasHasta) {
          return;
        }

        const paradaCercana = await buscarParadaCercanaParaEntrada(
          lat,
          lng,
          RADIO_ENTRADA_PARADA_METROS
        );

        // Si ya no hay parada cercana, cancelar la sugerencia actual
        if (!paradaCercana) {
          if (pendiente) {
            cancelarSugerenciaParada(socket, taxistaId, "salio_del_radio");
          }
          return;
        }

        // Si ya existe sugerencia activa para esta misma parada, no regenerarla
        if (
          pendiente &&
          pendiente.paradaId === paradaCercana.id &&
          (!pendiente.ignoradasHasta || ahora >= pendiente.ignoradasHasta)
        ) {
          return;
        }

        // Si había sugerencia anterior para otra parada, cancelarla primero
        if (pendiente && pendiente.paradaId !== paradaCercana.id) {
          cancelarSugerenciaParada(socket, taxistaId, "cambio_de_parada");
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

        // Crear timer automático solo si no existe ya
        if (!autoEntradaParadaTimers.has(taxistaId)) {
          const paradaDetectadaId = paradaCercana.id;

          const timer = setTimeout(async () => {
            try {
              const sugerencia = sugerenciasParada.get(taxistaId);
              if (!sugerencia) return;
              if (sugerencia.paradaId !== paradaDetectadaId) return;

              const taxistaActual = await prisma.taxista.findUnique({
                where: { id: taxistaId },
                include: { vehiculo: true, parada: true },
              });

              if (!taxistaActual) return;
              if (taxistaActual.estado !== "disponible") return;
              if (taxistaActual.paradaId) return;

              const gpsReciente =
                taxistaActual.ubicacionActualizadaEn &&
                Date.now() -
                new Date(taxistaActual.ubicacionActualizadaEn).getTime() <=
                GPS_CADUCADO_MS;

              if (!gpsReciente) return;

              const taxistaActualizado = await prisma.taxista.update({
                where: { id: taxistaId },
                data: {
                  paradaId: paradaDetectadaId,
                  enParadaDesde: new Date(),
                  estado: "disponible",
                },
                include: {
                  vehiculo: true,
                  parada: true,
                },
              });

              limpiarSugerenciaParada(taxistaId);

              socket.emit("taxista:parada_confirmada", {
                ok: true,
                auto: true,
                taxista: taxistaActualizado,
              });

              await emitirColaParadaActualizada(paradaDetectadaId);

              const oferta = await intentarOfertarSolicitudPendienteATaxista(
                taxistaId
              );

            } catch (error) {
              console.error("Error autoentrada parada:", error.message);
            } finally {
              limpiarTimerAutoEntrada(taxistaId);
            }
          }, TIEMPO_CONFIRMACION_PARADA_MS);

          autoEntradaParadaTimers.set(taxistaId, timer);
        }

      } catch (error) {
        console.error("Error taxista:ubicacion:", error.message);
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

        if (sugerencia.expiraEn && Date.now() > sugerencia.expiraEn) {
          limpiarSugerenciaParada(taxistaId);

          socket.emit("error:general", {
            message: "La sugerencia de parada ha expirado",
          });
          return;
        }

        limpiarSugerenciaParada(taxistaId);

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

        await emitirColaParadaActualizada(paradaId);

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

      } catch (error) {
        console.error("Error taxista:confirmar_parada:", error.message);
        socket.emit("error:general", { message: error.message });
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

        limpiarTimerAutoEntrada(taxistaId);

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

    socket.on("taxista:llegar_parada", async ({ paradaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan taxistaId o paradaId",
          });
          return;
        }

        limpiarSugerenciaParada(taxistaId);

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

        socket.emit("taxista:estado_actualizado", {
          ok: true,
          taxista,
        });

        await emitirColaParadaActualizada(paradaId);

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

      } catch (error) {
        console.error("Error taxista:llegar_parada:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:salir_parada", async () => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId) {
          socket.emit("error:general", {
            message: "No autorizado",
          });
          return;
        }

        const actual = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: { parada: true },
        });

        const paradaAnteriorId = actual?.paradaId || null;

        limpiarSugerenciaParada(taxistaId);

        const taxista = await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            paradaId: null,
            enParadaDesde: null,
            estado: "disponible",
          },
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        socket.emit("taxista:salio_parada", {
          ok: true,
          taxista,
        });

        if (paradaAnteriorId) {
          await emitirColaParadaActualizada(paradaAnteriorId);
        }

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

      } catch (error) {
        console.error("Error taxista:salir_parada:", error.message);
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

        if (oferta.taxistaId !== taxistaId) {
          socket.emit("error:general", {
            message: "Oferta no autorizada para este taxista",
          });
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

        const paradaAnteriorId = oferta.taxista?.paradaId || null;

        await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            estado: "ocupado",
            paradaId: null,
            enParadaDesde: null,
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
            direccionBase: solicitudActualizada.direccionBase || null,
            referenciaRecogida:
              solicitudActualizada.referenciaRecogida || null,
            estado: solicitudActualizada.estado,
          },
        });

        if (paradaAnteriorId) {
          await emitirColaParadaActualizada(paradaAnteriorId);
        }
      } catch (error) {
        console.error("Error oferta:aceptar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("oferta:rechazar", async ({ ofertaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!ofertaId || !taxistaId) {
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

        if (oferta.taxistaId !== taxistaId) {
          socket.emit("error:general", {
            message: "Oferta no autorizada para este taxista",
          });
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

    socket.on("chat:enviar", async ({ solicitudId, texto }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !solicitudId || !texto?.trim()) {
          socket.emit("error:general", {
            message: "Faltan datos del mensaje",
          });
          return;
        }

        const solicitud = await prisma.solicitudViaje.findUnique({
          where: { id: solicitudId },
          include: {
            asignacion: true,
          },
        });

        if (!solicitud?.asignacion || solicitud.asignacion.taxistaId !== taxistaId) {
          socket.emit("error:general", {
            message: "No autorizado para este chat",
          });
          return;
        }

        const mensaje = await prisma.mensajeSolicitud.create({
          data: {
            solicitudViajeId: solicitudId,
            emisorTipo: "taxista",
            emisorTaxistaId: taxistaId,
            texto: texto.trim(),
          },
        });

        socket.emit("chat:mensaje_enviado_ok", {
          ok: true,
          solicitudId,
          mensaje,
        });
      } catch (error) {
        console.error("Error chat:enviar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("servicio:terminar", async ({ solicitudId, costoFinal }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!solicitudId || !taxistaId) {
          socket.emit("error:general", {
            message: "Faltan datos para terminar el servicio",
          });
          return;
        }

        const costo = Number(costoFinal);

        if (!Number.isFinite(costo) || costo < 0) {
          socket.emit("error:general", {
            message: "Coste final inválido",
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
            completadaEn: new Date(),
            costoFinal: costo,
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
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        limpiarSugerenciaParada(taxistaId);
        limpiarTimerAutoEntrada(taxistaId);

        socket.emit("servicio:terminado_ok", {
          ok: true,
          solicitudId,
          taxista: taxistaActualizado,
        });

        const oferta = await intentarOfertarSolicitudPendienteATaxista(taxistaId);
      } catch (error) {
        console.error("Error servicio:terminar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:cuantos_disponibles", async (_, callback) => {
      try {
        const count = await prisma.taxista.count({
          where: {
            estado: "disponible",
          },
        });
        callback({ disponibles: count });
      } catch (error) {
        console.error("Error taxistas:cuantos_disponibles:", error.message);
        callback({ disponibles: null });
      }
    });

    socket.on("taxista:posicion_en_cola", async (_, callback) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId) {
          callback({ posicion: null });
          return;
        }

        const taxista = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: { parada: true },
        });

        if (!taxista?.paradaId) {
          callback({ posicion: null });
          return;
        }

        const cola = await prisma.taxista.findMany({
          where: {
            paradaId: taxista.paradaId,
            estado: "disponible",
            enParadaDesde: { not: null },
          },
          orderBy: {
            enParadaDesde: "asc",
          },
        });

        const posicion = cola.findIndex((t) => t.id === taxistaId) + 1;

        callback({ posicion });
      } catch (error) {
        console.error("Error taxista:posicion_en_cola:", error.message);
        callback({ posicion: null });
      }
    });

    socket.on("disconnect", async (reason) => {
      const taxistaId = socket.taxistaAuth?.taxistaId;

      try {
        if (!taxistaId) return;

        limpiarSugerenciaParada(taxistaId);

        console.log("🔴 Socket taxista desconectado", {
          taxistaId,
          reason,
        });

        // Esperar un poco por si Socket.IO reconecta inmediatamente.
        setTimeout(async () => {
          try {
            // Comprobar si el taxista ya tiene otra conexión activa.
            const socketsActivos = await io
              .in(`taxista:${taxistaId}`)
              .fetchSockets();

            if (socketsActivos.length > 0) {
              console.log("🟢 El taxista ya se ha reconectado", {
                taxistaId,
                socketsActivos: socketsActivos.length,
              });
              return;
            }

            const actual = await prisma.taxista.findUnique({
              where: { id: taxistaId },
              include: {
                vehiculo: true,
                parada: true,
              },
            });

            if (!actual) return;

            // Si está prestando un servicio, no cambiarlo automáticamente.
            if (actual.estado === "ocupado") {
              console.log(
                "⚠️ Taxista ocupado desconectado; se mantiene ocupado:",
                taxistaId
              );
              return;
            }

            const paradaAnteriorId = actual.paradaId || null;

            const actualizado = await prisma.taxista.update({
              where: { id: taxistaId },
              data: {
                estado: "desconectado",
                paradaId: null,
                enParadaDesde: null,
              },
              include: {
                vehiculo: true,
                parada: true,
              },
            });

            console.log("⚪ Taxista pasado a desconectado", {
              taxistaId,
              paradaAnteriorId,
            });

            io.to(`taxista:${taxistaId}`).emit(
              "taxista:estado_actualizado",
              {
                ok: true,
                taxista: actualizado,
              }
            );

            // Recalcular la cola para los taxis que siguen en la parada.
            if (paradaAnteriorId) {
              await emitirColaParadaActualizada(paradaAnteriorId);
            }
          } catch (error) {
            console.error(
              "Error actualizando taxista tras disconnect:",
              error.message
            );
          }
        }, 5000);
      } catch (error) {
        console.error("Error en disconnect:", error.message);
      }
    });

    socket.on("chat:enviar", async ({ solicitudId, texto }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!taxistaId || !solicitudId || !texto?.trim()) {
          socket.emit("error:general", { message: "Faltan datos del mensaje" });
          return;
        }

        const solicitud = await prisma.solicitudViaje.findUnique({
          where: { id: solicitudId },
          include: { asignacion: true },
        });

        if (!solicitud?.asignacion || solicitud.asignacion.taxistaId !== taxistaId) {
          socket.emit("error:general", { message: "No autorizado para este chat" });
          return;
        }

        const mensaje = await prisma.mensajeSolicitud.create({
          data: {
            solicitudViajeId: solicitudId,
            emisorTipo: "taxista",
            emisorId: taxistaId,
            texto: texto.trim(),
          },
        });

        socket.emit("chat:mensaje_enviado_ok", {
          ok: true,
          solicitudId,
          mensaje,
        });
      } catch (error) {
        console.error("Error chat:enviar:", error.message);
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