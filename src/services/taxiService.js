const prisma = require("./bd");
const { buscarSiguienteTaxistaDisponible, emitirOfertaATaxista } = require("./ofertasService");

async function crearSolicitudTaxi(estadoLlamada) {
  console.log("🚕 Entrando en crearSolicitudTaxi()");
  console.log("Estado recibido:", JSON.stringify(estadoLlamada, null, 2));

  const solicitud = await prisma.solicitudViaje.create({
    data: {
      nombreCliente: estadoLlamada.nombre,
      telefonoCliente: estadoLlamada.telefono,
      direccionRecogida: estadoLlamada.recogida,
      estado: "pendiente",
      origen: "llamada_ia",
      confirmadaEn: new Date(),
    },
  });

  const taxista = await buscarSiguienteTaxistaDisponible(solicitud.id);

  if (!taxista) {
    await prisma.solicitudViaje.update({
      where: { id: solicitud.id },
      data: { estado: "pendiente" },
    });

    return {
      ok: true,
      mensaje: "Solicitud registrada y pendiente",
      referencia: solicitud.id,
      estado: "pendiente",
      taxiAsignado: null,
      ofertaId: null,
      taxistaId: null,
    };
  }

  await prisma.solicitudViaje.update({
    where: { id: solicitud.id },
    data: { estado: "ofertada" },
  });

  const oferta = await emitirOfertaATaxista({
    solicitud,
    taxista,
  });

  return {
    ok: true,
    mensaje: "Solicitud registrada y ofertada",
    referencia: solicitud.id,
    estado: "ofertada",
    taxiAsignado: null,
    ofertaId: oferta.id,
    taxistaId: taxista.id,
  };
}

module.exports = {
  crearSolicitudTaxi,
};