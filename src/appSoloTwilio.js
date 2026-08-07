const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");

const { port } = require("./configSoloTwilio");
const { leerJsonArray } = require("./services/storageService");
const prisma = require("./services/bd");
const { iniciarSocket } = require("./socketSoloTwilio");
const { obtenerIo } = require("./socketSoloTwilio");
const authRoutes = require("./routes/auth");
const { geocodificarDireccion } = require("./services/geocodingService");
const { buscarParadaMasCercana } = require("./services/paradasService");
const mobileRoutes = require("./routes/mobile");
const clienteRoutes = require("./routes/cliente");
const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "https://sjaceuta.es",
  "https://www.sjaceuta.es",
  "https://dev-api.sjaceuta.es",
  "https://api.sjaceuta.es",
  "https://taxista.sjaceuta.es",
  "https://objetos.sjaceuta.es",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS no permitido para origin: ${origin}`));
  },
  credentials: true,
}));

/*
|--------------------------------------------------------------------------
| RETELL AI
|--------------------------------------------------------------------------
| Debe declararse antes de express.json() y express.urlencoded()
| para conservar el body original como Buffer.
|--------------------------------------------------------------------------
*/

function verificarPeticionRetell(req) {
  const apiKey = process.env.RETELL_API_KEY;
  const signatureHeader = req.headers["x-retell-signature"];

  if (!apiKey) {
    console.error("❌ Falta RETELL_API_KEY en .env");
    return false;
  }

  if (!signatureHeader || typeof signatureHeader !== "string") {
    console.error("❌ Falta X-Retell-Signature");
    return false;
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error("❌ El body de Retell no llegó como Buffer");
    return false;
  }

  const rawBody = req.body.toString("utf8");

  /*
   * Formato:
   * v=timestamp,d=digest
   */
  const match = signatureHeader.match(/^v=(\d+),d=(.+)$/);

  if (!match) {
    console.error("❌ Formato de firma Retell no válido:", signatureHeader);
    return false;
  }

  const timestamp = match[1];
  const digestRecibido = match[2];

  const timestampNumero = Number(timestamp);

  if (!Number.isFinite(timestampNumero)) {
    console.error("❌ Timestamp Retell no válido");
    return false;
  }

  /*
   * Impide reutilizar una petición antigua.
   */
  const diferencia = Math.abs(Date.now() - timestampNumero);

  if (diferencia > 5 * 60 * 1000) {
    console.error("❌ Firma Retell caducada");
    return false;
  }

  /*
   * HMAC-SHA256(rawBody + timestamp, apiKey)
   */
  const digestEsperado = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody + timestamp)
    .digest("hex");

  try {
    const bufferEsperado = Buffer.from(digestEsperado, "hex");
    const bufferRecibido = Buffer.from(digestRecibido, "hex");

    if (bufferEsperado.length !== bufferRecibido.length) {
      console.error("❌ Longitud de firma Retell incorrecta");
      return false;
    }

    const valida = crypto.timingSafeEqual(
      bufferEsperado,
      bufferRecibido
    );

    if (!valida) {
      console.error("❌ Firma Retell incorrecta");
    }

    return valida;
  } catch (error) {
    console.error("❌ Error comparando firma Retell:", error.message);
    return false;
  }
}

function obtenerBodyRetell(req) {
  if (!Buffer.isBuffer(req.body)) {
    throw new Error("El body de Retell no es un Buffer");
  }

  return JSON.parse(req.body.toString("utf8"));
}

const retellRawJson = express.raw({
  type: "application/json",
  limit: "2mb",
});

/*
|--------------------------------------------------------------------------
| Webhook de eventos de llamada
|--------------------------------------------------------------------------
*/

app.post("/retell/webhook", retellRawJson, (req, res) => {
  try {
    if (!verificarPeticionRetell(req)) {
      return res.status(401).json({
        ok: false,
        error: "Firma de Retell no válida",
      });
    }

    const { event, call } = obtenerBodyRetell(req);

    return res.sendStatus(204);
  } catch (error) {
    console.error("❌ Error procesando webhook Retell:", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

/*
|--------------------------------------------------------------------------
| Función: buscar_direccion
|--------------------------------------------------------------------------
*/

app.post(
  "/retell/functions/buscar-direccion",
  retellRawJson,
  async (req, res) => {
    try {
      if (!verificarPeticionRetell(req)) {
        return res.status(401).json({
          ok: false,
          error: "Firma de Retell no válida",
        });
      }

      const body = obtenerBodyRetell(req);

      /*
       * Cuando "Payload: args only" está desactivado:
       * body.args.direccion
       *
       * Cuando está activado:
       * body.direccion
       */
      const args = body.args || body;
      const direccion = typeof args.direccion === "string"
        ? args.direccion.trim()
        : "";

      console.log("📍 Retell busca dirección:", direccion);

      if (!direccion) {
        return res.status(400).json({
          encontrada: false,
          mensaje: "No se ha indicado una dirección de recogida.",
        });
      }

      async function geocodificarConVariantes(direccion) {
        const variantes = [
          direccion,
          direccion.replace(/^calle\s+/i, ""),
          `${direccion}, 51001 Ceuta, España`,
          direccion.replace(/^calle\s+/i, "") + ", Ceuta, España",
        ];

        for (const variante of variantes) {

          const geo = await geocodificarDireccion(variante);

          if (geo?.lat != null && geo?.lng != null) {
            return {
              ...geo,
              consultaUsada: variante,
            };
          }
        }

        return null;
      }

      const geo = await geocodificarConVariantes(direccion);

      if (
        !geo ||
        geo.lat == null ||
        geo.lng == null
      ) {
        return res.json({
          encontrada: false,
          mensaje:
            "No he podido localizar esa dirección. Pide al cliente que indique la calle y el número.",
        });
      }

      const paradaSugerida = await buscarParadaMasCercana(
        geo.lat,
        geo.lng
      );

      console.log("✅ Dirección localizada:", geo);
      console.log("🚕 Parada sugerida:", paradaSugerida?.id);

      return res.json({
        encontrada: true,

        direccionOriginal: direccion,

        direccionNormalizada:
          geo.direccion ||
          geo.displayName ||
          geo.formattedAddress ||
          direccion,

        lat: geo.lat,
        lng: geo.lng,

        paradaSugeridaId: paradaSugerida?.id || null,
        paradaSugeridaNombre: paradaSugerida?.nombre || null,

        mensaje: "La dirección se ha localizado correctamente.",
      });
    } catch (error) {
      console.error("❌ Error buscando dirección para Retell:", error);

      return res.status(500).json({
        encontrada: false,
        mensaje: "Ha ocurrido un error al comprobar la dirección.",
      });
    }
  }
);


function normalizarTelefonoCliente(valor) {
  if (valor === undefined || valor === null) {
    return null;
  }

  let telefono = String(valor)
    .trim()
    .replace(/\D/g, "");

  if (!telefono) {
    return null;
  }


  if (
    telefono.startsWith("0034") &&
    telefono.length === 13
  ) {
    telefono = telefono.slice(4);
  } else if (
    telefono.startsWith("34") &&
    telefono.length === 11
  ) {
    telefono = telefono.slice(2);
  }

  /*
   * Número español normal de 9 cifras.
   * Acepta móviles y teléfonos fijos.
   */
  if (!/^[6789]\d{8}$/.test(telefono)) {
    return null;
  }

  return telefono;
}

/*
|--------------------------------------------------------------------------
| Función: crear_solicitud_taxi
|--------------------------------------------------------------------------
*/

const TIEMPO_MAXIMO_BUSQUEDA_RETELL_MS = 60000;
const INTERVALO_COMPROBACION_RETELL_MS = 1000;
const INTERVALO_REINTENTO_SIN_TAXI_MS = 3000;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenerOfertaAceptada(solicitudViajeId) {
  return prisma.ofertaSolicitud.findFirst({
    where: {
      solicitudViajeId,
      estado: "aceptada",
    },
    include: {
      taxista: {
        include: {
          vehiculo: true,
        },
      },
    },
    orderBy: {
      respondidaEn: "desc",
    },
  });
}

function construirResultadoAceptado(solicitudId, ofertaAceptada) {
  const numeroTaxi =
    ofertaAceptada?.taxista?.vehiculo?.numeroTaxi || null;

  const matricula =
    ofertaAceptada?.taxista?.vehiculo?.matricula || null;

  let mensajeCliente =
    "Un taxi ha aceptado la solicitud y ya va de camino.";

  if (numeroTaxi) {
    mensajeCliente =
      `El taxi número ${numeroTaxi} ha aceptado la solicitud y ya va de camino.`;
  } else if (matricula) {
    mensajeCliente =
      `El taxi con matrícula ${matricula} ha aceptado la solicitud y ya va de camino.`;
  }

  return {
    ok: true,
    estado: "aceptado",
    solicitudId,
    ofertaId: ofertaAceptada.id,
    taxi: {
      numeroTaxi,
      matricula,
    },
    mensajeCliente,
  };
}

async function intentarLanzarOfertaRetell(solicitudViajeId) {
  const solicitud = await prisma.solicitudViaje.findUnique({
    where: {
      id: solicitudViajeId,
    },
    include: {
      ofertas: true,
    },
  });

  if (!solicitud) {
    return {
      lanzada: false,
      motivo: "solicitud_no_encontrada",
    };
  }

  if (
    solicitud.estado === "asignada" ||
    solicitud.estado === "cancelada" ||
    solicitud.estado === "completada"
  ) {
    return {
      lanzada: false,
      motivo: "solicitud_cerrada",
    };
  }

  const ofertaPendiente = solicitud.ofertas.some(
    (oferta) => oferta.estado === "pendiente"
  );

  if (ofertaPendiente) {
    return {
      lanzada: false,
      motivo: "ya_hay_oferta_pendiente",
    };
  }

  const taxistasExcluidos = solicitud.ofertas.map(
    (oferta) => oferta.taxistaId
  );

  const taxista = await buscarSiguienteTaxistaDisponible(
    solicitudViajeId,
    taxistasExcluidos
  );

  if (!taxista) {
    return {
      lanzada: false,
      motivo: "sin_taxista_disponible",
    };
  }

  await prisma.solicitudViaje.update({
    where: {
      id: solicitudViajeId,
    },
    data: {
      estado: "ofertada",
    },
  });

  const oferta = await emitirOfertaATaxista({
    solicitud,
    taxista,
  });

  return {
    lanzada: true,
    ofertaId: oferta.id,
    taxistaId: taxista.id,
  };
}

async function esperarResultadoSolicitudRetell(
  solicitudViajeId,
  timeoutMs = TIEMPO_MAXIMO_BUSQUEDA_RETELL_MS
) {
  const fechaLimite = Date.now() + timeoutMs;
  let ultimoReintento = 0;

  while (Date.now() < fechaLimite) {
    const ofertaAceptada =
      await obtenerOfertaAceptada(solicitudViajeId);

    if (ofertaAceptada) {
      return construirResultadoAceptado(
        solicitudViajeId,
        ofertaAceptada
      );
    }

    const solicitud = await prisma.solicitudViaje.findUnique({
      where: {
        id: solicitudViajeId,
      },
      include: {
        ofertas: {
          select: {
            id: true,
            taxistaId: true,
            estado: true,
          },
        },
      },
    });

    if (!solicitud) {
      return {
        ok: false,
        estado: "error",
        solicitudId: solicitudViajeId,
        mensajeCliente:
          "Lo lamento, no se ha podido encontrar la solicitud.",
      };
    }

    if (solicitud.estado === "asignada") {
      /*
       * Puede existir un pequeño desfase entre la actualización
       * de la solicitud y la lectura de la oferta aceptada.
       */
      await esperar(200);
      continue;
    }

    if (solicitud.estado === "cancelada") {
      return {
        ok: false,
        estado: "cancelada",
        solicitudId: solicitudViajeId,
        mensajeCliente: "La solicitud ha sido cancelada.",
      };
    }

    const hayOfertaPendiente = solicitud.ofertas.some(
      (oferta) => oferta.estado === "pendiente"
    );

    /*
     * Cuando no existe ninguna oferta pendiente, volvemos a
     * comprobar si ha aparecido un taxista disponible.
     */
    if (
      !hayOfertaPendiente &&
      Date.now() - ultimoReintento >=
      INTERVALO_REINTENTO_SIN_TAXI_MS
    ) {
      ultimoReintento = Date.now();

      const resultadoLanzamiento =
        await intentarLanzarOfertaRetell(solicitudViajeId);
    }

    await esperar(INTERVALO_COMPROBACION_RETELL_MS);
  }

  /*
   * Última comprobación para evitar perder una aceptación
   * producida justo al terminar el plazo.
   */
  const ofertaAceptadaFinal =
    await obtenerOfertaAceptada(solicitudViajeId);

  if (ofertaAceptadaFinal) {
    return construirResultadoAceptado(
      solicitudViajeId,
      ofertaAceptadaFinal
    );
  }

  const solicitudFinal =
    await prisma.solicitudViaje.findUnique({
      where: {
        id: solicitudViajeId,
      },
    });

  if (
    solicitudFinal &&
    solicitudFinal.estado !== "asignada" &&
    solicitudFinal.estado !== "cancelada" &&
    solicitudFinal.estado !== "completada"
  ) {
    await prisma.solicitudViaje.update({
      where: {
        id: solicitudViajeId,
      },
      data: {
        estado: "sin_taxista",
      },
    });
  }

  return {
    ok: false,
    estado: "sin_taxis",
    solicitudId: solicitudViajeId,
    mensajeCliente:
      "Lo lamento, no hay taxis disponibles en este momento. Llame de nuevo en unos minutos.",
  };
}

app.post(
  "/retell/functions/crear-solicitud",
  retellRawJson,
  async (req, res) => {
    try {
      if (!verificarPeticionRetell(req)) {
        return res.status(401).json({
          ok: false,
          estado: "error",
          mensajeCliente: "La petición no es válida.",
        });
      }

      const body = obtenerBodyRetell(req);
      const args = body.args || body;
      const call = body.call || {};

      /*
       * El teléfono se obtiene exclusivamente del número
       * desde el que se realiza la llamada.
       *
       * No se utiliza ningún teléfono dictado por el cliente.
       */
      const esPruebaRetell =
        call.call_type === "web_call";

      const telefonoOrigen = normalizarTelefonoCliente(
        call.from_number
      );

      const telefonoPrueba = esPruebaRetell
        ? normalizarTelefonoCliente(
          process.env.RETELL_TEST_PHONE || "649738279"
        )
        : null;

      const telefonoCliente =
        telefonoOrigen ||
        telefonoPrueba ||
        null;

      const nombreCliente =
        String(args.nombreCliente || "").trim() ||
        "Cliente teléfono";

      const direccionRecogida =
        String(args.direccion || "").trim();

      const direccionBase = String(
        args.direccionBase ||
        args.direccion ||
        ""
      ).trim();

      const referenciaRecogida =
        typeof args.referencia === "string"
          ? args.referencia.trim()
          : null;

      let latRecogida =
        args.lat !== undefined &&
          args.lat !== null &&
          args.lat !== ""
          ? Number(args.lat)
          : null;

      let lngRecogida =
        args.lng !== undefined &&
          args.lng !== null &&
          args.lng !== ""
          ? Number(args.lng)
          : null;

      if (!direccionRecogida) {
        return res.status(200).json({
          ok: false,
          estado: "error",
          mensajeCliente:
            "Falta la dirección de recogida.",
        });
      }

      if (!telefonoCliente) {
        console.error("❌ Retell no proporcionó un teléfono válido:", {
          callId: call.call_id || null,
          fromNumber: call.from_number || null,
        });

        return res.status(200).json({
          ok: false,
          estado: "error",
          mensajeCliente:
            "Lo lamento, no hemos podido identificar el número desde el que llama. Inténtelo de nuevo sin ocultar el número de teléfono.",
        });
      }

      /*
       * Si Retell no envía unas coordenadas válidas,
       * geocodificamos nuevamente la dirección.
       */
      if (
        !Number.isFinite(latRecogida) ||
        !Number.isFinite(lngRecogida)
      ) {
        const geo = await geocodificarDireccion(
          direccionBase || direccionRecogida
        );

        latRecogida =
          geo?.lat !== undefined &&
            geo?.lat !== null
            ? Number(geo.lat)
            : null;

        lngRecogida =
          geo?.lng !== undefined &&
            geo?.lng !== null
            ? Number(geo.lng)
            : null;
      }

      let paradaSugerida = null;

      if (
        Number.isFinite(latRecogida) &&
        Number.isFinite(lngRecogida)
      ) {
        paradaSugerida =
          await buscarParadaMasCercana(
            latRecogida,
            lngRecogida
          );
      }

      /*
       * Evita crear dos solicitudes si Retell repite
       * accidentalmente la llamada a la función.
       */
      const haceDosMinutos = new Date(
        Date.now() - 2 * 60 * 1000
      );

      let solicitud =
        await prisma.solicitudViaje.findFirst({
          where: {
            telefonoCliente,
            direccionRecogida,
            creadaEn: {
              gte: haceDosMinutos,
            },
            estado: {
              in: [
                "pendiente",
                "ofertada",
                "asignada",
              ],
            },
          },
          orderBy: {
            creadaEn: "desc",
          },
        });

      let duplicada = false;

      if (solicitud) {
        duplicada = true;
      } else {
        solicitud =
          await prisma.solicitudViaje.create({
            data: {
              nombreCliente,
              telefonoCliente,
              direccionRecogida,
              direccionBase:
                direccionBase || null,
              referenciaRecogida,
              latRecogida:
                Number.isFinite(latRecogida)
                  ? latRecogida
                  : null,
              lngRecogida:
                Number.isFinite(lngRecogida)
                  ? lngRecogida
                  : null,
              paradaSugeridaId:
                paradaSugerida?.id || null,
              estado: "pendiente",
              confirmadaEn: new Date(),
            },
          });
      }

      /*
       * Intentamos lanzar la primera oferta. Si ya existe
       * una oferta pendiente, la función no crea otra.
       */
      const lanzamientoInicial =
        await intentarLanzarOfertaRetell(solicitud.id);

      /*
       * Esta espera mantiene abierta la función de Retell
       * hasta recibir aceptación o llegar a 60 segundos.
       */
      const resultado =
        await esperarResultadoSolicitudRetell(
          solicitud.id,
          TIEMPO_MAXIMO_BUSQUEDA_RETELL_MS
        );

      console.log("📞 Resultado final para Retell:", resultado);

      return res.status(200).json({
        ...resultado,
        duplicada,
      });
    } catch (error) {
      console.error(
        "❌ Error creando solicitud desde Retell:",
        error
      );

      return res.status(200).json({
        ok: false,
        estado: "error",
        mensajeCliente:
          "Lo lamento, ahora mismo no podemos tramitar la solicitud. Llame de nuevo en unos minutos.",
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Función Retell: buscar_objeto_perdido
|--------------------------------------------------------------------------
|
| Modelo Prisma asumido:
|
| objetoPerdido {
|   id
|   descripcion
|   categoria
|   color
|   marca
|   modelo
|   numeroTaxi
|   origen
|   destino
|   fechaEncontrado
|   estado
|   entregadoEnCentral
| }
|
| Ajusta los nombres si tu schema.prisma utiliza otros campos.
|
*/

/**
 * Convierte expresiones habituales enviadas por Retell en un intervalo.
 *
 * Ejemplos admitidos:
 * - hoy
 * - ayer
 * - anteayer
 * - 29/07/2026
 * - 2026-07-29
 * - hace 2 días
 *
 * Si no puede interpretar la fecha, devuelve null y la búsqueda se hace
 * solo por la descripción y los demás datos.
 */
/*
|--------------------------------------------------------------------------
| Función Retell: buscar_objeto_perdido
|--------------------------------------------------------------------------
*/

function normalizarTextoObjeto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inicioDia(fecha) {
  const resultado = new Date(fecha);
  resultado.setHours(0, 0, 0, 0);
  return resultado;
}

function finDia(fecha) {
  const resultado = new Date(fecha);
  resultado.setHours(23, 59, 59, 999);
  return resultado;
}

/*
 * Convierte expresiones como:
 *
 * hoy
 * ayer
 * anteayer
 * hace 2 días
 * 29/07/2026
 * 2026-07-29
 */
function interpretarFechaObjetoPerdido(valor) {
  const texto = normalizarTextoObjeto(valor);

  if (!texto) {
    return null;
  }

  const ahora = new Date();
  let fecha = null;

  if (
    texto === "hoy" ||
    texto.includes("esta manana") ||
    texto.includes("esta tarde") ||
    texto.includes("esta noche")
  ) {
    fecha = new Date(ahora);
  } else if (
    texto === "ayer" ||
    texto.includes("ayer por la manana") ||
    texto.includes("ayer por la tarde") ||
    texto.includes("anoche")
  ) {
    fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() - 1);
  } else if (texto === "anteayer") {
    fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() - 2);
  } else {
    const coincidenciaDias = texto.match(/hace\s+(\d+)\s+dias?/);

    if (coincidenciaDias) {
      fecha = new Date(ahora);
      fecha.setDate(
        fecha.getDate() - Number(coincidenciaDias[1])
      );
    }
  }

  if (!fecha) {
    const formatoEspanol = texto.match(
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
    );

    if (formatoEspanol) {
      const [, dia, mes, anio] = formatoEspanol;

      fecha = new Date(
        Number(anio),
        Number(mes) - 1,
        Number(dia)
      );
    }
  }

  if (!fecha) {
    const formatoIso = texto.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

    if (formatoIso) {
      const [, anio, mes, dia] = formatoIso;

      fecha = new Date(
        Number(anio),
        Number(mes) - 1,
        Number(dia)
      );
    }
  }

  const meses = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };

  if (!fecha) {
    const nombreMes = Object.keys(meses).find(
      (mes) => texto === mes || texto.includes(mes)
    );

    if (nombreMes) {
      const anioEncontrado = texto.match(/\b(20\d{2})\b/);

      /*
       * Si el cliente no dice el año, usamos el año actual.
       * Si ese mes todavía no ha ocurrido este año, usamos el anterior.
       */
      let anio = anioEncontrado
        ? Number(anioEncontrado[1])
        : ahora.getFullYear();

      const numeroMes = meses[nombreMes];

      if (
        !anioEncontrado &&
        numeroMes > ahora.getMonth()
      ) {
        anio -= 1;
      }

      const desde = new Date(anio, numeroMes, 1, 0, 0, 0, 0);
      const hasta = new Date(
        anio,
        numeroMes + 1,
        0,
        23,
        59,
        59,
        999
      );

      return {
        desde,
        hasta,
      };
    }
  }

  if (!fecha || Number.isNaN(fecha.getTime())) {
    return null;
  }

  /*
   * Permitimos un margen de un día antes y después.
   */
  const desde = inicioDia(fecha);
  desde.setDate(desde.getDate() - 1);

  const hasta = finDia(fecha);
  hasta.setDate(hasta.getDate() + 1);

  return {
    desde,
    hasta,
  };
}

function obtenerPalabrasObjeto(...valores) {
  return [
    ...new Set(
      valores
        .map(normalizarTextoObjeto)
        .filter(Boolean)
        .flatMap((valor) => valor.split(" "))
        .filter((palabra) => palabra.length >= 3)
    ),
  ].slice(0, 15);
}

function calcularPuntuacionObjeto(objeto, palabras) {
  const descripcion = normalizarTextoObjeto(
    objeto.descripcion
  );

  const observaciones = normalizarTextoObjeto(
    objeto.observaciones
  );

  let puntuacion = 0;

  for (const palabra of palabras) {
    if (descripcion.includes(palabra)) {
      puntuacion += 3;
    }

    if (observaciones.includes(palabra)) {
      puntuacion += 1;
    }
  }

  return puntuacion;
}

app.post(
  "/retell/functions/buscar-objeto-perdido",
  retellRawJson,
  async (req, res) => {
    try {
      if (!verificarPeticionRetell(req)) {
        return res.status(401).json({
          ok: false,
          encontrado: false,
          estado: "error",
          mensajeCliente: "La petición no es válida.",
        });
      }

      const body = obtenerBodyRetell(req);
      const args = body.args || body;

      const descripcion = String(
        args.descripcion || ""
      ).trim();

      const fechaAproximada = String(
        args.fechaAproximada ||
        args.fecha ||
        ""
      ).trim();

      /*
       * Tu tabla no tiene campos separados para color, marca,
       * modelo, origen o destino. Los juntamos para buscarlos
       * dentro de descripcion y observaciones.
       */
      const datosAdicionales = [
        args.categoria,
        args.color,
        args.marca,
        args.modelo,
        args.origen,
        args.destino,
        args.horaAproximada,
        args.detalles,
      ]
        .map((valor) => String(valor || "").trim())
        .filter(Boolean)
        .join(" ");

      if (!descripcion) {
        return res.status(200).json({
          ok: false,
          encontrado: false,
          estado: "datos_insuficientes",
          datoFaltante: "descripcion",
          pregunta: "¿Qué objeto ha perdido?",
          mensajeCliente:
            "Necesito una descripción del objeto para poder buscarlo.",
        });
      }

      if (!fechaAproximada) {
        return res.status(200).json({
          ok: false,
          encontrado: false,
          estado: "datos_insuficientes",
          datoFaltante: "fechaAproximada",
          pregunta:
            "¿Qué día aproximadamente perdió el objeto?",
          mensajeCliente:
            "Necesito saber aproximadamente cuándo perdió el objeto.",
        });
      }

      const palabras = obtenerPalabrasObjeto(
        descripcion,
        datosAdicionales
      );

      if (palabras.length === 0) {
        return res.status(200).json({
          ok: false,
          encontrado: false,
          estado: "datos_insuficientes",
          datoFaltante: "descripcion",
          pregunta:
            "¿Puede describirme el objeto un poco mejor?",
          mensajeCliente:
            "Necesito una descripción más concreta del objeto.",
        });
      }

      const intervaloFecha =
        interpretarFechaObjetoPerdido(fechaAproximada);

      const filtrosAnd = [];

      /*
       * Buscamos cada palabra tanto en descripción como
       * en observaciones.
       */
      filtrosAnd.push({
        OR: palabras.flatMap((palabra) => [
          {
            descripcion: {
              contains: palabra,
              mode: "insensitive",
            },
          },
          {
            observaciones: {
              contains: palabra,
              mode: "insensitive",
            },
          },
        ]),
      });

      if (intervaloFecha) {
        filtrosAnd.push({
          fechaHallazgo: {
            gte: intervaloFecha.desde,
            lte: intervaloFecha.hasta,
          },
        });
      }

      filtrosAnd.push({
        estado: "pendiente",
      });

      const objetos = await prisma.objetoPerdido.findMany({
        where: {
          AND: filtrosAnd,
        },
        select: {
          id: true,
          descripcion: true,
          observaciones: true,
          estado: true,
          fechaHallazgo: true,
          creadoEn: true,
          taxistaId: true,
        },
        orderBy: {
          fechaHallazgo: "desc",
        },
        take: 20,
      });

      /*
       * Calculamos una puntuación para que una coincidencia
       * completa tenga prioridad sobre coincidencias débiles.
       */
      const objetosPuntuados = objetos
        .map((objeto) => ({
          objeto,
          puntuacion: calcularPuntuacionObjeto(
            objeto,
            palabras
          ),
        }))
        .filter((resultado) => resultado.puntuacion > 0)
        .sort((a, b) => {
          if (b.puntuacion !== a.puntuacion) {
            return b.puntuacion - a.puntuacion;
          }

          return (
            new Date(b.objeto.fechaHallazgo).getTime() -
            new Date(a.objeto.fechaHallazgo).getTime()
          );
        });

      if (objetosPuntuados.length === 0) {
        return res.status(200).json({
          ok: true,
          encontrado: false,
          estado: "no_encontrado",
          mensajeCliente:
            "Por el momento no aparece registrado ningún objeto que coincida con esa descripción. Es posible que todavía no haya sido entregado en la central. Puede volver a llamar más adelante.",
        });
      }

      const mejorPuntuacion =
        objetosPuntuados[0].puntuacion;

      /*
       * Solo consideramos posibles coincidencias las que tienen
       * la misma puntuación que el mejor resultado.
       */
      const mejoresCoincidencias = objetosPuntuados.filter(
        (resultado) =>
          resultado.puntuacion === mejorPuntuacion
      );

      if (mejoresCoincidencias.length > 1) {
        return res.status(200).json({
          ok: true,
          encontrado: false,
          estado: "varias_coincidencias",
          numeroCoincidencias:
            mejoresCoincidencias.length,
          pregunta:
            "Tenemos varios objetos parecidos. ¿Puede indicar alguna característica distintiva más, como el color, la marca o el contenido?",
          mensajeCliente:
            "Tenemos varios objetos parecidos y necesito algún detalle adicional para comprobar cuál podría ser el suyo.",
        });
      }

      const coincidencia =
        mejoresCoincidencias[0].objeto;

      /*
       * No enviamos descripción ni observaciones a Retell.
       * Así el agente no revela detalles que podrían permitir
       * reclamar un objeto ajeno.
       */
      return res.status(200).json({
        ok: true,
        encontrado: true,
        estado: "encontrado",

        objetoId: coincidencia.id,

        mensajeCliente:
          "Tenemos registrado un objeto que podría coincidir con la descripción. Puede pasar por la central de Taxi Ceuta para comprobarlo y recogerlo. Cuando venga, deberá indicar alguna característica que permita identificar el objeto.",

        recogida: {
          direccionCentral:
            process.env.DIRECCION_CENTRAL_TAXI || null,

          horarioCentral:
            process.env.HORARIO_CENTRAL_TAXI || null,
        },
      });
    } catch (error) {
      console.error(
        "❌ Error buscando objeto perdido desde Retell:",
        error
      );

      return res.status(200).json({
        ok: false,
        encontrado: false,
        estado: "error",
        mensajeCliente:
          "Lo lamento, ahora mismo no puedo consultar los objetos perdidos. Puede volver a llamar más adelante o ponerse en contacto con la central.",
      });
    }
  }
);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/mobile", mobileRoutes);
app.use("/cliente", clienteRoutes);


const server = http.createServer(app);
const llamadas = new Map();

app.get("/", (req, res) => {
  res.send("Servidor taxi-ai funcionando");
});

app.get("/taxistas", async (req, res) => {
  try {
    const taxistas = await prisma.taxista.findMany({
      include: {
        vehiculo: true,
      },
      orderBy: {
        creadoEn: "asc",
      },
    });

    res.json(taxistas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const { buscarSiguienteTaxistaDisponible, emitirOfertaATaxista } = require("./services/ofertasServiceSoloTwilio");

app.get("/vehiculos", async (req, res) => {
  try {
    const vehiculos = await prisma.vehiculo.findMany({
      include: {
        taxista: true,
      },
      orderBy: {
        creadoEn: "asc",
      },
    });

    res.json(vehiculos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

iniciarSocket(server);

module.exports = {
  app,
  server,
  port,
};
