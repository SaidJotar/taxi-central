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

async function taxistaTieneOfertaPendiente(
  taxistaId
) {

  const ofertaPendiente =
    await prisma.ofertaSolicitud.findFirst({

      where: {

        taxistaId,

        estado:
          "pendiente",

      },

      select: {
        id:
          true,
      },

    });


  return !!ofertaPendiente;
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

        enParadaDesde: {
          not: null,
        },

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

  for (
    const taxista
    of taxistas
  ) {
    const tieneOfertaPendiente =
      await taxistaTieneOfertaPendiente(
        taxista.id
      );

    if (tieneOfertaPendiente) {
      continue;
    }

    console.log(
      "🚕 Taxi seleccionado por parada:",
      {
        paradaId,
        taxistaId:
          taxista.id,
      }
    );

    return taxista;
  }

  console.log(
    "⏳ Todos los taxis de la parada tienen una oferta pendiente:",
    paradaId
  );

  return null;

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
    typeof lat !== "number" ||
    typeof lng !== "number"
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
   * Hay dos tipos de candidatos:
   *
   * 1. TAXI LIBRE
   *    paradaId === null
   *
   *    Compite individualmente utilizando su GPS.
   *
   * 2. PARADA
   *    paradaId !== null
   *
   *    La parada compite como UNA SOLA unidad,
   *    utilizando las coordenadas de la parada.
   *
   *    Si la parada resulta elegida,
   *    se ofrece siempre al primero de la cola.
   *
   * De esta forma NUNCA un segundo taxi de una
   * parada puede adelantarse al primero porque
   * su móvil esté unos metros más cerca.
   * ===================================================
   */

  const taxistas =
    await prisma.taxista.findMany({

      where: {

        estado:
          "disponible",

        lat: {
          not: null,
        },

        lng: {
          not: null,
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
   *
   * El ranking ya NO contiene solamente IDs
   * de taxistas.
   *
   * Puede contener:
   *
   * {
   *   tipo: "taxista",
   *   taxistaId: "..."
   * }
   *
   * o:
   *
   * {
   *   tipo: "parada",
   *   paradaId: "..."
   * }
   *
   * Esto es fundamental:
   *
   * una parada permanece en la misma posición
   * del ranking aunque cambie el primero de cola.
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
     * =================================================
     * TAXIS LIBRES
     * =================================================
     */

    const taxisLibres =
      taxistas.filter(
        (taxista) =>
          !taxista.paradaId
      );


    /*
     * =================================================
     * PARADAS CON TAXIS
     * =================================================
     *
     * Cada parada aparecerá UNA SOLA VEZ.
     */

    const paradasMap =
      new Map();


    for (
      const taxista
      of taxistas
    ) {

      if (
        !taxista.paradaId ||
        !taxista.parada
      ) {
        continue;
      }


      /*
       * Solo necesitamos guardar una vez
       * cada parada.
       */

      if (
        !paradasMap.has(
          taxista.paradaId
        )
      ) {

        paradasMap.set(
          taxista.paradaId,
          taxista.parada
        );

      }

    }


    /*
     * =================================================
     * CONSTRUIR CANDIDATOS
     * =================================================
     */

    const candidatos =
      [];


    /*
     * -------------------------------------------------
     * TAXIS LIBRES
     * -------------------------------------------------
     */

    for (
      const taxista
      of taxisLibres
    ) {

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


      if (
        !Number.isFinite(
          distanciaDirecta
        ) ||
        distanciaDirecta >
        DISTANCIA_MAXIMA_OFERTA_METROS
      ) {
        continue;
      }


      candidatos.push({

        tipo:
          "taxista",

        taxistaId:
          taxista.id,

        paradaId:
          null,

        lat:
          Number(
            taxista.lat
          ),

        lng:
          Number(
            taxista.lng
          ),

        distanciaDirecta,

      });

    }


    /*
     * -------------------------------------------------
     * PARADAS
     * -------------------------------------------------
     *
     * IMPORTANTE:
     *
     * utilizamos Parada.lat / Parada.lng.
     *
     * NO utilizamos el GPS de ninguno de
     * los taxistas que estén haciendo cola.
     */

    for (
      const [
        paradaId,
        parada
      ]
      of paradasMap.entries()
    ) {

      if (
        typeof parada.lat !==
        "number" ||
        typeof parada.lng !==
        "number"
      ) {
        continue;
      }


      /*
       * Antes de incluir la parada,
       * comprobamos que exista al menos
       * un taxista elegible en su cola.
       *
       * Esto además respeta taxistasExcluidos.
       */


      const distanciaDirecta =
        distanciaMetros(

          lat,
          lng,

          Number(
            parada.lat
          ),

          Number(
            parada.lng
          )

        );


      if (
        !Number.isFinite(
          distanciaDirecta
        ) ||
        distanciaDirecta >
        DISTANCIA_MAXIMA_OFERTA_METROS
      ) {
        continue;
      }


      candidatos.push({

        tipo:
          "parada",

        taxistaId:
          null,

        paradaId,

        paradaNombre:
          parada.nombre,

        lat:
          Number(
            parada.lat
          ),

        lng:
          Number(
            parada.lng
          ),

        distanciaDirecta,

      });

    }


    /*
     * =================================================
     * ORDEN INICIAL HAVERSINE
     * =================================================
     */

    candidatos.sort(
      (a, b) =>
        a.distanciaDirecta -
        b.distanciaDirecta
    );


    if (!candidatos.length) {

      console.log(
        "🚫 No hay taxis ni paradas dentro del radio máximo"
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

          tipo:
            candidato.tipo,

          taxistaId:
            candidato.taxistaId,

          paradaId:
            candidato.paradaId,

          paradaNombre:
            candidato.paradaNombre ||
            null,

          distanciaDirecta:
            Math.round(
              candidato
                .distanciaDirecta
            ),

        })
      )
    );


    /*
     * =================================================
     * GOOGLE ROUTES
     * =================================================
     *
     * Igual que antes:
     *
     * máximo los 2 primeros candidatos.
     *
     * Pero ahora un candidato puede ser:
     *
     * - taxi libre
     * - parada
     */

    const candidatosGoogle =
      candidatos.slice(
        0,
        MAX_CANDIDATOS_GOOGLE
      );


    const resultadosGoogle =
      [];


    for (
      const candidato
      of candidatosGoogle
    ) {

      try {

        console.log(
          "🛣️ Google Routes candidato:",
          {

            solicitudViajeId,

            tipo:
              candidato.tipo,

            taxistaId:
              candidato.taxistaId,

            paradaId:
              candidato.paradaId,

            paradaNombre:
              candidato.paradaNombre ||
              null,

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
              candidato.lat,

            origenLng:
              candidato.lng,

            destinoLat:
              lat,

            destinoLng:
              lng,

          });


        resultadosGoogle.push({

          tipo:
            candidato.tipo,

          taxistaId:
            candidato.taxistaId,

          paradaId:
            candidato.paradaId,

          paradaNombre:
            candidato.paradaNombre ||
            null,

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

            tipo:
              candidato.tipo,

            taxistaId:
              candidato.taxistaId,

            paradaId:
              candidato.paradaId,

            paradaNombre:
              candidato.paradaNombre ||
              null,

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

        console.error(
          "⚠️ Google Routes falló para candidato:",
          {

            tipo:
              candidato.tipo,

            taxistaId:
              candidato.taxistaId,

            paradaId:
              candidato.paradaId,

            error:
              error.message,

          }
        );


        resultadosGoogle.push({

          tipo:
            candidato.tipo,

          taxistaId:
            candidato.taxistaId,

          paradaId:
            candidato.paradaId,

          paradaNombre:
            candidato.paradaNombre ||
            null,

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
     * ORDEN GOOGLE
     * =================================================
     *
     * 1. Google correcto
     * 2. menor ETA
     * 3. menor distancia real
     * 4. Haversine como fallback
     */

    resultadosGoogle.sort(
      (
        a,
        b
      ) => {

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


        return (
          a.distanciaDirecta -
          b.distanciaDirecta
        );

      }
    );


    /*
     * =================================================
     * RESTO DE CANDIDATOS
     * =================================================
     */

    const clavesGoogle =
      new Set(
        candidatosGoogle.map(
          (candidato) => {

            if (
              candidato.tipo ===
              "parada"
            ) {

              return (
                `parada:${candidato.paradaId}`
              );

            }


            return (
              `taxista:${candidato.taxistaId}`
            );

          }
        )
      );


    const restoCandidatos =
      candidatos.filter(
        (candidato) => {

          const clave =
            candidato.tipo ===
              "parada"
              ? `parada:${candidato.paradaId}`
              : `taxista:${candidato.taxistaId}`;


          return (
            !clavesGoogle.has(
              clave
            )
          );

        }
      );


    /*
     * =================================================
     * RANKING FINAL
     * =================================================
     *
     * Guardamos TIPO + ID.
     *
     * No guardamos el taxista concreto
     * cuando se trata de una parada.
     */

    ranking = [

      ...resultadosGoogle.map(
        (resultado) => ({

          tipo:
            resultado.tipo,

          taxistaId:
            resultado.taxistaId,

          paradaId:
            resultado.paradaId,

        })
      ),

      ...restoCandidatos.map(
        (candidato) => ({

          tipo:
            candidato.tipo,

          taxistaId:
            candidato.taxistaId,

          paradaId:
            candidato.paradaId,

        })
      ),

    ];


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
   * RECORRER RANKING
   * ===================================================
   */

  for (
    const candidatoRanking
    of ranking
  ) {

    /*
     * =================================================
     * CANDIDATO = TAXISTA LIBRE
     * =================================================
     */

    if (
      candidatoRanking.tipo ===
      "taxista"
    ) {

      const taxistaId =
        candidatoRanking
          .taxistaId;


      if (
        !taxistaId ||
        taxistasExcluidos.includes(
          taxistaId
        )
      ) {
        continue;
      }


      /*
       * Tiene que seguir disponible,
       * tener GPS reciente y,
       * MUY IMPORTANTE,
       * seguir FUERA de una parada.
       */

      const taxista =
        taxistas.find(
          (item) =>
            item.id ===
            taxistaId &&
            !item.paradaId
        );


      if (!taxista) {
        continue;
      }

      const tieneOfertaPendiente =
        await taxistaTieneOfertaPendiente(
          taxista.id
        );

      if (tieneOfertaPendiente) {

        console.log(
          "⏳ Taxi libre omitido porque ya tiene otra oferta pendiente:",
          taxista.id
        );

        continue;
      }


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
        "🚕 Taxi libre seleccionado del ranking:",
        {

          solicitudViajeId,

          taxistaId:
            taxista.id,

          posicionRanking:
            ranking.indexOf(
              candidatoRanking
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
     * =================================================
     * CANDIDATO = PARADA
     * =================================================
     *
     * NO utilizamos el taxi que estuviera primero
     * cuando se creó el ranking.
     *
     * Consultamos AHORA la cola.
     *
     * Así:
     *
     * vuelta 1:
     *
     *   Taxi A
     *   Taxi B
     *
     * se ofrece a A.
     *
     * Si A expira/rechaza:
     *
     * taxistasExcluidos = [A]
     *
     * la misma parada sigue ocupando su lugar
     * en el ranking pero ahora devuelve B.
     */

    if (
      candidatoRanking.tipo ===
      "parada"
    ) {

      const paradaId =
        candidatoRanking
          .paradaId;


      if (!paradaId) {
        continue;
      }


      const taxiParada =
        await buscarTaxiEnParada(
          paradaId,
          taxistasExcluidos
        );


      if (!taxiParada) {
        continue;
      }


      console.log(
        "🚏 Parada seleccionada del ranking:",
        {

          solicitudViajeId,

          paradaId,

          taxistaId:
            taxiParada.id,

          posicionRanking:
            ranking.indexOf(
              candidatoRanking
            ) + 1,

          enParadaDesde:
            taxiParada
              .enParadaDesde,

        }
      );


      return taxiParada;

    }

  }


  /*
   * Ningún taxi / parada del ranking
   * es elegible actualmente.
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

  const tieneOfertaPendiente =
    await taxistaTieneOfertaPendiente(
      taxista.id
    );

  if (tieneOfertaPendiente) {
    console.log(
      "⛔ Oferta NO emitida. Taxista ocupado con otra oferta:",
      {
        taxistaId:
          taxista.id,
        solicitudViajeId:
          solicitud.id,
      }
    );

    return null;
  }

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

  if (!oferta) {
    console.log(
      "🔄 Taxista ocupado por otra oferta. Buscando otro:",
      {
        solicitudViajeId,
        taxistaId:
          siguienteTaxista.id,
      }
    );

    /*
     * Devolvemos temporalmente la solicitud
     * a pendiente para que pueda seguir
     * buscando otro taxista.
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

    return programarSiguienteOferta(
      solicitudViajeId
    );
  }

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