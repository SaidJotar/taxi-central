const prisma = require("./bd");

async function cancelarSolicitudPorCuelgue(solicitudId) {
  if (!solicitudId) return [];

  const solicitud = await prisma.solicitudViaje.findUnique({
    where: { id: solicitudId },
    include: {
      ofertas: {
        where: {
          estado: "pendiente",
        },
      },
    },
  });

  if (!solicitud) return [];

  if (
    solicitud.estado === "cancelada" ||
    solicitud.estado === "asignada" ||
    solicitud.estado === "completada"
  ) {
    return [];
  }

  await prisma.solicitudViaje.update({
    where: { id: solicitudId },
    data: {
      estado: "cancelada",
    },
  });

  if (solicitud.ofertas.length) {
    await prisma.ofertaSolicitud.updateMany({
      where: {
        solicitudViajeId: solicitudId,
        estado: "pendiente",
      },
      data: {
        estado: "expirada",
        respondidaEn: new Date(),
      },
    });
  }

  return solicitud.ofertas.map((o) => ({
    ofertaId: o.id,
    taxistaId: o.taxistaId,
  }));
}

module.exports = {
  cancelarSolicitudPorCuelgue,
};