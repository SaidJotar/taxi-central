const prisma = require("./bd");
const { obtenerLlamadaPorSolicitud } = require("../llamadasActivas");
const { distanciaMetros } = require("./geoUtils");

const OFERTA_TIMEOUT_MS = 10000;

async function buscarTaxiEnParada(paradaId, taxistasExcluidos = []) {
  if (!paradaId) return null;

  const taxistas = await prisma.taxista.findMany({
    where: {
      estado: "disponible",
      paradaId,
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
      enParadaDesde: "asc",
    },
  });

  if (!taxistas.length) return null;

  return taxistas[0];
}

async function buscarTaxiMasCercano(lat, lng, taxistasExcluidos = []) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  const taxistas = await prisma.taxista.findMany({
    where: {
      estado: "disponible",
      lat: { not: null },
      lng: { not: null },
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
  });

  if (!taxistas.length) return null;

  let mejor = null;

  for (const taxista of taxistas) {
    const distancia = distanciaMetros(lat, lng, taxista.lat, taxista.lng);

    if (!mejor || distancia < mejor.distancia) {
      mejor = {
        taxista,
        distancia,
      };
    }
  }

  return mejor?.taxista || null;
}

async function buscarSiguienteTaxistaDisponible(solicitudViajeId, taxistasExcluidos = []) {
  const solicitud = await prisma.solicitudViaje.findUnique({
    where: { id: solicitudViajeId },
  });

  if (!solicitud) return null;

  // 1. Primero taxis de la parada sugerida
  if (solicitud.paradaSugeridaId) {
    const taxiParada = await buscarTaxiEnParada(
      solicitud.paradaSugeridaId,
      taxistasExcluidos
    );

    if (taxiParada) {
      console.log("🚖 Taxi encontrado en parada:", taxiParada.id);
      return taxiParada;
    }
  }

  // 2. Si no hay taxis en parada, buscar el más cercano
  if (
    typeof solicitud.latRecogida === "number" &&
    typeof solicitud.lngRecogida === "number"
  ) {
    const taxiCercano = await buscarTaxiMasCercano(
      solicitud.latRecogida,
      solicitud.lngRecogida,
      taxistasExcluidos
    );

    if (taxiCercano) {
      console.log("🚕 Taxi cercano encontrado:", taxiCercano.id);
      return taxiCercano;
    }
  }

  return null;
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

async function emitirOfertaATaxista({ solicitud, taxista }) {
  const oferta = await prisma.ofertaSolicitud.create({
    data: {
      solicitudViajeId: solicitud.id,
      taxistaId: taxista.id,
      estado: "pendiente",
    },
  });

  const { obtenerIo } = require("../socketSoloTwilio");
  const io = obtenerIo();

  const expiresAt = new Date(Date.now() + OFERTA_TIMEOUT_MS).toISOString();

  io.to(`taxista:${taxista.id}`).emit("oferta:recibida", {
    ofertaId: oferta.id,
    expiresAt,
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

  if (
    solicitud.estado === "asignada" ||
    solicitud.estado === "cancelada" ||
    solicitud.estado === "completada"
  ) {
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

    console.log(
      `❌ No quedan taxistas disponibles para solicitud ${solicitudViajeId}`
    );

    // En Twilio-only no cerramos la llamada aquí.
    // Solo marcamos el estado para que /incoming-call/espera hable al cliente.
    const llamadaActiva = obtenerLlamadaPorSolicitud(solicitudViajeId);

    if (llamadaActiva) {
      llamadaActiva.estado = "sin_taxista";
      llamadaActiva.sinTaxi = true;
      console.log(
        `☎️ Llamada marcada como sin taxi para solicitud ${solicitudViajeId}`
      );
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

      const { obtenerIo } = require("../socketSoloTwilio");
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