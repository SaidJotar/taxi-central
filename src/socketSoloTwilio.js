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

async function procesarUbicacionTaxista({
  taxistaId,
  lat,
  lng,
  socket = null,
  esBackground = false,
}) {
  if (!taxistaId) {
    throw new Error("Taxista no identificado");
  }

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    throw new Error("Ubicación inválida");
  }

  /*
   * ==================================================
   * GUARDAR GPS
   * ==================================================
   */

  let taxista =
    await prisma.taxista.update({
      where: {
        id: taxistaId,
      },

      data: {
        lat,
        lng,
        ubicacionActualizadaEn:
          new Date(),
      },

      include: {
        parada: true,
        vehiculo: true,
      },
    });

  /*
   * Si ha pulsado Desconectarse,
   * actualizamos coordenadas pero no
   * gestionamos paradas.
   */
  if (
    taxista.estado ===
    "desconectado"
  ) {
    return {
      taxista,
      accion: "gps_actualizado",
    };
  }

  /*
   * ==================================================
   * TAXISTA YA ESTÁ EN UNA PARADA
   * ==================================================
   */

  if (
    taxista.paradaId &&
    taxista.parada
  ) {
    const distanciaSalida =
      distanciaMetros(
        lat,
        lng,
        taxista.parada.lat,
        taxista.parada.lng
      );

    const tiempoEnParadaMs =
      taxista.enParadaDesde
        ? Date.now() -
        new Date(
          taxista.enParadaDesde
        ).getTime()
        : 0;

    if (
      tiempoEnParadaMs > 15000 &&
      distanciaSalida >
      RADIO_SALIDA_PARADA_METROS
    ) {
      const paradaAnteriorId =
        taxista.paradaId;

      taxista =
        await prisma.taxista.update({
          where: {
            id: taxistaId,
          },

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

      /*
       * Aunque este GPS venga por HTTP,
       * puede haber otro socket conectado.
       */
      if (io) {
        io.to(
          `taxista:${taxistaId}`
        ).emit(
          "taxista:salio_parada",
          {
            ok: true,
            taxista,
          }
        );
      }

      await emitirColaParadaActualizada(
        paradaAnteriorId
      );

      await intentarOfertarSolicitudPendienteATaxista(
        taxistaId
      );

      console.log(
        "🚕 Taxista salió de parada",
        {
          taxistaId,
          paradaAnteriorId,
          distancia:
            Math.round(
              distanciaSalida
            ),
          esBackground,
        }
      );

      return {
        taxista,
        accion: "salio_parada",
      };
    }

    return {
      taxista,
      accion: "continua_parada",
    };
  }

  /*
   * Ocupado:
   * seguimos guardando GPS porque el cliente
   * puede necesitar seguir su posición,
   * pero no debe entrar en paradas.
   */
  if (
    taxista.estado !==
    "disponible"
  ) {
    return {
      taxista,
      accion: "gps_actualizado",
    };
  }

  /*
   * ==================================================
   * TAXISTA DISPONIBLE Y FUERA DE PARADA
   * ==================================================
   */

  const paradaCercana =
    await buscarParadaCercanaParaEntrada(
      lat,
      lng,
      RADIO_ENTRADA_PARADA_METROS
    );

  const ahora =
    Date.now();

  const pendiente =
    sugerenciasParada.get(
      taxistaId
    );

  /*
   * Ya no está dentro de ninguna parada.
   */
  if (!paradaCercana) {
    if (pendiente) {
      /*
       * Conservamos un posible cooldown
       * de rechazo.
       */
      if (
        !pendiente.ignoradasHasta ||
        ahora >=
        pendiente.ignoradasHasta
      ) {
        sugerenciasParada.delete(
          taxistaId
        );

        limpiarTimerAutoEntrada(
          taxistaId
        );
      }

      if (socket) {
        socket.emit(
          "taxista:parada_sugerida_cancelada",
          {
            ok: true,
            motivo:
              "salio_del_radio",
          }
        );
      }
    }

    return {
      taxista,
      accion: "sin_parada",
    };
  }

  /*
   * Si rechazó esta parada recientemente,
   * respetamos el cooldown también
   * en background.
   */
  if (
    pendiente?.ignoradasHasta &&
    ahora <
    pendiente.ignoradasHasta
  ) {
    return {
      taxista,
      accion:
        "parada_en_cooldown",
    };
  }

  /*
   * ==================================================
   * PRIMER PLANO
   * ==================================================
   */

  if (!esBackground && socket) {
    if (
      pendiente &&
      pendiente.paradaId ===
      paradaCercana.id &&
      pendiente.expiraEn
    ) {
      return {
        taxista,
        accion:
          "sugerencia_existente",
      };
    }

    if (
      pendiente &&
      pendiente.paradaId !==
      paradaCercana.id
    ) {
      limpiarSugerenciaParada(
        taxistaId
      );
    }

    const expiraEn =
      ahora +
      TIEMPO_CONFIRMACION_PARADA_MS;

    sugerenciasParada.set(
      taxistaId,
      {
        paradaId:
          paradaCercana.id,
        expiraEn,
        ignoradasHasta: null,
        backgroundDesde: null,
      }
    );

    socket.emit(
      "taxista:parada_sugerida",
      {
        ok: true,

        parada: {
          id:
            paradaCercana.id,

          nombre:
            paradaCercana.nombre,

          direccion:
            paradaCercana.direccion,

          distanciaMetros:
            Math.round(
              paradaCercana
                .distanciaMetros
            ),
        },

        expiresAt:
          new Date(
            expiraEn
          ).toISOString(),
      }
    );

    if (
      !autoEntradaParadaTimers.has(
        taxistaId
      )
    ) {
      const paradaDetectadaId =
        paradaCercana.id;

      const timer =
        setTimeout(
          async () => {
            try {
              const sugerencia =
                sugerenciasParada.get(
                  taxistaId
                );

              if (
                !sugerencia ||
                sugerencia.paradaId !==
                paradaDetectadaId
              ) {
                return;
              }

              const actual =
                await prisma.taxista.findUnique({
                  where: {
                    id: taxistaId,
                  },

                  include: {
                    parada: true,
                    vehiculo: true,
                  },
                });

              if (!actual) {
                return;
              }

              if (
                actual.estado !==
                "disponible"
              ) {
                return;
              }

              if (
                actual.paradaId
              ) {
                return;
              }

              if (
                typeof actual.lat !==
                "number" ||
                typeof actual.lng !==
                "number"
              ) {
                return;
              }

              const gpsReciente =
                actual
                  .ubicacionActualizadaEn &&
                Date.now() -
                new Date(
                  actual
                    .ubicacionActualizadaEn
                ).getTime() <=
                GPS_CADUCADO_MS;

              if (!gpsReciente) {
                return;
              }

              /*
               * Comprobación REAL antes
               * de meterlo en cola.
               */
              const sigueEnParada =
                await buscarParadaCercanaParaEntrada(
                  actual.lat,
                  actual.lng,
                  RADIO_ENTRADA_PARADA_METROS
                );

              if (
                !sigueEnParada ||
                sigueEnParada.id !==
                paradaDetectadaId
              ) {
                return;
              }

              const actualizado =
                await prisma.taxista.update({
                  where: {
                    id: taxistaId,
                  },

                  data: {
                    paradaId:
                      paradaDetectadaId,

                    enParadaDesde:
                      new Date(),

                    estado:
                      "disponible",
                  },

                  include: {
                    vehiculo: true,
                    parada: true,
                  },
                });

              limpiarSugerenciaParada(
                taxistaId
              );

              if (io) {
                io.to(
                  `taxista:${taxistaId}`
                ).emit(
                  "taxista:parada_confirmada",
                  {
                    ok: true,
                    auto: true,
                    taxista:
                      actualizado,
                  }
                );
              }

              await emitirColaParadaActualizada(
                paradaDetectadaId
              );

              await intentarOfertarSolicitudPendienteATaxista(
                taxistaId
              );

            } catch (error) {
              console.error(
                "Error autoentrada parada:",
                error.message
              );
            } finally {
              limpiarTimerAutoEntrada(
                taxistaId
              );
            }
          },

          TIEMPO_CONFIRMACION_PARADA_MS
        );

      autoEntradaParadaTimers.set(
        taxistaId,
        timer
      );
    }

    return {
      taxista,
      accion:
        "parada_sugerida",
    };
  }

  /*
   * ==================================================
   * SEGUNDO PLANO
   * ==================================================
   *
   * Aquí no hay modal para que el taxista
   * confirme.
   *
   * Necesitamos dos posiciones separadas
   * al menos 10 segundos para evitar
   * entradas falsas.
   */

  if (
    !pendiente ||
    pendiente.paradaId !==
    paradaCercana.id ||
    !pendiente.backgroundDesde
  ) {
    sugerenciasParada.set(
      taxistaId,
      {
        paradaId:
          paradaCercana.id,

        expiraEn: null,

        ignoradasHasta:
          null,

        backgroundDesde:
          ahora,
      }
    );

    return {
      taxista,
      accion:
        "esperando_parada_background",
    };
  }

  if (
    ahora -
    pendiente.backgroundDesde <
    TIEMPO_CONFIRMACION_PARADA_MS
  ) {
    return {
      taxista,
      accion:
        "esperando_parada_background",
    };
  }

  /*
   * Sigue dentro después de >=10s.
   */

  taxista =
    await prisma.taxista.update({
      where: {
        id: taxistaId,
      },

      data: {
        paradaId:
          paradaCercana.id,

        enParadaDesde:
          new Date(),

        estado:
          "disponible",
      },

      include: {
        vehiculo: true,
        parada: true,
      },
    });

  sugerenciasParada.delete(
    taxistaId
  );

  if (io) {
    io.to(
      `taxista:${taxistaId}`
    ).emit(
      "taxista:parada_confirmada",
      {
        ok: true,
        auto: true,
        background: true,
        taxista,
      }
    );
  }

  await emitirColaParadaActualizada(
    paradaCercana.id
  );

  await intentarOfertarSolicitudPendienteATaxista(
    taxistaId
  );

  console.log(
    "✅ Entrada automática en parada desde background",
    {
      taxistaId,
      paradaId:
        paradaCercana.id,
    }
  );

  return {
    taxista,
    accion:
      "entrada_parada_background",
  };
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

    socket.on(
      "taxista:recuperar_servicio_activo",
      async (_, callback) => {
        try {
          const taxistaId =
            socket.taxistaAuth?.taxistaId;

          console.log(
            "🔄 Recuperando servicio activo:",
            taxistaId
          );

          if (!taxistaId) {
            return callback({
              servicioActivo: null,
            });
          }

          const asignacion =
            await prisma.asignacionSolicitud.findFirst({
              where: {
                taxistaId,

                solicitudViaje: {
                  estado: "asignada",
                },
              },

              include: {
                solicitudViaje: true,
                taxista: {
                  include: {
                    vehiculo: true,
                  },
                },
              },
            });

          console.log(
            "🔎 Asignación recuperada:",
            asignacion?.id || null
          );

          if (!asignacion) {
            return callback({
              servicioActivo: null,
            });
          }

          const solicitud =
            asignacion.solicitudViaje;

          const llamadaActiva =
            obtenerLlamadaPorSolicitud(
              solicitud.id
            );

          const servicioActivo = {
            solicitudId:
              solicitud.id,

            nombreCliente:
              solicitud.nombreCliente,

            telefonoCliente:
              solicitud.telefonoCliente,

            latRecogida:
              solicitud.latRecogida,

            lngRecogida:
              solicitud.lngRecogida,

            direccionRecogida:
              solicitud.direccionRecogida,

            direccionBase:
              solicitud.direccionBase,

            referenciaRecogida:
              solicitud.referenciaRecogida,

            callId:
              llamadaActiva?.callId || null,
          };

          console.log(
            "✅ Servicio activo recuperado:",
            servicioActivo.solicitudId
          );

          return callback({
            servicioActivo,
          });

        } catch (error) {
          console.error(
            "❌ Error recuperando servicio:",
            error
          );

          callback({
            servicioActivo: null,
          });
        }
      }
    );

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

    socket.on(
      "taxista:ubicacion",
      async ({ lat, lng }) => {
        try {
          const taxistaId =
            socket.taxistaAuth
              ?.taxistaId;

          if (!taxistaId) {
            socket.emit(
              "error:general",
              {
                message:
                  "No autorizado",
              }
            );

            return;
          }

          await procesarUbicacionTaxista({
            taxistaId,
            lat,
            lng,
            socket,
            esBackground: false,
          });

        } catch (error) {
          console.error(
            "Error taxista:ubicacion:",
            error.message
          );

          socket.emit(
            "error:general",
            {
              message:
                error.message,
            }
          );
        }
      }
    );

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
            direccionBase:
              solicitudActualizada.direccionBase || null,
            referenciaRecogida:
              solicitudActualizada.referenciaRecogida || null,
            estado: solicitudActualizada.estado,

            callId: llamadaActiva?.callId || null,
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

    socket.on("servicio:cliente_no_localizado", async ({ solicitudId }) => {
      try {
        const taxistaId = socket.taxistaAuth?.taxistaId;

        if (!solicitudId || !taxistaId) {
          socket.emit("error:general", {
            message: "Faltan datos del servicio",
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

        // Solo el taxista asignado puede cancelar por cliente no localizado
        if (
          !solicitud.asignacion ||
          solicitud.asignacion.taxistaId !== taxistaId
        ) {
          socket.emit("error:general", {
            message: "No autorizado para cancelar este servicio",
          });
          return;
        }

        // Solo una solicitud actualmente asignada puede cerrarse así
        if (solicitud.estado !== "asignada") {
          socket.emit("error:general", {
            message: "El servicio ya no está activo",
          });
          return;
        }

        await prisma.solicitudViaje.update({
          where: { id: solicitudId },
          data: {
            estado: "cancelada",
          },
        });

        await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            estado: "disponible",
            paradaId: null,
            enParadaDesde: null,
          },
        });

        limpiarSugerenciaParada(taxistaId);
        limpiarTimerAutoEntrada(taxistaId);

        const taxistaActualizado = await prisma.taxista.findUnique({
          where: { id: taxistaId },
          include: {
            vehiculo: true,
            parada: true,
          },
        });

        console.log("🚫 Cliente no localizado:", {
          solicitudId,
          taxistaId,
        });

        socket.emit("servicio:cliente_no_localizado_ok", {
          ok: true,
          solicitudId,
          taxista: taxistaActualizado,
        });

        // Ya está disponible, así que puede recibir otra solicitud
        await intentarOfertarSolicitudPendienteATaxista(taxistaId);

      } catch (error) {
        console.error(
          "Error servicio:cliente_no_localizado:",
          error.message
        );

        socket.emit("error:general", {
          message: error.message,
        });
      }
    });

    socket.on(
      "servicio:cliente_recogido",
      async ({ solicitudId }, callback) => {

        try {

          const taxistaId =
            socket.taxistaAuth?.taxistaId;


          if (
            !taxistaId ||
            !solicitudId
          ) {

            const respuesta = {
              ok: false,
              error:
                "Faltan datos del servicio",
            };


            if (
              typeof callback ===
              "function"
            ) {
              callback(
                respuesta
              );
            }


            return;
          }


          /*
           * Comprobamos que el servicio pertenece
           * realmente a este taxista.
           */
          const solicitud =
            await prisma.solicitudViaje.findFirst({

              where: {

                id:
                  solicitudId,

                estado:
                  "asignada",

                asignacion: {
                  is: {
                    taxistaId,
                  },
                },

              },

              include: {

                asignacion: {
                  include: {
                    taxista: {
                      include: {
                        vehiculo: true,
                      },
                    },
                  },
                },

              },

            });


          if (!solicitud) {

            const respuesta = {
              ok: false,
              error:
                "Servicio no encontrado o no pertenece al taxista",
            };


            if (
              typeof callback ===
              "function"
            ) {
              callback(
                respuesta
              );
            }


            return;
          }


          /*
           * Si ya estaba iniciado, no repetimos nada.
           */
          if (
            solicitud.recogidaIniciadaEn
          ) {

            const respuesta = {
              ok: true,

              yaIniciado:
                true,

              recogidaIniciadaEn:
                solicitud.recogidaIniciadaEn,
            };


            if (
              typeof callback ===
              "function"
            ) {
              callback(
                respuesta
              );
            }


            return;
          }


          const actualizada =
            await prisma.solicitudViaje.update({

              where: {
                id:
                  solicitudId,
              },

              data: {
                recogidaIniciadaEn:
                  new Date(),
              },

            });


          console.log(
            "🚕 Cliente recogido:",
            {
              solicitudId,
              taxistaId,

              recogidaIniciadaEn:
                actualizada.recogidaIniciadaEn,
            }
          );


          /*
           * Actualizamos al propio taxista.
           */
          socket.emit(
            "servicio:cliente_recogido_ok",
            {
              ok: true,

              solicitudId,

              recogidaIniciadaEn:
                actualizada.recogidaIniciadaEn,
            }
          );


          /*
           * Si luego quieres usar socket directo
           * en cliente, ya dejamos este evento preparado.
           */
          if (io) {

            io.to(
              `solicitud:${solicitudId}`
            ).emit(
              "servicio:recogida_iniciada",
              {
                ok: true,

                solicitudId,

                recogidaIniciadaEn:
                  actualizada.recogidaIniciadaEn,
              }
            );

          }


          if (
            typeof callback ===
            "function"
          ) {

            callback({
              ok: true,

              solicitudId,

              recogidaIniciadaEn:
                actualizada.recogidaIniciadaEn,
            });

          }


        } catch (error) {

          console.error(
            "Error servicio:cliente_recogido:",
            error
          );


          if (
            typeof callback ===
            "function"
          ) {

            callback({
              ok: false,
              error:
                error.message ||
                "No se pudo iniciar el trayecto",
            });

          }

        }

      }
    );

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

    socket.on(
      "disconnect",
      (reason) => {
        const taxistaId =
          socket.taxistaAuth
            ?.taxistaId;

        if (!taxistaId) {
          return;
        }

        console.log(
          "🔴 Socket taxista desconectado",
          {
            taxistaId,
            reason,
          }
        );

        /*
         * No cambiamos estado.
         * No borramos parada.
         * No borramos enParadaDesde.
         *
         * El GPS background decide
         * si el taxista sigue activo.
         */

        console.log(
          "🟡 Estado conservado hasta comprobar caducidad GPS:",
          taxistaId
        );
      }
    );
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
  procesarUbicacionTaxista,
};