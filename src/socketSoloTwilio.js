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
const TIEMPO_CONFIRMACION_PARADA_MS = 20000;
const COOLDOWN_RECHAZO_PARADA_MS = 60000;
const GPS_CADUCADO_MS = 60000;

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

async function emitirColaParadaActualizada(paradaId) {
  if (!io || !paradaId) return;

  const cola = await obtenerColaParada(paradaId);

  console.log("🚖 Cola actualizada parada", paradaId, cola);

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
      paradaId: null,
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

    io.to(`taxista:${taxista.id}`).emit("taxista:estado_actualizado", {
      ok: true,
      taxista: actualizado,
    });

    io.to(`taxista:${taxista.id}`).emit("taxista:gps_requerido", {
      ok: false,
      message: "GPS inactivo. Has sido pasado a desconectado.",
    });

    io.to(`taxista:${taxistaId}`).emit("oferta:cancelada", {
      ofertaId,
      solicitudViajeId,
      motivo: "cliente_colgo",
    });

    console.log(
      `📴 Taxista ${taxista.id} pasado a desconectado por GPS caducado`
    );
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
      console.log("token recibido en socket:", !!token);

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
    console.log("🟢 Taxista conectado por socket:", socket.id);

    try {
      const taxistaId = socket.taxistaAuth?.taxistaId;

      if (!taxistaId) {
        socket.disconnect();
        return;
      }

      socket.join(`taxista:${taxistaId}`);
      console.log(`✅ Taxista ${taxistaId} unido a sala taxista:${taxistaId}`);

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

        console.log("taxistaId del token:", taxistaId);

        if (estado === "disponible") {
          const actual = await prisma.taxista.findUnique({
            where: { id: taxistaId },
            include: {
              vehiculo: true,
              parada: true,
            },
          });

          const gpsReciente =
            actual?.ubicacionActualizadaEn &&
            Date.now() - new Date(actual.ubicacionActualizadaEn).getTime() <=
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

        const dataUpdate = { estado };

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

        console.log(`🔄 Estado taxista ${taxistaId} -> ${estado}`);

        if (estado === "disponible") {
          const oferta = await intentarOfertarSolicitudPendienteATaxista(
            taxistaId
          );

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

        if (taxista.estado === "desconectado") {
          return;
        }

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

            console.log(
              `🚕 Taxista ${taxistaId} salió automáticamente de parada`
            );
            await emitirColaParadaActualizada(taxista.paradaId);

            const oferta = await intentarOfertarSolicitudPendienteATaxista(
              taxistaId
            );

            if (oferta) {
              console.log(
                `📨 Oferta pendiente lanzada al taxista ${taxistaId} tras salir de parada`
              );
            }
          }

          return;
        }

        const pendiente = sugerenciasParada.get(taxistaId);
        const ahora = Date.now();

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
            limpiarSugerenciaParada(taxistaId);
          }
          return;
        }

        // Si ya hay una sugerencia activa para ESTA MISMA parada, no la regeneres
        if (
          pendiente &&
          pendiente.paradaId === paradaCercana.id &&
          (!pendiente.ignoradasHasta || ahora >= pendiente.ignoradasHasta)
        ) {
          return;
        }

        // Si había una sugerencia para otra parada, limpiarla antes de crear la nueva
        if (pendiente && pendiente.paradaId !== paradaCercana.id) {
          limpiarSugerenciaParada(taxistaId);
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

              console.log(
                `✅ Taxista ${taxistaId} entró automáticamente en parada ${paradaDetectadaId}`
              );

              await emitirColaParadaActualizada(paradaDetectadaId);

              const oferta = await intentarOfertarSolicitudPendienteATaxista(
                taxistaId
              );

              if (oferta) {
                console.log(
                  `📨 Oferta pendiente lanzada al taxista ${taxistaId} al entrar automáticamente en parada`
                );
              }
            } catch (error) {
              console.error("Error autoentrada parada:", error.message);
            } finally {
              limpiarTimerAutoEntrada(taxistaId);
            }
          }, TIEMPO_CONFIRMACION_PARADA_MS);

          autoEntradaParadaTimers.set(taxistaId, timer);
        }

        console.log(
          `🚖 Sugerida parada ${paradaCercana.nombre} a taxista ${taxistaId}`
        );
      } catch (error) {
        console.error("Error taxista:ubicacion:", error.message);
      }
    });

    socket.on("taxista:confirmar_parada", async ({ paradaId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        console.log("➡️ taxista:confirmar_parada", { taxistaId, paradaId });

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan datos para confirmar parada",
          });
          return;
        }

        const sugerencia = sugerenciasParada.get(taxistaId);
        console.log("🧠 sugerencia actual:", sugerencia);

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

        console.log("✅ Taxista actualizado al entrar en parada:", {
          id: taxista.id,
          paradaId: taxista.paradaId,
          enParadaDesde: taxista.enParadaDesde,
          parada: taxista.parada?.nombre,
        });

        socket.emit("taxista:parada_confirmada", {
          ok: true,
          taxista,
        });

        console.log(`✅ Taxista ${taxistaId} confirmado en parada ${paradaId}`);

        await emitirColaParadaActualizada(paradaId);

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

        if (oferta) {
          console.log(
            `📨 Se ha lanzado una oferta pendiente al taxista ${taxistaId} al entrar en parada`
          );
        }
      } catch (error) {
        console.error("Error taxista:confirmar_parada:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("taxista:rechazar_parada", async ({ paradaId, motivo }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        console.log("➡️ taxista:rechazar_parada", {
          taxistaId,
          paradaId,
          motivo,
        });

        if (!taxistaId || !paradaId) {
          socket.emit("error:general", {
            message: "Faltan datos para rechazar parada",
          });
          return;
        }

        const sugerencia = sugerenciasParada.get(taxistaId);
        console.log("🧠 sugerencia antes de rechazar:", sugerencia);

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

        console.log(
          `❌ Taxista ${taxistaId} rechazó sugerencia de parada ${paradaId}. Motivo: ${motivo || "rechazada"
          }`
        );
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

        console.log(`🚖 Taxista ${taxistaId} llegó a parada ${paradaId}`);

        await emitirColaParadaActualizada(paradaId);

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

        if (oferta) {
          console.log(
            `📨 Se ha lanzado una oferta pendiente al taxista ${taxistaId} al llegar a parada`
          );
        }
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

        console.log(`🚕 Taxista ${taxistaId} salió manualmente de parada`);

        if (paradaAnteriorId) {
          await emitirColaParadaActualizada(paradaAnteriorId);
        }

        const oferta = await intentarOfertarSolicitudPendienteATaxista(
          taxistaId
        );

        if (oferta) {
          console.log(
            `📨 Oferta pendiente lanzada al taxista ${taxistaId} tras salir manualmente de parada`
          );
        }
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

        console.log(`✅ Oferta ${ofertaId} aceptada por taxista ${taxistaId}`);

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

        console.log(`❌ Oferta ${ofertaId} rechazada`);

        await programarSiguienteOferta(oferta.solicitudViajeId);
      } catch (error) {
        console.error("Error oferta:rechazar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("servicio:terminar", async ({ solicitudId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        console.log("➡️ servicio:terminar recibido", { solicitudId, taxistaId });

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

        console.log("📦 solicitud encontrada:", solicitud);

        if (!solicitud) {
          socket.emit("error:general", {
            message: "Solicitud no encontrada",
          });
          return;
        }

        if (!solicitud.asignacion || solicitud.asignacion.taxistaId !== taxistaId) {
          console.log("❌ No autorizado para terminar", {
            asignacion: solicitud.asignacion,
            taxistaToken: taxistaId,
          });

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
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        socket.emit("servicio:terminado_ok", {
          ok: true,
          solicitudId,
          taxista: taxistaActualizado,
        });

        console.log(`✅ Servicio ${solicitudId} terminado por taxista ${taxistaId}`);

        const oferta = await intentarOfertarSolicitudPendienteATaxista(taxistaId);

        if (oferta) {
          console.log(
            `📨 Se ha lanzado una oferta pendiente al taxista ${taxistaId} tras terminar servicio`
          );
        }
      } catch (error) {
        console.error("Error servicio:terminar:", error.message);
        socket.emit("error:general", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      const taxistaId = socket.taxistaAuth?.taxistaId;
      if (taxistaId) {
        limpiarTimerAutoEntrada(taxistaId);
      }
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