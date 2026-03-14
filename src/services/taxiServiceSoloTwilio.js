const prisma = require("./bd");
const { buscarSiguienteTaxistaDisponible, emitirOfertaATaxista } = require("./ofertasServiceSoloTwilio");
const { geocodificarDireccion } = require("./geocodingService");
const { buscarParadaMasCercana } = require("./paradasService");

async function crearSolicitudTaxi(estadoLlamada) {
  console.log("🚕 Entrando en crearSolicitudTaxi()");
  console.log("Estado recibido:", JSON.stringify(estadoLlamada, null, 2));

  let geo = null;
  let paradaSugerida = null;

  try {
    geo = await geocodificarDireccion(estadoLlamada.recogida);
    console.log("📍 Geocodificación recogida:", geo);

    if (geo?.lat != null && geo?.lng != null) {
      paradaSugerida = await buscarParadaMasCercana(geo.lat, geo.lng);
      console.log("🚖 Parada sugerida:", paradaSugerida);
    }
  } catch (error) {
    console.error("❌ Error preparando solicitud:", error.message);
  }

  const solicitud = await prisma.solicitudViaje.create({
    data: {
      nombreCliente: estadoLlamada.nombre,
      telefonoCliente: estadoLlamada.telefono,
      direccionRecogida: geo?.direccionFormateada || estadoLlamada.recogida,
      latRecogida: geo?.lat ?? null,
      lngRecogida: geo?.lng ?? null,
      paradaSugeridaId: paradaSugerida?.id ?? null,
      estado: "pendiente",
      origen: "llamada_ia",
      confirmadaEn: new Date(),
    },
  });

  async function buscarTaxiEnParada(paradaId) {

    const taxistas = await prisma.taxista.findMany({
      where: {
        estado: "disponible",
        paradaId: paradaId
      },
      orderBy: {
        enParadaDesde: "asc"
      }
    });

    if (!taxistas.length) return null;

    return taxistas[0];
  }

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