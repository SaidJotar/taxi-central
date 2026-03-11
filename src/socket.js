const { Server } = require("socket.io");
const prisma = require("./services/bd");
const {
  obtenerLlamadaPorSolicitud,
  eliminarLlamadaPorSolicitud,
} = require("./llamadasActivas");
const { programarSiguienteOferta, intentarOfertarSolicitudPendienteATaxista } = require("./services/ofertasService");

let io = null;

function iniciarSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
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
                  console.log(`📨 Se ha lanzado una oferta pendiente al taxista ${taxistaId}`);
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
            taxistaId: taxistaId,
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

          if (llamadaActiva && llamadaActiva.openaiWs && llamadaActiva.openaiWs.readyState === 1) {
              const nombreTaxista =
                  solicitudActualizada?.asignacion?.taxista?.nombreCompleto || "el taxista asignado";
              const numeroTaxi =
                  solicitudActualizada?.asignacion?.vehiculo?.numeroTaxi || "su taxi";

              console.log(`📞 Enviando confirmación de taxi a la llamada activa de la solicitud ${oferta.solicitudViajeId}`);

              // Si OpenAI estuviera respondiendo algo por ruido o por una intervención del cliente,
              // cancelamos esa respuesta antes de mandar la importante.
              try {
                  if (llamadaActiva?.estadoLlamada?.bloquearConversacion) {
                      try {
                          llamadaActiva.openaiWs.send(JSON.stringify({
                              type: "response.cancel"
                          }));
                      } catch (error) {
                          console.error("Error cancelando respuesta activa:", error.message);
                      }
                  }
              } catch (error) {
                  console.error("Error cancelando respuesta activa:", error.message);
              }

              setTimeout(() => {
                  try {
                      if (llamadaActiva.openaiWs && llamadaActiva.openaiWs.readyState === 1) {

                          if (llamadaActiva.estadoLlamada) {
                              llamadaActiva.estadoLlamada.bloquearConversacion = false;
                              llamadaActiva.estadoLlamada.esperandoAsignacion = false;
                              llamadaActiva.estadoLlamada.cerrarTrasMensajeFinal = true;
                          }


                          llamadaActiva.openaiWs.send(JSON.stringify({
                              type: "response.create",
                              response: {
                                  output_modalities: ["audio"],
                                  instructions:
                                      `Informa al cliente de forma breve y clara: su taxi asignado es ${numeroTaxi}, conducido por ${nombreTaxista}. Después di exactamente: Gracias por llamar.`
                              }
                          }));
                      }
                  } catch (error) {
                      console.error("Error enviando confirmación final al cliente:", error.message);
                  }
              }, 300);

              // Cerrar la llamada unos segundos después de hablar
                setTimeout(() => {
                    try {
                        if (llamadaActiva.twilioWs && llamadaActiva.twilioWs.readyState === 1) {
                            console.log(`☎️ Cerrando llamada de la solicitud ${oferta.solicitudViajeId}`);
                            llamadaActiva.twilioWs.close();
                        }
                    } catch (error) {
                        console.error("Error cerrando llamada tras asignación:", error.message);
                    }

                    eliminarLlamadaPorSolicitud(oferta.solicitudViajeId);
                }, 7000);
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