const prisma = require("./bd");
const {
  guardarLlamadaPorSolicitud,
} = require("../llamadasActivas");
const {
  buscarSiguienteTaxistaDisponible,
  emitirOfertaATaxista,
} = require("./ofertasServiceSoloTwilio");
const { geocodificarDireccion } = require("./geocodingService");
const { buscarParadaMasCercana } = require("./paradasService");

function separarDireccionReferencia(
  texto = ""
) {
  let limpio = texto
    .trim()
    .replace(
      /^(en la|en el|en los|en las|en|por|sobre)\s+/i,
      ""
    )
    .trim();

  if (!limpio) {
    return {
      direccionBase: null,
      referenciaRecogida: null,
    };
  }

  const patronReferencia =
    /\s+(frente\s+a|al\s+lado\s+de|junto\s+a|cerca\s+de|detr[aá]s\s+de|en\s+la\s+puerta\s+de|en\s+la\s+puerta\s+del|en\s+la\s+entrada\s+de|en\s+la\s+entrada\s+del|esquina\s+con)\s+(.+)$/i;

  const coincidencia =
    limpio.match(patronReferencia);

  if (!coincidencia) {
    return {
      direccionBase: limpio,
      referenciaRecogida: null,
    };
  }

  const indice =
    coincidencia.index ?? limpio.length;

  const direccionBase = limpio
    .slice(0, indice)
    .trim();

  const referenciaRecogida =
    `${coincidencia[1]} ${coincidencia[2]}`
      .trim();

  return {
    direccionBase:
      direccionBase || limpio,
    referenciaRecogida:
      referenciaRecogida || null,
  };
}

async function crearSolicitudTaxi(estadoLlamada) {
  let geo =
    estadoLlamada.lat != null &&
      estadoLlamada.lng != null
      ? {
        lat: Number(estadoLlamada.lat),
        lng: Number(estadoLlamada.lng),
        direccionFormateada:
          estadoLlamada.direccion ||
          estadoLlamada.direccionBase ||
          null,
        placeId:
          estadoLlamada.placeId || null,
      }
      : null;

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
    // Respaldo solamente si la herramienta no proporcionó
    // las coordenadas por algún error o por compatibilidad
    // con llamadas antiguas.
    if (
      (!geo ||
        geo.lat == null ||
        geo.lng == null) &&
      textoParaGeocodificar
    ) {
      const resultadoGeo =
        await geocodificarDireccion(
          textoParaGeocodificar
        );

      if (resultadoGeo?.encontrada) {
        geo = resultadoGeo;
      }
    }

    if (
      geo?.lat != null &&
      geo?.lng != null
    ) {
      paradaSugerida =
        await buscarParadaMasCercana(
          geo.lat,
          geo.lng
        );
    }

    console.log(
      "🌍 Ubicación definitiva:",
      geo
    );
    console.log(
      "🅿️ Parada sugerida:",
      paradaSugerida
    );
  } catch (error) {
    console.error(
      "❌ Error preparando solicitud:",
      error.message
    );
  }

  const direccionNormalizada =
    estadoLlamada.direccion ||
    estadoLlamada.direccionBase ||
    geo?.direccionFormateada ||
    textoOriginal ||
    textoParaGeocodificar ||
    "Ubicación no indicada";

  const solicitud = await prisma.solicitudViaje.create({
    data: {
      nombreCliente: estadoLlamada.nombre || "Cliente",
      telefonoCliente: estadoLlamada.telefono,
      direccionRecogida: direccionNormalizada,
      direccionBase:
        estadoLlamada.direccionBase ||
        direccionNormalizada,
      referenciaRecogida:
        referenciaRecogida || null,
      latRecogida: geo?.lat ?? null,
      lngRecogida: geo?.lng ?? null,
      paradaSugeridaId: paradaSugerida?.id ?? null,
      estado: "pendiente",
      origen: "llamada_ia",
      confirmadaEn: new Date(),
    },
  });

  estadoLlamada.referencia = solicitud.id;

  guardarLlamadaPorSolicitud(
    solicitud.id,
    estadoLlamada
  );

  console.log("📞 Llamada vinculada en memoria:", {
    solicitudId: solicitud.id,
    callId: estadoLlamada.callId || null,
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