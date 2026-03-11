const prisma = require("./bd");
const {
  obtenerLlamadaPorSolicitud,
  eliminarLlamadaPorSolicitud,
} = require("../llamadasActivas");

const OFERTA_TIMEOUT_MS = 10000;

async function buscarSiguienteTaxistaDisponible(solicitudViajeId, taxistasExcluidos = []) {
  return prisma.taxista.findFirst({
    where: {
      estado: "disponible",
      id: {
        notIn: taxistasExcluidos,
      },
      vehiculo: {
        isNot: null,
      },
    },
    include: {
      vehiculo: true,
    },
    orderBy: {
      creadoEn: "asc",
    },
  });
}

async function intentarOfertarSolicitudPendienteATaxista(taxistaId) {
  const taxista = await prisma.taxista.findUnique({
    where: { id: taxistaId },
    include: {
      vehiculo: true,
    },
  });

  if (!taxista || taxista.estado !== "disponible" || !taxista.vehiculo) {
    return null;
  }

  const solicitud = await buscarSolicitudPendiente();

  if (!solicitud) {
    return null;
  }

  const ofertaExistente = await prisma.ofertaSolicitud.findFirst({
    where: {
      solicitudViajeId: solicitud.id,
      taxistaId: taxista.id,
      estado: {
        in: ["pendiente", "aceptada"],
      },
    },
  });

  if (ofertaExistente) {
    return null;
  }

  await prisma.solicitudViaje.update({
    where: { id: solicitud.id },
    data: { estado: "ofertada" },
  });

  return emitirOfertaATaxista({
    solicitud,
    taxista,
  });
}

async function buscarSolicitudPendiente() {
  return prisma.solicitudViaje.findFirst({
    where: {
      estado: "pendiente",
    },
    orderBy: {
      creadaEn: "asc",
    },
  });
}

async function emitirOfertaATaxista({ solicitud, taxista }) {
  const oferta = await prisma.ofertaSolicitud.create({
    data: {
      solicitudViajeId: solicitud.id,
      taxistaId: taxista.id,
      estado: "pendiente",
      },
  });

    const { obtenerIo } = require("../socket");
    const io = obtenerIo();

    io.to(`taxista:${taxista.id}`).emit("oferta:recibida", {
        ofertaId: oferta.id,
        solicitud: {
            id: solicitud.id,
      nombreCliente: solicitud.nombreCliente,
      telefonoCliente: solicitud.telefonoCliente,
      direccionRecogida: solicitud.direccionRecogida,
    },
  });

  console.log(`📨 Oferta ${oferta.id} enviada a taxista:${taxista.id}`);

  programarTimeoutOferta(oferta.id);

  return oferta;
}

async function programarSiguienteOferta(solicitudViajeId) {
  const solicitud = await prisma.solicitudViaje.findUnique({
    where: { id: solicitudViajeId },
    include: {
      ofertas: true,
    },
  });

  if (!solicitud) return;

  if (solicitud.estado === "asignada" || solicitud.estado === "cancelada" || solicitud.estado === "completada") {
    return;
  }

  const taxistasProbados = solicitud.ofertas.map((o) => o.taxistaId);

  const siguienteTaxista = await buscarSiguienteTaxistaDisponible(
    solicitudViajeId,
    taxistasProbados
  );

  if (!siguienteTaxista) {
    await prisma.solicitudViaje.update({
      where: { id: solicitudViajeId },
      data: { estado: "sin_taxista" },
    });

    console.log(`❌ No quedan taxistas disponibles para solicitud ${solicitudViajeId}`);

    const llamadaActiva = obtenerLlamadaPorSolicitud(solicitudViajeId);

    if (llamadaActiva?.openaiWs?.readyState === 1) {
      try {
        llamadaActiva.openaiWs.send(JSON.stringify({
          type: "response.cancel",
        }));
      } catch (error) {
        console.error("Error cancelando respuesta activa:", error.message);
      }

      setTimeout(() => {
        try {
          if (llamadaActiva.openaiWs?.readyState === 1) {
            llamadaActiva.openaiWs.send(JSON.stringify({
              type: "response.create",
              response: {
                output_modalities: ["audio"],
                instructions:
                  "Informa al cliente de forma breve: lo sentimos, en este momento no hay taxis disponibles para su solicitud. Gracias por llamar."
              }
            }));
          }
        } catch (error) {
          console.error("Error enviando mensaje sin taxi:", error.message);
        }
      }, 700);

      setTimeout(() => {
        try {
          if (llamadaActiva.twilioWs?.readyState === 1) {
            llamadaActiva.twilioWs.close();
          }
        } catch (error) {
          console.error("Error cerrando llamada sin taxi:", error.message);
        }

        eliminarLlamadaPorSolicitud(solicitudViajeId);
      }, 7000);
    }

    return;
  }

  await prisma.solicitudViaje.update({
    where: { id: solicitudViajeId },
    data: { estado: "ofertada" },
  });

  await emitirOfertaATaxista({
    solicitud,
    taxista: siguienteTaxista,
  });
}

function programarTimeoutOferta(ofertaId) {
  setTimeout(async () => {
    try {
      const oferta = await prisma.ofertaSolicitud.findUnique({
        where: { id: ofertaId },
        include: {
          solicitudViaje: true,
          taxista: true,
        },
      });

      if (!oferta) return;
      if (oferta.estado !== "pendiente") return;

      await prisma.ofertaSolicitud.update({
        where: { id: ofertaId },
        data: {
          estado: "expirada",
          respondidaEn: new Date(),
        },
      });

      console.log(`⏰ Oferta ${ofertaId} expirada`);

      // ✅ require aquí dentro para evitar dependencia circular al cargar módulos
      const { obtenerIo } = require("../socket");
      const io = obtenerIo();

      io.to(`taxista:${oferta.taxistaId}`).emit("oferta:expirada", {
        ofertaId: oferta.id,
        solicitudViajeId: oferta.solicitudViajeId,
      });

      await programarSiguienteOferta(oferta.solicitudViajeId);
    } catch (error) {
      console.error("Error en timeout de oferta:", error.message);
    }
  }, OFERTA_TIMEOUT_MS);
}

module.exports = {
  emitirOfertaATaxista,
  programarSiguienteOferta,
  programarTimeoutOferta,
  buscarSiguienteTaxistaDisponible,
  buscarSolicitudPendiente,
  intentarOfertarSolicitudPendienteATaxista,
};