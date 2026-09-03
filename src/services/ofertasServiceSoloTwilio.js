const prisma = require("./bd");
const { obtenerLlamadaPorSolicitud } = require("../llamadasActivas");
const { distanciaMetros } = require("./geoUtils");

const OFERTA_TIMEOUT_MS = 10000;
const GPS_RECIENTE_MS = 120000;
const DISTANCIA_MAXIMA_OFERTA_METROS = 15000;


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
    },
    include: {
      vehiculo: true,
      parada: true,
    },
  });

  console.log("Taxistas encontrados:", taxistas.length);

  if (!taxistas.length) return null;

  let mejor = null;

  for (const taxista of taxistas) {
    const distancia = distanciaMetros(lat, lng, taxista.lat, taxista.lng);

    if (distancia > DISTANCIA_MAXIMA_OFERTA_METROS) {
      continue;
    }

    if (!mejor || distancia < mejor.distancia) {
      mejor = {
        taxista,
        distancia,
      };
    }
  }

  console.log(
    "📍 taxi más cercano calculado:",
    mejor
      ? {
        taxistaId: mejor.taxista.id,
        telefono: mejor.taxista.telefono,
        distanciaMetros: Math.round(mejor.distancia),
        paradaId: mejor.taxista.paradaId || null,
        paradaNombre: mejor.taxista.parada?.nombre || null,
      }
      : null
  );

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

  const numeroIntentos =
    await prisma.ofertaSolicitud.count({

      where: {

        solicitudViajeId:
          solicitud.id,

        taxistaId:
          taxista.id,

      },

    });


  if (
    numeroIntentos >= 2
  ) {

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

  const llamadaActiva =
    obtenerLlamadaPorSolicitud(solicitud.id);


  console.log("🧠 LLAMADA EN MEMORIA AL OFERTAR:", {
    solicitudId: solicitud.id,
    llamadaActiva,
  });

  const callId =
    llamadaActiva?.callId || null;

  console.log("📞 CALL ID QUE SE ENVÍA AL TAXISTA:", callId);

  io.to(`taxista:${taxista.id}`).emit("oferta:recibida", {
    ofertaId: oferta.id,
    expiresAt,
    solicitud: {
      id: solicitud.id,
      nombreCliente: solicitud.nombreCliente,
      telefonoCliente: solicitud.telefonoCliente,
      direccionRecogida: solicitud.direccionRecogida,
      direccionBase: solicitud.direccionBase || null,
      referenciaRecogida:
        solicitud.referenciaRecogida || null,

      callId,
    },
  });

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

async function programarSiguienteOferta(
  solicitudViajeId
) {

  console.log(
    "🔁 programarSiguienteOferta",
    {
      solicitudViajeId,
    }
  );


  const solicitud =
    await prisma.solicitudViaje.findUnique({

      where: {
        id:
          solicitudViajeId,
      },

      include: {
        ofertas: true,
      },

    });


  if (!solicitud) {

    console.log(
      "⚠️ No existe la solicitud:",
      solicitudViajeId
    );

    return null;

  }


  /*
   * =====================================================
   * SOLICITUD YA CERRADA
   * =====================================================
   */

  if (
    solicitud.estado === "asignada" ||
    solicitud.estado === "cancelada" ||
    solicitud.estado === "completada" ||
    solicitud.estado === "sin_taxista"
  ) {

    console.log(
      "⛔ Solicitud cerrada:",
      {
        solicitudViajeId,
        estado:
          solicitud.estado,
      }
    );

    return null;

  }


  /*
   * =====================================================
   * NO LANZAR DOS OFERTAS SIMULTÁNEAMENTE
   * =====================================================
   */

  const hayOfertaPendiente =
    solicitud.ofertas.some(
      (oferta) =>
        oferta.estado ===
        "pendiente"
    );


  if (hayOfertaPendiente) {

    console.log(
      "⏳ Ya existe una oferta pendiente"
    );

    return null;

  }


  /*
   * =====================================================
   * CONTAR CUÁNTAS VECES SE HA OFRECIDO
   * A CADA TAXISTA
   * =====================================================
   */

  const intentosPorTaxista =
    new Map();


  for (
    const oferta of
    solicitud.ofertas
  ) {

    const actual =
      intentosPorTaxista.get(
        oferta.taxistaId
      ) || 0;


    intentosPorTaxista.set(
      oferta.taxistaId,
      actual + 1
    );

  }


  console.log(
    "🔢 Intentos por taxista:",
    Object.fromEntries(
      intentosPorTaxista
    )
  );


  /*
   * =====================================================
   * PRIMERA VUELTA
   * =====================================================
   *
   * Excluimos a cualquiera que ya haya recibido
   * esta solicitud alguna vez.
   *
   * De esta forma primero pasan TODOS los taxis
   * disponibles antes de repetir.
   */

  const probadosPrimeraVuelta =
    Array.from(
      intentosPorTaxista.keys()
    );


  let siguienteTaxista =
    await buscarSiguienteTaxistaDisponible(
      solicitudViajeId,
      probadosPrimeraVuelta
    );


  let vuelta =
    1;


  /*
   * =====================================================
   * SEGUNDA VUELTA
   * =====================================================
   *
   * Si ya no queda ningún taxi nuevo,
   * permitimos volver a los que solamente
   * han recibido UNA oferta.
   *
   * Los que ya tengan 2 intentos quedan
   * excluidos definitivamente.
   */

  if (!siguienteTaxista) {

    vuelta =
      2;


    const taxistasConDosIntentos =
      Array.from(
        intentosPorTaxista.entries()
      )
        .filter(
          ([, intentos]) =>
            intentos >= 2
        )
        .map(
          ([taxistaId]) =>
            taxistaId
        );


    siguienteTaxista =
      await buscarSiguienteTaxistaDisponible(
        solicitudViajeId,
        taxistasConDosIntentos
      );

  }


  console.log(
    "🚕 Siguiente taxista:",
    siguienteTaxista?.id ||
    null,
    "vuelta:",
    vuelta
  );


  /*
   * =====================================================
   * HAN TERMINADO LAS DOS VUELTAS
   * =====================================================
   */

  if (!siguienteTaxista) {

    /*
     * ===================================================
     * SOLICITUD DESDE APP CLIENTE
     * ===================================================
     *
     * En la app no seguimos esperando indefinidamente.
     * Si ya hemos recorrido dos veces los taxis
     * disponibles, terminamos.
     */

    if (
      solicitud.origen ===
      "app_cliente"
    ) {

      await prisma.solicitudViaje.update({

        where: {
          id:
            solicitudViajeId,
        },

        data: {
          estado:
            "sin_taxista",
        },

      });


      console.log(
        "🚫 Dos vueltas completadas. Sin taxi:",
        solicitudViajeId
      );


      /*
       * Si en algún momento tenemos clientes
       * conectados por Socket.IO también podemos
       * avisarlos inmediatamente.
       *
       * Ride igualmente lo detectará consultando
       * el estado de la solicitud.
       */

      try {

        const {
          obtenerIo,
        } =
          require(
            "../socketSoloTwilio"
          );


        const io =
          obtenerIo();


        io.to(
          `solicitud:${solicitudViajeId}`
        ).emit(
          "solicitud:sin_taxista",
          {
            solicitudId:
              solicitudViajeId,

            estado:
              "sin_taxista",

            mensaje:
              "No hay taxis disponibles en este momento.",
          }
        );


      } catch (error) {

        console.log(
          "No se pudo emitir solicitud:sin_taxista:",
          error.message
        );

      }


      return null;

    }


    /*
     * ===================================================
     * LLAMADA IA
     * ===================================================
     *
     * Conservamos tu comportamiento actual de Retell:
     * puede esperar hasta su límite de tiempo para que
     * aparezca un taxi disponible.
     */

    await prisma.solicitudViaje.update({

      where: {
        id:
          solicitudViajeId,
      },

      data: {
        estado:
          "pendiente",
      },

    });


    const llamadaActiva =
      obtenerLlamadaPorSolicitud(
        solicitudViajeId
      );


    if (llamadaActiva) {

      llamadaActiva.estado =
        "buscando";

      llamadaActiva.sinTaxi =
        false;

    }


    console.log(
      "⏳ Sin taxi actualmente. La llamada continúa buscando:",
      solicitudViajeId
    );


    return null;

  }


  /*
   * =====================================================
   * LANZAR SIGUIENTE OFERTA
   * =====================================================
   */

  await prisma.solicitudViaje.update({

    where: {
      id:
        solicitudViajeId,
    },

    data: {
      estado:
        "ofertada",
    },

  });


  console.log(
    `📤 Oferta vuelta ${vuelta} → taxista ${siguienteTaxista.id}`
  );


  const oferta =
    await emitirOfertaATaxista({

      solicitud,

      taxista:
        siguienteTaxista,

    });


  return oferta;

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