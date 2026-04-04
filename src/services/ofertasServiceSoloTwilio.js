const prisma = require("./bd");
const { obtenerLlamadaPorSolicitud } = require("../llamadasActivas");
const { distanciaMetros } = require("./geoUtils");

const OFERTA_TIMEOUT_MS = 10000;
const GPS_RECIENTE_MS = 120000;

function fechaGpsMinima() {
  return new Date(Date.now() - GPS_RECIENTE_MS);
}

async function consultarReceiptExpo(ticketId) {
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      ids: [ticketId],
    }),
  });

  const result = await response.json();
  console.log("Receipt Expo:", JSON.stringify(result, null, 2));
  return result;
}

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
      ubicacionActualizadaEn: {
        gte: fechaGpsMinima(),
      },
      paradaId: null,
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

  if (solicitud.paradaSugeridaId) {
    const taxiParada = await buscarTaxiEnParada(
      solicitud.paradaSugeridaId,
      taxistasExcluidos
    );

    if (taxiParada) {
      return taxiParada;
    }
  }

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
        in: ["pendiente", "aceptada", "rechazada", "expirada"],
      },
    },
  });

  if (ofertaExistente) {
    return null;
  }

  const taxistaElegido = await buscarSiguienteTaxistaDisponible(solicitud.id);

  if (!taxistaElegido) {
    return null;
  }

  if (taxistaElegido.id !== taxista.id) {
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

async function enviarPushOferta(expoPushToken, solicitud, oferta, taxistaId) {
  if (!expoPushToken) {
    console.log("No hay expoPushToken guardado");
    return;
  }

  const mensaje = {
    to: expoPushToken,
    sound: "default",
    title: "Nueva oferta",
    body:
      solicitud.direccionBase ||
      solicitud.direccionRecogida ||
      "Tienes una nueva oferta",
    data: {
      type: "oferta",
      ofertaId: oferta.id,
      solicitudId: solicitud.id,
    },
    priority: "high",
    channelId: "default",
  };

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(mensaje),
  });

  const result = await response.json();
  console.log("Resultado Expo push:", JSON.stringify(result, null, 2));

  const ticketId = result?.data?.id;
  if (!ticketId) {
    return result;
  }

  setTimeout(async () => {
    try {
      const receiptResult = await consultarReceiptExpo(ticketId);
      const receipt = receiptResult?.data?.[ticketId];

      if (receipt?.details?.error === "DeviceNotRegistered") {
        console.log("Token inválido. Limpiando expoPushToken del taxista:", taxistaId);

        await prisma.taxista.update({
          where: { id: taxistaId },
          data: {
            expoPushToken: null,
          },
        });
      }
    } catch (error) {
      console.error("Error consultando receipt Expo:", error);
    }
  }, 15000);

  return result;
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
      direccionBase: solicitud.direccionBase || null,
      referenciaRecogida: solicitud.referenciaRecogida || null,
    },
  });

  console.log("TOKEN BD:", taxista.expoPushToken);

  try {
    await enviarPushOferta(
      taxista.expoPushToken,
      solicitud,
      oferta,
      taxista.id
    );
  } catch (e) {
    console.error("Error enviando push oferta:", e);
  }

  programarTimeoutOferta(oferta.id);

  return oferta;
}

async function programarSiguienteOferta(solicitudViajeId) {
  console.log("🔁 programarSiguienteOferta", { solicitudViajeId });

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
    console.log("⛔ No se relanza oferta: solicitud cerrada", {
      solicitudViajeId,
      estado: solicitud.estado,
    });
    return;
  }

  const taxistasProbados = solicitud.ofertas.map((o) => o.taxistaId);
  console.log("🧪 taxistas probados:", taxistasProbados);

  const siguienteTaxista = await buscarSiguienteTaxistaDisponible(
    solicitudViajeId,
    taxistasProbados
  );

  console.log("🚕 siguiente taxista:", siguienteTaxista?.id || null);

  if (!siguienteTaxista) {
    await prisma.solicitudViaje.update({
      where: { id: solicitudViajeId },
      data: { estado: "sin_taxista" },
    });

    const llamadaActiva = obtenerLlamadaPorSolicitud(solicitudViajeId);

    if (llamadaActiva) {
      llamadaActiva.estado = "sin_taxista";
      llamadaActiva.sinTaxi = true;
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
      if (oferta.solicitudViaje?.estado === "cancelada") return;

      await prisma.ofertaSolicitud.update({
        where: { id: ofertaId },
        data: {
          estado: "expirada",
          respondidaEn: new Date(),
        },
      });

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