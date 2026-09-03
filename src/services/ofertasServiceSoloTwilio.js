const prisma = require("./bd");

const {
  obtenerLlamadaPorSolicitud,
} = require("../llamadasActivas");

const {
  distanciaMetros,
} = require("./geoUtils");

const {
  calcularRutaTaxiCliente,
} = require("./routesService");


/*
 * =====================================================
 * CONFIGURACIÓN
 * =====================================================
 */

const OFERTA_TIMEOUT_MS = 10000;

const GPS_RECIENTE_MS = 120000;

const DISTANCIA_MAXIMA_OFERTA_METROS =
  15000;


/*
 * Máximo número de candidatos para los que
 * consultamos Google Routes.
 *
 * Por tanto:
 *
 * máximo 2 llamadas Google para seleccionar
 * taxista en cada solicitud.
 */

const MAX_CANDIDATOS_GOOGLE = 2;


/*
 * =====================================================
 * CACHE DE SELECCIÓN POR SOLICITUD
 * =====================================================
 *
 * Guardamos el ranking una vez calculado.
 *
 * Esto es MUY IMPORTANTE:
 *
 * si el primer taxi rechaza o deja expirar
 * la oferta, NO volvemos a hacer las dos
 * llamadas a Google.
 *
 * Simplemente pasamos al siguiente taxi
 * del ranking ya calculado.
 */

const rankingTaxistasPorSolicitud =
  new Map();


function fechaGpsMinima() {

  return new Date(
    Date.now() -
    GPS_RECIENTE_MS
  );

}


/*
 * =====================================================
 * LIMPIAR CACHE DE SELECCIÓN
 * =====================================================
 */

function limpiarRankingTaxistas(
  solicitudViajeId
) {

  if (!solicitudViajeId) {
    return;
  }

  rankingTaxistasPorSolicitud.delete(
    solicitudViajeId
  );

}


/*
 * =====================================================
 * EXPO PUSH RECEIPT
 * =====================================================
 */

async function consultarReceiptExpo(
  ticketId
) {

  const response =
    await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            ids: [
              ticketId,
            ],
          }),
      }
    );


  const result =
    await response.json();


  console.log(
    "Receipt Expo:",
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;

}


/*
 * =====================================================
 * BUSCAR TAXI EN PARADA
 * =====================================================
 *
 * Mantenemos exactamente tu prioridad actual.
 *
 * Si existe una parada sugerida:
 *
 * 1. primero se mira esa parada
 * 2. se respeta enParadaDesde
 * 3. si no hay ninguno válido:
 *    pasamos al sistema GPS + Google Routes
 */

async function buscarTaxiEnParada(
  paradaId,
  taxistasExcluidos = []
) {

  if (!paradaId) {
    return null;
  }


  const taxistas =
    await prisma.taxista.findMany({

      where: {

        estado:
          "disponible",

        paradaId,

        id: {
          notIn:
            taxistasExcluidos,
        },

        vehiculo: {
          isNot:
            null,
        },

      },

      include: {
        vehiculo:
          true,
      },

      orderBy: {
        enParadaDesde:
          "asc",
      },

    });


  if (!taxistas.length) {
    return null;
  }


  console.log(
    "🚕 Taxi seleccionado por parada:",
    {
      paradaId,

      taxistaId:
        taxistas[0].id,
    }
  );


  return taxistas[0];

}


/*
 * =====================================================
 * BUSCAR TAXI POR GPS + RUTA REAL
 * =====================================================
 *
 * FUNCIONAMIENTO:
 *
 * 1. obtenemos todos los taxis disponibles
 * 2. calculamos Haversine GRATIS
 * 3. ordenamos por distancia directa
 * 4. cogemos solo los 2 más cercanos
 * 5. hacemos máximo 2 llamadas Google Routes
 * 6. los dos primeros se ordenan por ETA real
 * 7. el resto se conserva por distancia directa
 * 8. guardamos el ranking para esta solicitud
 *
 * Google NO vuelve a utilizarse al rechazar
 * o expirar una oferta.
 */

async function buscarTaxiMasCercano(
  solicitudViajeId,
  lat,
  lng,
  taxistasExcluidos = []
) {

  if (
    typeof lat !==
    "number" ||
    typeof lng !==
    "number"
  ) {

    return null;

  }


  /*
   * ===================================================
   * TAXISTAS DISPONIBLES AHORA
   * ===================================================
   *
   * IMPORTANTE:
   *
   * No aplicamos taxistasExcluidos aquí al construir
   * la lista completa.
   *
   * De esta forma el ranking de la solicitud puede
   * mantenerse estable.
   *
   * Los excluidos se saltan posteriormente.
   */

  const taxistas =
    await prisma.taxista.findMany({

      where: {

        estado:
          "disponible",

        lat: {
          not:
            null,
        },

        lng: {
          not:
            null,
        },

        vehiculo: {
          isNot:
            null,
        },

        ubicacionActualizadaEn: {
          gte:
            fechaGpsMinima(),
        },

      },

      include: {
        vehiculo:
          true,

        parada:
          true,
      },

    });


  console.log(
    "🚕 Taxistas GPS disponibles:",
    taxistas.length
  );


  if (!taxistas.length) {
    return null;
  }


  /*
   * ===================================================
   * ¿TENEMOS RANKING YA CALCULADO?
   * ===================================================
   */

  let ranking =
    rankingTaxistasPorSolicitud.get(
      solicitudViajeId
    );


  /*
   * ===================================================
   * CREAR RANKING
   * ===================================================
   */

  if (!ranking) {

    /*
     * -------------------------------------------------
     * DISTANCIA DIRECTA
     * -------------------------------------------------
     *
     * Esto es cálculo local.
     *
     * NO consume Google.
     */

    const candidatos =
      taxistas

        .map(
          (taxista) => {

            const distanciaDirecta =
              distanciaMetros(

                lat,

                lng,

                Number(
                  taxista.lat
                ),

                Number(
                  taxista.lng
                )

              );


            return {

              taxista,

              distanciaDirecta,

            };

          }
        )


        /*
         * Descartamos taxis demasiado alejados.
         */

        .filter(
          (item) =>

            Number.isFinite(
              item.distanciaDirecta
            ) &&

            item.distanciaDirecta <=
            DISTANCIA_MAXIMA_OFERTA_METROS
        )


        /*
         * Primero ordenamos gratuitamente
         * por distancia directa.
         */

        .sort(
          (a, b) =>

            a.distanciaDirecta -
            b.distanciaDirecta
        );


    if (!candidatos.length) {

      console.log(
        "🚫 No hay taxis dentro del radio máximo"
      );

      return null;

    }


    console.log(
      "📍 Ranking inicial Haversine:",
      candidatos.map(
        (
          candidato,
          index
        ) => ({

          posicion:
            index + 1,

          taxistaId:
            candidato.taxista.id,

          distanciaDirecta:
            Math.round(
              candidato.distanciaDirecta
            ),

        })
      )
    );


    /*
     * -------------------------------------------------
     * SOLO LOS DOS PRIMEROS
     * -------------------------------------------------
     */

    const candidatosGoogle =
      candidatos.slice(
        0,
        MAX_CANDIDATOS_GOOGLE
      );


    const resultadosGoogle =
      [];


    /*
     * =================================================
     * GOOGLE ROUTES
     * =================================================
     *
     * Como candidatosGoogle tiene como máximo
     * 2 elementos:
     *
     * aquí nunca habrá más de 2 peticiones.
     */

    for (
      const candidato
      of candidatosGoogle
    ) {

      try {

        console.log(
          "🛣️ Google Routes candidato:",
          {
            solicitudViajeId,

            taxistaId:
              candidato
                .taxista
                .id,

            distanciaDirecta:
              Math.round(
                candidato
                  .distanciaDirecta
              ),
          }
        );


        const ruta =
          await calcularRutaTaxiCliente({

            origenLat:
              Number(
                candidato
                  .taxista
                  .lat
              ),

            origenLng:
              Number(
                candidato
                  .taxista
                  .lng
              ),

            destinoLat:
              lat,

            destinoLng:
              lng,

          });


        resultadosGoogle.push({

          taxistaId:
            candidato
              .taxista
              .id,

          distanciaDirecta:
            candidato
              .distanciaDirecta,

          distanciaRuta:
            Number(
              ruta
                .distanciaMetros
            ),

          etaMinutos:
            Number(
              ruta
                .etaMinutos
            ),

          googleOk:
            true,

        });


        console.log(
          "✅ Ruta real candidato:",
          {
            taxistaId:
              candidato
                .taxista
                .id,

            etaMinutos:
              ruta
                .etaMinutos,

            distanciaRuta:
              ruta
                .distanciaMetros,
          }
        );


      } catch (
      error
      ) {

        /*
         * MUY IMPORTANTE:
         *
         * Si Google falla NO repetimos.
         *
         * Esa petición ya ha contado como intento.
         *
         * Utilizamos la distancia directa
         * como fallback.
         */

        console.error(
          "⚠️ Google Routes falló para candidato:",
          {
            taxistaId:
              candidato
                .taxista
                .id,

            error:
              error.message,
          }
        );


        resultadosGoogle.push({

          taxistaId:
            candidato
              .taxista
              .id,

          distanciaDirecta:
            candidato
              .distanciaDirecta,

          distanciaRuta:
            null,

          etaMinutos:
            null,

          googleOk:
            false,

        });

      }

    }


    /*
     * =================================================
     * ORDENAR LOS DOS CANDIDATOS
     * =================================================
     *
     * Prioridad:
     *
     * 1. ruta Google correcta
     * 2. menor ETA
     * 3. si mismo ETA, menor distancia real
     * 4. si Google falla, Haversine
     */

    resultadosGoogle.sort(
      (
        a,
        b
      ) => {

        /*
         * Uno tiene Google y otro no.
         */

        if (
          a.googleOk &&
          !b.googleOk
        ) {

          return -1;

        }


        if (
          !a.googleOk &&
          b.googleOk
        ) {

          return 1;

        }


        /*
         * Los dos tienen ruta Google.
         */

        if (
          a.googleOk &&
          b.googleOk
        ) {

          if (
            a.etaMinutos !==
            b.etaMinutos
          ) {

            return (
              a.etaMinutos -
              b.etaMinutos
            );

          }


          /*
           * Si los dos tienen mismo minuto estimado,
           * elegimos la ruta real más corta.
           */

          if (
            Number.isFinite(
              a.distanciaRuta
            ) &&
            Number.isFinite(
              b.distanciaRuta
            )
          ) {

            return (
              a.distanciaRuta -
              b.distanciaRuta
            );

          }

        }


        /*
         * Google falló en ambos.
         *
         * Volvemos a Haversine.
         */

        return (
          a.distanciaDirecta -
          b.distanciaDirecta
        );

      }
    );


    /*
     * =================================================
     * RESTO DE TAXIS
     * =================================================
     *
     * Para ellos NO hacemos ninguna llamada Google.
     *
     * Siguen ordenados por Haversine.
     */

    const idsConsultadosGoogle =
      new Set(

        candidatosGoogle.map(
          (candidato) =>

            candidato
              .taxista
              .id
        )

      );


    const restoTaxistas =
      candidatos.filter(
        (candidato) =>

          !idsConsultadosGoogle.has(
            candidato
              .taxista
              .id
          )
      );


    /*
     * =================================================
     * RANKING FINAL
     * =================================================
     */

    ranking = [

      /*
       * Los 2 candidatos comparados
       * por ruta real.
       */

      ...resultadosGoogle.map(
        (resultado) =>

          resultado
            .taxistaId
      ),


      /*
       * Resto por Haversine.
       */

      ...restoTaxistas.map(
        (candidato) =>

          candidato
            .taxista
            .id
      ),

    ];


    /*
     * Guardamos el ranking.
     */

    rankingTaxistasPorSolicitud.set(
      solicitudViajeId,
      ranking
    );


    console.log(
      "🏁 Ranking final guardado:",
      {
        solicitudViajeId,

        ranking,

        peticionesGoogle:
          candidatosGoogle.length,

        comparacionGoogle:
          resultadosGoogle,
      }
    );

  }


  /*
   * ===================================================
   * SIGUIENTE TAXISTA DEL RANKING
   * ===================================================
   */

  for (
    const taxistaId
    of ranking
  ) {

    /*
     * Ya recibió una oferta en esta vuelta.
     */

    if (
      taxistasExcluidos.includes(
        taxistaId
      )
    ) {

      continue;

    }


    /*
     * Comprobamos que SIGUE disponible.
     *
     * taxistas contiene únicamente:
     *
     * - disponible
     * - vehículo
     * - GPS reciente
     */

    const taxista =
      taxistas.find(
        (item) =>

          item.id ===
          taxistaId
      );


    if (!taxista) {
      continue;
    }


    /*
     * Como el taxi puede haberse movido desde que
     * calculamos inicialmente el ranking,
     * comprobamos también que siga dentro del
     * radio máximo.
     */

    const distanciaActual =
      distanciaMetros(

        lat,

        lng,

        Number(
          taxista.lat
        ),

        Number(
          taxista.lng
        )

      );


    if (
      !Number.isFinite(
        distanciaActual
      ) ||
      distanciaActual >
      DISTANCIA_MAXIMA_OFERTA_METROS
    ) {

      continue;

    }


    console.log(
      "🚕 Taxi seleccionado del ranking:",
      {
        solicitudViajeId,

        taxistaId:
          taxista.id,

        posicionRanking:
          ranking.indexOf(
            taxista.id
          ) + 1,

        distanciaDirectaActual:
          Math.round(
            distanciaActual
          ),
      }
    );


    return taxista;

  }


  /*
   * Ninguno del ranking está disponible
   * para esta vuelta.
   */

  return null;

}


/*
 * =====================================================
 * SIGUIENTE TAXISTA DISPONIBLE
 * =====================================================
 */

async function buscarSiguienteTaxistaDisponible(
  solicitudViajeId,
  taxistasExcluidos = []
) {

  const solicitud =
    await prisma.solicitudViaje.findUnique({

      where: {
        id:
          solicitudViajeId,
      },

    });


  if (!solicitud) {
    return null;
  }


  /*
   * ===================================================
   * PRIORIDAD PARADA
   * ===================================================
   */

  if (
    solicitud.paradaSugeridaId
  ) {

    const taxiParada =
      await buscarTaxiEnParada(

        solicitud
          .paradaSugeridaId,

        taxistasExcluidos

      );


    if (taxiParada) {

      return taxiParada;

    }

  }


  /*
   * ===================================================
   * GPS + GOOGLE ROUTES
   * ===================================================
   */

  if (
    typeof solicitud.latRecogida ===
    "number" &&

    typeof solicitud.lngRecogida ===
    "number"
  ) {

    const taxiCercano =
      await buscarTaxiMasCercano(

        solicitud.id,

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


/*
 * =====================================================
 * SOLICITUD PENDIENTE
 * =====================================================
 */

async function buscarSolicitudPendiente() {

  return prisma.solicitudViaje.findFirst({

    where: {
      estado:
        "pendiente",
    },

    orderBy: {
      creadaEn:
        "asc",
    },

  });

}


/*
 * =====================================================
 * INTENTAR OFERTAR SOLICITUD PENDIENTE
 * =====================================================
 */

async function intentarOfertarSolicitudPendienteATaxista(
  taxistaId
) {

  const taxista =
    await prisma.taxista.findUnique({

      where: {
        id:
          taxistaId,
      },

      include: {
        vehiculo:
          true,
      },

    });


  if (
    !taxista ||
    taxista.estado !==
    "disponible" ||
    !taxista.vehiculo
  ) {

    return null;

  }


  const solicitud =
    await buscarSolicitudPendiente();


  if (!solicitud) {

    return null;

  }


  /*
   * Este taxista puede recibir como máximo
   * DOS veces la misma solicitud.
   */

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


  const taxistaElegido =
    await buscarSiguienteTaxistaDisponible(
      solicitud.id
    );


  if (!taxistaElegido) {

    return null;

  }


  if (
    taxistaElegido.id !==
    taxista.id
  ) {

    return null;

  }


  await prisma.solicitudViaje.update({

    where: {
      id:
        solicitud.id,
    },

    data: {
      estado:
        "ofertada",
    },

  });


  return emitirOfertaATaxista({

    solicitud,

    taxista,

  });

}


/*
 * =====================================================
 * PUSH DE OFERTA
 * =====================================================
 */

async function enviarPushOferta(
  expoPushToken,
  solicitud,
  oferta,
  taxistaId
) {

  if (!expoPushToken) {

    console.log(
      "No hay expoPushToken guardado"
    );

    return;

  }


  const mensaje = {

    to:
      expoPushToken,

    title:
      "Nueva oferta",

    body:
      solicitud.direccionBase ||
      solicitud.direccionRecogida ||
      "Tienes una nueva oferta",

    data: {

      type:
        "oferta",

      ofertaId:
        oferta.id,

      solicitudId:
        solicitud.id,

    },

    priority:
      "high",

    channelId:
      "default",

  };


  const response =
    await fetch(
      "https://exp.host/--/api/v2/push/send",
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "application/json",

          Accept:
            "application/json",

        },

        body:
          JSON.stringify(
            mensaje
          ),

      }
    );


  const result =
    await response.json();


  console.log(
    "Resultado Expo push:",
    JSON.stringify(
      result,
      null,
      2
    )
  );


  const ticketId =
    result?.data?.id;


  if (!ticketId) {

    return result;

  }


  setTimeout(
    async () => {

      try {

        const receiptResult =
          await consultarReceiptExpo(
            ticketId
          );


        const receipt =
          receiptResult
            ?.data
          ?.[ticketId];


        if (
          receipt
            ?.details
            ?.error ===
          "DeviceNotRegistered"
        ) {

          console.log(
            "Token inválido. Limpiando expoPushToken del taxista:",
            taxistaId
          );


          await prisma.taxista.update({

            where: {
              id:
                taxistaId,
            },

            data: {
              expoPushToken:
                null,
            },

          });

        }

      } catch (
      error
      ) {

        console.error(
          "Error consultando receipt Expo:",
          error
        );

      }

    },

    15000
  );


  return result;

}


/*
 * =====================================================
 * EMITIR OFERTA A TAXISTA
 * =====================================================
 */

async function emitirOfertaATaxista({
  solicitud,
  taxista,
}) {

  const oferta =
    await prisma.ofertaSolicitud.create({

      data: {

        solicitudViajeId:
          solicitud.id,

        taxistaId:
          taxista.id,

        estado:
          "pendiente",

      },

    });


  const {
    obtenerIo,
  } =
    require(
      "../socketSoloTwilio"
    );


  const io =
    obtenerIo();


  const expiresAt =
    new Date(
      Date.now() +
      OFERTA_TIMEOUT_MS
    ).toISOString();


  const llamadaActiva =
    obtenerLlamadaPorSolicitud(
      solicitud.id
    );


  console.log(
    "🧠 LLAMADA EN MEMORIA AL OFERTAR:",
    {
      solicitudId:
        solicitud.id,

      llamadaActiva,
    }
  );


  const callId =
    llamadaActiva?.callId ||
    null;


  console.log(
    "📞 CALL ID QUE SE ENVÍA AL TAXISTA:",
    callId
  );


  io.to(
    `taxista:${taxista.id}`
  ).emit(
    "oferta:recibida",
    {

      ofertaId:
        oferta.id,

      expiresAt,

      solicitud: {

        id:
          solicitud.id,

        nombreCliente:
          solicitud.nombreCliente,

        telefonoCliente:
          solicitud.telefonoCliente,

        direccionRecogida:
          solicitud.direccionRecogida,

        direccionBase:
          solicitud.direccionBase ||
          null,

        referenciaRecogida:
          solicitud.referenciaRecogida ||
          null,

        callId,

      },

    }
  );


  try {

    await enviarPushOferta(

      taxista.expoPushToken,

      solicitud,

      oferta,

      taxista.id

    );

  } catch (
  error
  ) {

    console.error(
      "Error enviando push oferta:",
      error
    );

  }


  programarTimeoutOferta(
    oferta.id
  );


  return oferta;

}


/*
 * =====================================================
 * PROGRAMAR SIGUIENTE OFERTA
 * =====================================================
 */

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
        ofertas:
          true,
      },

    });


  if (!solicitud) {

    console.log(
      "⚠️ No existe la solicitud:",
      solicitudViajeId
    );


    limpiarRankingTaxistas(
      solicitudViajeId
    );


    return null;

  }


  /*
   * ===================================================
   * SOLICITUD YA CERRADA
   * ===================================================
   */

  if (
    solicitud.estado ===
    "asignada" ||

    solicitud.estado ===
    "cancelada" ||

    solicitud.estado ===
    "completada" ||

    solicitud.estado ===
    "sin_taxista"
  ) {

    console.log(
      "⛔ Solicitud cerrada:",
      {

        solicitudViajeId,

        estado:
          solicitud.estado,

      }
    );


    /*
     * Ya no necesitamos conservar
     * el ranking en memoria.
     */

    limpiarRankingTaxistas(
      solicitudViajeId
    );


    return null;

  }


  /*
   * ===================================================
   * NO LANZAR DOS OFERTAS SIMULTÁNEAMENTE
   * ===================================================
   */

  const hayOfertaPendiente =
    solicitud.ofertas.some(
      (oferta) =>

        oferta.estado ===
        "pendiente"
    );


  if (
    hayOfertaPendiente
  ) {

    console.log(
      "⏳ Ya existe una oferta pendiente"
    );


    return null;

  }


  /*
   * ===================================================
   * CONTAR INTENTOS POR TAXISTA
   * ===================================================
   */

  const intentosPorTaxista =
    new Map();


  for (
    const oferta
    of solicitud.ofertas
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
   * ===================================================
   * PRIMERA VUELTA
   * ===================================================
   *
   * Ningún taxista repite hasta que hayan
   * pasado todos los disponibles.
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
   * ===================================================
   * SEGUNDA VUELTA
   * ===================================================
   *
   * Si ya no queda ningún taxista nuevo,
   * solamente excluimos aquellos que ya
   * hayan recibido 2 ofertas.
   */

  if (
    !siguienteTaxista
  ) {

    vuelta =
      2;


    const taxistasConDosIntentos =
      Array.from(
        intentosPorTaxista.entries()
      )

        .filter(
          (
            [
              ,
              intentos,
            ]
          ) =>

            intentos >=
            2
        )

        .map(
          (
            [
              taxistaId,
            ]
          ) =>

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
   * ===================================================
   * TERMINARON LAS DOS VUELTAS
   * ===================================================
   */

  if (
    !siguienteTaxista
  ) {

    /*
     * =================================================
     * APP CLIENTE
     * =================================================
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


      /*
       * Ya hemos terminado completamente.
       */

      limpiarRankingTaxistas(
        solicitudViajeId
      );


      console.log(
        "🚫 Dos vueltas completadas. Sin taxi:",
        solicitudViajeId
      );


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


      } catch (
      error
      ) {

        console.log(
          "No se pudo emitir solicitud:sin_taxista:",
          error.message
        );

      }


      return null;

    }


    /*
     * =================================================
     * LLAMADA IA / RETELL
     * =================================================
     *
     * Conservamos tu comportamiento actual.
     *
     * Si ahora no hay taxi, la solicitud
     * vuelve a pendiente.
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


    if (
      llamadaActiva
    ) {

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
   * ===================================================
   * LANZAR SIGUIENTE OFERTA
   * ===================================================
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


/*
 * =====================================================
 * TIMEOUT DE OFERTA
 * =====================================================
 */

function programarTimeoutOferta(
  ofertaId
) {

  setTimeout(
    async () => {

      try {

        const oferta =
          await prisma.ofertaSolicitud.findUnique({

            where: {
              id:
                ofertaId,
            },

            include: {
              solicitudViaje:
                true,

              taxista:
                true,
            },

          });


        if (!oferta) {
          return;
        }


        if (
          oferta.estado !==
          "pendiente"
        ) {

          return;

        }


        if (
          oferta
            .solicitudViaje
            ?.estado ===
          "cancelada"
        ) {

          limpiarRankingTaxistas(
            oferta
              .solicitudViajeId
          );


          return;

        }


        await prisma.ofertaSolicitud.update({

          where: {
            id:
              ofertaId,
          },

          data: {

            estado:
              "expirada",

            respondidaEn:
              new Date(),

          },

        });


        const {
          obtenerIo,
        } =
          require(
            "../socketSoloTwilio"
          );


        const io =
          obtenerIo();


        io.to(
          `taxista:${oferta.taxistaId}`
        ).emit(
          "oferta:expirada",
          {

            ofertaId:
              oferta.id,

            solicitudViajeId:
              oferta.solicitudViajeId,

          }
        );


        /*
         * Aquí se buscará el siguiente taxi.
         *
         * Como el ranking está en memoria,
         * NO volveremos a utilizar Google.
         */

        await programarSiguienteOferta(
          oferta.solicitudViajeId
        );


      } catch (
      error
      ) {

        console.error(
          "Error en timeout de oferta:",
          error.message
        );

      }

    },

    OFERTA_TIMEOUT_MS
  );

}


/*
 * =====================================================
 * EXPORTS
 * =====================================================
 */

module.exports = {

  emitirOfertaATaxista,

  programarSiguienteOferta,

  programarTimeoutOferta,

  buscarSiguienteTaxistaDisponible,

  buscarSolicitudPendiente,

  intentarOfertarSolicitudPendienteATaxista,

};