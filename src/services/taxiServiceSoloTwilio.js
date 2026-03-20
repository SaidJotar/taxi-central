const prisma = require("./bd");
const {
  buscarSiguienteTaxistaDisponible,
  emitirOfertaATaxista,
} = require("./ofertasServiceSoloTwilio");
const { geocodificarDireccion } = require("./geocodingService");
const { buscarParadaMasCercana } = require("./paradasService");

function separarDireccionReferencia(texto = "") {
  let limpio = texto.trim();

  if (!limpio) {
    return {
      direccionBase: null,
      referenciaRecogida: null,
    };
  }

  limpio = limpio
    .replace(/^(en la|en el|en los|en las)\s+/i, "")
    .replace(/^(en|por|sobre)\s+/i, "")
    .trim();

  const lower = limpio.toLowerCase();

  const separadores = [
    " donde ",
    " frente a ",
    " al lado de ",
    " junto a ",
    " cerca de ",
    " detrás de ",
    " detras de ",
    " por ",
    " en la puerta de ",
    " en la puerta del ",
    " en la entrada de ",
    " en la entrada del ",
  ];

  for (const sep of separadores) {
    const idx = lower.indexOf(sep);

    if (idx !== -1) {
      const base = limpio.substring(0, idx).trim();
      const ref = limpio.substring(idx + sep.length).trim();

      return {
        direccionBase: base || limpio,
        referenciaRecogida: ref || null,
      };
    }
  }

  return {
    direccionBase: limpio,
    referenciaRecogida: null,
  };
}

async function crearSolicitudTaxi(estadoLlamada) {
  let geo = null;
  let paradaSugerida = null;

  const textoOriginal =
    estadoLlamada.recogidaTextoOriginal ||
    estadoLlamada.recogida ||
    null;

  let direccionBase =
    estadoLlamada.direccionBase ||
    null;

  let referenciaRecogida =
    estadoLlamada.referenciaRecogida ||
    null;

  if (!direccionBase && textoOriginal) {
    const separada = separarDireccionReferencia(textoOriginal);
    direccionBase = separada.direccionBase;
    referenciaRecogida = referenciaRecogida || separada.referenciaRecogida;
  }

  const textoParaGeocodificar = direccionBase || textoOriginal;

  console.log("📞 Dirección recibida IA:", textoOriginal);
  console.log("📍 Base:", direccionBase);
  console.log("📌 Referencia:", referenciaRecogida);

  try {
    if (textoParaGeocodificar) {
      geo = await geocodificarDireccion(textoParaGeocodificar);
    }

    if (geo?.lat != null && geo?.lng != null) {
      paradaSugerida = await buscarParadaMasCercana(geo.lat, geo.lng);
    }

    console.log("🌍 Resultado geocodificación:", geo);
    console.log("🅿️ Parada sugerida:", paradaSugerida);

  } catch (error) {
    console.error("❌ Error preparando solicitud:", error.message);
  }

  const solicitud = await prisma.solicitudViaje.create({
    data: {
      nombreCliente: estadoLlamada.nombre || "Cliente",
      telefonoCliente: estadoLlamada.telefono,
      direccionRecogida:
        textoOriginal || textoParaGeocodificar || "Ubicación no indicada",
      direccionBase: direccionBase || null,
      referenciaRecogida: referenciaRecogida || null,
      latRecogida: geo?.lat ?? null,
      lngRecogida: geo?.lng ?? null,
      paradaSugeridaId: paradaSugerida?.id ?? null,
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