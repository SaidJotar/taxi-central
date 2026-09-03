const express = require("express");
const prisma = require("../services/bd");
const { buscarParadaMasCercana } = require("../services/paradasService");
const {
    buscarSiguienteTaxistaDisponible,
    emitirOfertaATaxista,
} = require("../services/ofertasServiceSoloTwilio");
const { distanciaMetros } = require("../services/geoUtils");

const {
    calcularRutaTaxiCliente,
} = require(
    "../services/routesService"
);

/*
 * =====================================================
 * CACHE ETA GOOGLE ROUTES
 * =====================================================
 *
 * No queremos llamar a Google cada vez que
 * ride.js consulta /cliente/estado.
 *
 * Solo recalcularemos cuando:
 *
 * - hayan pasado 90 segundos
 * - Y el taxi se haya movido al menos 100 metros
 */

const etaRoutesCache =
    new Map();


const ETA_ROUTES_MIN_INTERVAL_MS =
    90 * 1000;


const ETA_ROUTES_MOVIMIENTO_MIN_METROS =
    100;


function obtenerCacheRuta(
    solicitudId
) {

    return (
        etaRoutesCache.get(
            solicitudId
        ) ||
        null
    );

}


function guardarCacheRuta(
    solicitudId,
    datos
) {

    etaRoutesCache.set(
        solicitudId,
        {

            ...datos,

            calculadoEn:
                Date.now(),

        }
    );

}

const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const router = express.Router();

const {
    calcularPrecioReserva,
    validarAntelacionReserva,
} = require("../services/reservasService");

router.post("/solicitar", async (req, res) => {
    try {
        const {
            nombreCliente,
            telefonoCliente,
            lat,
            lng,
            direccionRecogida,
            direccionBase = null,
            referenciaRecogida = null,
        } = req.body || {};

        if (typeof lat !== "number" || typeof lng !== "number") {
            return res.status(400).json({
                ok: false,
                error: "Latitud y longitud son obligatorias",
            });
        }

        if (!direccionRecogida || !direccionRecogida.trim()) {
            return res.status(400).json({
                ok: false,
                error: "La dirección de recogida es obligatoria",
            });
        }

        let paradaSugerida = null;

        try {
            paradaSugerida = await buscarParadaMasCercana(lat, lng);
            console.log("🅿️ parada sugerida cliente:", paradaSugerida?.id || null);
        } catch (e) {
            console.error("Error buscando parada sugerida:", e.message);
        }

        const solicitud = await prisma.solicitudViaje.create({
            data: {
                nombreCliente: nombreCliente?.trim() || "Centralita",
                telefonoCliente: telefonoCliente?.trim() || "App cliente",
                direccionRecogida: direccionRecogida.trim(),
                direccionBase: direccionBase?.trim() || direccionRecogida.trim(),
                referenciaRecogida: referenciaRecogida?.trim() || null,
                latRecogida: lat,
                lngRecogida: lng,
                paradaSugeridaId: paradaSugerida?.id ?? null,
                estado: "pendiente",
                origen: "app_cliente",
                confirmadaEn: new Date(),
            },
        });

        const taxista = await buscarSiguienteTaxistaDisponible(solicitud.id);

        if (!taxista) {
            return res.json({
                ok: true,
                solicitudId: solicitud.id,
                estado: "pendiente",
                message: "Solicitud creada. Buscando taxi.",
            });
        }

        await prisma.solicitudViaje.update({
            where: { id: solicitud.id },
            data: { estado: "ofertada" },
        });

        const oferta = await emitirOfertaATaxista({
            solicitud,
            taxista,
        });

        return res.json({
            ok: true,
            solicitudId: solicitud.id,
            ofertaId: oferta?.id || null,
            taxistaId: taxista.id,
            paradaSugeridaId: paradaSugerida?.id ?? null,
            estado: "ofertada",
            message: "Solicitud creada. Oferta enviada a un taxista.",
        });
    } catch (error) {
        console.error("Error POST /cliente/solicitar:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo crear la solicitud",
            detalle: error.message,
        });
    }
});

async function obtenerValoracionTaxista(
    taxistaId
) {

    if (!taxistaId) {

        return {
            media: null,
            total: 0,
        };

    }


    const resultado =
        await prisma.solicitudViaje.aggregate({

            where: {

                estado:
                    "completada",

                ratingCliente: {
                    not: null,
                },

                asignacion: {
                    is: {
                        taxistaId:
                            taxistaId,
                    },
                },

            },

            _avg: {
                ratingCliente: true,
            },

            _count: {
                ratingCliente: true,
            },

        });


    const mediaRaw =
        resultado?._avg?.ratingCliente;


    const total =
        resultado?._count?.ratingCliente || 0;


    return {

        media:
            typeof mediaRaw === "number"
                ? Math.round(
                    mediaRaw * 10
                ) / 10
                : null,

        total,

    };

}

router.get("/estado/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const solicitud = await prisma.solicitudViaje.findUnique({
            where: { id },
            include: {
                asignacion: {
                    include: {
                        taxista: {
                            include: {
                                vehiculo: true,
                            },
                        },
                        vehiculo: true,
                    },
                },
            },
        });

        if (!solicitud) {
            return res.status(404).json({
                ok: false,
                error: "Solicitud no encontrada",
            });
        }

        const taxista = solicitud.asignacion?.taxista || null;
        const vehiculo = solicitud.asignacion?.vehiculo || taxista?.vehiculo || null;

        let valoracionMedia = null;
        let numeroValoraciones = 0;

        if (taxista?.id) {

            const valoracion =
                await prisma.solicitudViaje.aggregate({

                    where: {

                        estado: "completada",

                        ratingCliente: {
                            not: null,
                        },

                        asignacion: {
                            is: {
                                taxistaId: taxista.id,
                            },
                        },

                    },

                    _avg: {
                        ratingCliente: true,
                    },

                    _count: {
                        ratingCliente: true,
                    },

                });


            if (
                typeof valoracion?._avg?.ratingCliente ===
                "number"
            ) {

                valoracionMedia =
                    Math.round(
                        valoracion._avg.ratingCliente * 10
                    ) / 10;

            }


            numeroValoraciones =
                valoracion?._count?.ratingCliente || 0;
        }

        let distanciaTaxiMetros =
    null;

let etaMinutos =
    null;

let etaFuente =
    null;

let rutaPolyline =
    null;


if (
    taxista &&
    solicitud.latRecogida != null &&
    solicitud.lngRecogida != null &&
    taxista.lat != null &&
    taxista.lng != null
) {

    /*
     * =================================================
     * DATOS ACTUALES
     * =================================================
     */

    const taxiLat =
        Number(
            taxista.lat
        );

    const taxiLng =
        Number(
            taxista.lng
        );


    const clienteLat =
        Number(
            solicitud.latRecogida
        );

    const clienteLng =
        Number(
            solicitud.lngRecogida
        );


    /*
     * =================================================
     * CACHE
     * =================================================
     */

    const cache =
        obtenerCacheRuta(
            solicitud.id
        );


    let usarGoogle =
        false;


    if (!cache) {

        /*
         * Primera vez:
         * calculamos inmediatamente.
         */
        usarGoogle =
            true;

    } else {

        const tiempoDesdeUltimaRuta =
            Date.now() -
            cache.calculadoEn;


        const movimientoDesdeUltimaRuta =
            distanciaMetros(
                cache.taxiLat,
                cache.taxiLng,
                taxiLat,
                taxiLng
            );


        /*
         * Solo consultamos Google si:
         *
         * 1. han pasado 90 segundos
         * 2. el coche avanzó ≥ 100 metros
         */
        if (
            tiempoDesdeUltimaRuta >=
                ETA_ROUTES_MIN_INTERVAL_MS &&
            movimientoDesdeUltimaRuta >=
                ETA_ROUTES_MOVIMIENTO_MIN_METROS
        ) {

            usarGoogle =
                true;

        }

    }


    /*
     * =================================================
     * GOOGLE ROUTES
     * =================================================
     */

    if (usarGoogle) {

        try {

            const ruta =
                await calcularRutaTaxiCliente({

                    origenLat:
                        taxiLat,

                    origenLng:
                        taxiLng,

                    destinoLat:
                        clienteLat,

                    destinoLng:
                        clienteLng,

                });


            guardarCacheRuta(
                solicitud.id,
                {

                    taxiLat,

                    taxiLng,


                    distanciaMetros:
                        ruta.distanciaMetros,


                    etaMinutos:
                        ruta.etaMinutos,


                    polyline:
                        ruta.polyline,


                    fuente:
                        ruta.fuente,

                }
            );


            distanciaTaxiMetros =
                ruta.distanciaMetros;


            etaMinutos =
                ruta.etaMinutos;


            etaFuente =
                ruta.fuente;


            rutaPolyline =
                ruta.polyline;


            console.log(
                "🛣️ ETA Google Routes:",
                {
                    solicitudId:
                        solicitud.id,

                    distanciaMetros:
                        distanciaTaxiMetros,

                    etaMinutos,

                }
            );


        } catch (error) {

            console.log(
                "⚠️ Google Routes no disponible:",
                error.message
            );

        }

    }


    /*
     * =================================================
     * CACHE EXISTENTE
     * =================================================
     */

    if (
        etaMinutos == null
    ) {

        const cacheActual =
            obtenerCacheRuta(
                solicitud.id
            );


        if (cacheActual) {

            distanciaTaxiMetros =
                cacheActual
                    .distanciaMetros;


            etaMinutos =
                cacheActual
                    .etaMinutos;


            etaFuente =
                cacheActual
                    .fuente;


            rutaPolyline =
                cacheActual
                    .polyline;

        }

    }


    /*
     * =================================================
     * FALLBACK TOTALMENTE LOCAL
     * =================================================
     *
     * Si:
     *
     * - Routes está caído
     * - la cuota se agotó
     * - la key falla
     *
     * seguimos usando exactamente
     * tu sistema anterior.
     */

    if (
        etaMinutos == null
    ) {

        distanciaTaxiMetros =
            Math.round(
                distanciaMetros(
                    clienteLat,
                    clienteLng,
                    taxiLat,
                    taxiLng
                )
            );


        etaMinutos =
            Math.max(
                1,
                Math.ceil(
                    distanciaTaxiMetros /
                    350
                )
            );


        etaFuente =
            "aproximado_local";


        rutaPolyline =
            null;

    }

}

       
        return res.json({
            ok: true,
            solicitud: {
                id: solicitud.id,
                estado: solicitud.estado,
                nombreCliente: solicitud.nombreCliente,
                telefonoCliente: solicitud.telefonoCliente,
                direccionRecogida: solicitud.direccionRecogida,
                direccionBase: solicitud.direccionBase || null,
                referenciaRecogida: solicitud.referenciaRecogida || null,
                latRecogida: solicitud.latRecogida,
                lngRecogida: solicitud.lngRecogida,
                etaMinutos,
                distanciaTaxiMetros,
                etaFuente,
                rutaPolyline:
                etaMinutos != null &&
                    etaMinutos <= 3
                    ? rutaPolyline
                    : null,
                taxista: taxista
                    ? {
                        id: taxista.id,

                        nombreCompleto:
                            taxista.nombreCompleto,

                        telefono:
                            taxista.telefono,

                        numeroTaxi:
                            vehiculo?.numeroTaxi || null,

                        matricula:
                            vehiculo?.matricula || null,

                        marca:
                            vehiculo?.marca || null,

                        modelo:
                            vehiculo?.modelo || null,

                        lat:
                            taxista.lat ?? null,

                        lng:
                            taxista.lng ?? null,

                        ubicacionActualizadaEn:
                            taxista.ubicacionActualizadaEn ?? null,

                        valoracionMedia,

                        numeroValoraciones,
                    }
                    : null,
            },
        });
    } catch (error) {
        console.error("Error GET /cliente/estado/:id:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo consultar el estado",
            detalle: error.message,
        });
    }
});

router.post("/cancelar/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const solicitud = await prisma.solicitudViaje.findUnique({
            where: { id },
            include: {
                ofertas: {
                    where: {
                        estado: "pendiente",
                    },
                },
            },
        });

        if (!solicitud) {
            return res.status(404).json({
                ok: false,
                error: "Solicitud no encontrada",
            });
        }

        if (
            solicitud.estado === "asignada" ||
            solicitud.estado === "completada" ||
            solicitud.estado === "cancelada"
        ) {
            return res.status(400).json({
                ok: false,
                error: "La solicitud ya no se puede cancelar",
            });
        }

        await prisma.solicitudViaje.update({
            where: { id },
            data: {
                estado: "cancelada",
            },
        });

        if (solicitud.ofertas.length) {
            const { obtenerIo } = require("../socketSoloTwilio");
            const io = obtenerIo();

            for (const oferta of solicitud.ofertas) {
                io.to(`taxista:${oferta.taxistaId}`).emit("oferta:cancelada", {
                    ok: true,
                    ofertaId: oferta.id,
                    solicitudId: id,
                });
            }

            await prisma.ofertaSolicitud.updateMany({
                where: {
                    solicitudViajeId: id,
                    estado: "pendiente",
                },
                data: {
                    estado: "expirada",
                    respondidaEn: new Date(),
                },
            });
        }

        return res.json({
            ok: true,
            estado: "cancelada",
        });
    } catch (error) {
        console.error("Error POST /cliente/cancelar/:id:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo cancelar la solicitud",
            detalle: error.message,
        });
    }
});

router.get("/mensajes/:solicitudId", async (req, res) => {
    try {
        const { solicitudId } = req.params;

        const mensajes = await prisma.mensajeSolicitud.findMany({
            where: {
                solicitudViajeId: solicitudId,
            },
            orderBy: {
                creadoEn: "asc",
            },
        });

        return res.json({
            ok: true,
            mensajes,
        });
    } catch (error) {
        console.error("Error GET /cliente/mensajes/:solicitudId:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudieron cargar los mensajes",
        });
    }
});

router.post("/mensajes/:solicitudId", async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const { texto } = req.body || {};

        if (!texto || !texto.trim()) {
            return res.status(400).json({
                ok: false,
                error: "Texto obligatorio",
            });
        }

        const solicitud = await prisma.solicitudViaje.findUnique({
            where: { id: solicitudId },
            include: {
                asignacion: {
                    include: {
                        taxista: true,
                    },
                },
            },
        });

        if (!solicitud || !solicitud.asignacion?.taxistaId) {
            return res.status(404).json({
                ok: false,
                error: "Servicio no encontrado",
            });
        }

        const mensaje = await prisma.mensajeSolicitud.create({
            data: {
                solicitudViajeId: solicitudId,
                emisorTipo: "cliente",
                texto: texto.trim(),
            },
        });

        const { obtenerIo } = require("../socketSoloTwilio");
        const io = obtenerIo();

        io.to(`taxista:${solicitud.asignacion.taxistaId}`).emit("chat:nuevo_mensaje", {
            ok: true,
            solicitudId,
            mensaje,
        });

        return res.json({
            ok: true,
            mensaje,
        });
    } catch (error) {
        console.error("Error POST /cliente/mensajes/:solicitudId:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo enviar el mensaje",
        });
    }
});

router.post("/valorar/:solicitudId", async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const { rating, comentario } = req.body || {};

        const puntuacion = Number(rating);

        if (!Number.isInteger(puntuacion) || puntuacion < 1 || puntuacion > 5) {
            return res.status(400).json({
                ok: false,
                error: "Valoración inválida",
            });
        }

        const solicitud = await prisma.solicitudViaje.findUnique({
            where: { id: solicitudId },
        });

        if (!solicitud || solicitud.estado !== "completada") {
            return res.status(400).json({
                ok: false,
                error: "Solo se puede valorar un servicio completado",
            });
        }

        const actualizada = await prisma.solicitudViaje.update({
            where: { id: solicitudId },
            data: {
                ratingCliente: puntuacion,
                comentarioRating: comentario?.trim() || null,
            },
        });

        return res.json({
            ok: true,
            solicitud: actualizada,
        });
    } catch (error) {
        console.error("Error POST /cliente/valorar/:solicitudId:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo guardar la valoración",
        });
    }
});

/*
|--------------------------------------------------------------------------
| RESERVAS TAXI - CALCULAR PRECIO
|--------------------------------------------------------------------------
*/

router.post(
    "/reservas/calcular",
    async (req, res) => {
        try {
            const {
                fechaHora,
                tipo = "normal",
            } = req.body || {};

            if (!fechaHora) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Debes indicar la fecha y hora de la reserva.",
                });
            }

            /*
             * Las especiales no tienen
             * precio automático.
             */
            if (tipo === "especial") {
                validarAntelacionReserva(
                    fechaHora
                );

                return res.json({
                    ok: true,
                    tipo: "especial",
                    precioFinal: null,
                    precioAConvenir: true,
                    mensaje:
                        "El precio de esta reserva se acordará previamente.",
                });
            }

            const resultado =
                calcularPrecioReserva(
                    fechaHora
                );

            return res.json({
                ok: true,

                tipo: "normal",

                precioFinal:
                    resultado.precioFinal,

                tipoTarifa:
                    resultado.tipoTarifa,

                precioAConvenir:
                    false,

                incluyeEquipaje:
                    true,

                incluyeEspera:
                    true,

                mensaje:
                    `Precio final: ${resultado.precioFinal} €. Equipaje y tiempo de espera incluidos.`,
            });

        } catch (error) {
            return res.status(400).json({
                ok: false,
                error:
                    error.message ||
                    "No se pudo calcular la reserva.",
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| RESERVAS TAXI - CREAR
|--------------------------------------------------------------------------
*/

router.post(
    "/reservas",
    async (req, res) => {
        try {
            const {
                tipo = "normal",
                tipoEspecial = null,

                telefonoCliente,

                lat,
                lng,

                direccionRecogida,
                direccionBase = null,
                referenciaRecogida = null,

                fechaHora,

                detallesEspeciales = null,
            } = req.body || {};


            if (
                !telefonoCliente ||
                !String(
                    telefonoCliente
                ).trim()
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "El teléfono del cliente es obligatorio.",
                });
            }


            if (!fechaHora) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Debes indicar fecha y hora.",
                });
            }


            if (
                !direccionRecogida ||
                !String(
                    direccionRecogida
                ).trim()
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "La dirección de recogida es obligatoria.",
                });
            }


            /*
             * =====================================================
             * RESERVA NORMAL
             * =====================================================
             */
            if (tipo === "normal") {

                if (
                    typeof lat !== "number" ||
                    typeof lng !== "number"
                ) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            "La ubicación de recogida es obligatoria.",
                    });
                }


                /*
                 * El backend vuelve a calcular
                 * el precio.
                 *
                 * Nunca confiamos en un precio
                 * enviado desde la app.
                 */
                const calculo =
                    calcularPrecioReserva(
                        fechaHora
                    );


                const reserva =
                    await prisma.reservaTaxi.create({
                        data: {
                            tipo:
                                "normal",

                            telefonoCliente:
                                String(
                                    telefonoCliente
                                ).trim(),

                            latRecogida:
                                lat,

                            lngRecogida:
                                lng,

                            direccionRecogida:
                                String(
                                    direccionRecogida
                                ).trim(),

                            direccionBase:
                                direccionBase
                                    ? String(
                                        direccionBase
                                    ).trim()
                                    : null,

                            referenciaRecogida:
                                referenciaRecogida
                                    ? String(
                                        referenciaRecogida
                                    ).trim()
                                    : null,

                            fechaHora:
                                calculo.fechaHora,

                            precioFinal:
                                calculo.precioFinal,

                            precioAConvenir:
                                false,

                            estado:
                                "pendiente",
                        },
                    });


                /*
                 * Avisamos en tiempo real
                 * a las apps taxistas.
                 *
                 * La BD sigue siendo la
                 * fuente de verdad.
                 */
                try {
                    const {
                        obtenerIo,
                    } =
                        require("../socketSoloTwilio");

                    const io =
                        obtenerIo();

                    io.emit(
                        "reserva:nueva",
                        {
                            reservaId:
                                reserva.id,

                            fechaHora:
                                reserva.fechaHora,

                            precioFinal:
                                reserva.precioFinal,
                        }
                    );

                } catch (socketError) {
                    console.log(
                        "Aviso reserva:nueva no enviado:",
                        socketError.message
                    );
                }


                return res.status(201).json({
                    ok: true,

                    reserva: {
                        id:
                            reserva.id,

                        tipo:
                            reserva.tipo,

                        estado:
                            reserva.estado,

                        telefonoCliente:
                            reserva.telefonoCliente,

                        fechaHora:
                            reserva.fechaHora,

                        direccionRecogida:
                            reserva.direccionRecogida,

                        direccionBase:
                            reserva.direccionBase,

                        referenciaRecogida:
                            reserva.referenciaRecogida,

                        latRecogida:
                            reserva.latRecogida,

                        lngRecogida:
                            reserva.lngRecogida,

                        precioFinal:
                            reserva.precioFinal,

                        precioAConvenir:
                            reserva.precioAConvenir,
                    },
                });
            }


            /*
             * =====================================================
             * RESERVA ESPECIAL
             * =====================================================
             */

            if (tipo === "especial") {

                validarAntelacionReserva(
                    fechaHora
                );


                const tiposPermitidos = [
                    "aeropuerto_tanger",
                    "aeropuerto_tetuan",
                    "boda_evento",
                    "otro",
                ];


                if (
                    !tiposPermitidos.includes(
                        tipoEspecial
                    )
                ) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            "Tipo de reserva especial no válido.",
                    });
                }


                const reserva =
                    await prisma.reservaTaxi.create({
                        data: {
                            tipo:
                                "especial",

                            tipoEspecial,

                            telefonoCliente:
                                String(
                                    telefonoCliente
                                ).trim(),

                            latRecogida:
                                typeof lat === "number"
                                    ? lat
                                    : null,

                            lngRecogida:
                                typeof lng === "number"
                                    ? lng
                                    : null,

                            direccionRecogida:
                                String(
                                    direccionRecogida
                                ).trim(),

                            direccionBase:
                                direccionBase
                                    ? String(
                                        direccionBase
                                    ).trim()
                                    : null,

                            referenciaRecogida:
                                referenciaRecogida
                                    ? String(
                                        referenciaRecogida
                                    ).trim()
                                    : null,

                            fechaHora:
                                new Date(
                                    fechaHora
                                ),

                            precioFinal:
                                null,

                            precioAConvenir:
                                true,

                            detallesEspeciales:
                                detallesEspeciales
                                    ? String(
                                        detallesEspeciales
                                    ).trim()
                                    : null,

                            estado:
                                "pendiente",
                        },
                    });


                return res.status(201).json({
                    ok: true,
                    reserva,
                    mensaje:
                        "Solicitud especial registrada. El precio está pendiente de acordar.",
                });
            }


            return res.status(400).json({
                ok: false,
                error:
                    "Tipo de reserva no válido.",
            });

        } catch (error) {
            console.error(
                "Error POST /cliente/reservas:",
                error
            );

            return res.status(400).json({
                ok: false,
                error:
                    error.message ||
                    "No se pudo crear la reserva.",
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| RESERVAS TAXI - RESERVAS DEL CLIENTE
|--------------------------------------------------------------------------
*/

router.get(
    "/reservas",
    async (req, res) => {
        try {
            const telefono =
                String(
                    req.query.telefono ||
                    ""
                ).trim();


            if (!telefono) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Debes indicar el teléfono.",
                });
            }


            const reservas =
                await prisma.reservaTaxi.findMany({
                    where: {

                        telefonoCliente:
                            telefono,

                        estado: {
                            not:
                                "cancelada",
                        },

                    },

                    include: {

                        taxista: {
                            include: {
                                vehiculo: true,
                            },
                        },

                    },

                    orderBy: {
                        fechaHora:
                            "asc",
                    },
                });


            return res.json({
                ok: true,
                reservas,
            });

        } catch (error) {
            console.error(
                "Error GET /cliente/reservas:",
                error
            );

            return res.status(500).json({
                ok: false,
                error:
                    "No se pudieron consultar las reservas.",
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| DIRECCIONES - AUTOCOMPLETE PLACES API (NEW)
|--------------------------------------------------------------------------
|
| - Places API (New)
| - Mínimo 5 caracteres
| - Máximo 5 resultados
| - Prioridad a Ceuta
| - Sin Places Legacy
|
*/

router.get(
    "/direcciones/autocomplete",
    async (req, res) => {

        try {

            const texto =
                String(
                    req.query.texto || ""
                ).trim();


            /*
             * =====================================================
             * MÍNIMO 5 CARACTERES
             * =====================================================
             */

            if (
                texto.length < 5
            ) {

                return res.json({
                    ok: true,
                    resultados: [],
                });

            }


            /*
             * =====================================================
             * API KEY
             * =====================================================
             */

            const apiKey =
                process.env.GOOGLE_MAPS_API_KEY;


            if (!apiKey) {

                return res.status(500).json({
                    ok: false,
                    error:
                        "Google Maps no está configurado.",
                });

            }


            /*
             * =====================================================
             * PETICIÓN PLACES API (NEW)
             * =====================================================
             */

            const body = {

                input:
                    texto,

                languageCode:
                    "es",

                regionCode:
                    "ES",


                /*
                 * Limitamos el país.
                 */
                includedRegionCodes: [
                    "es",
                ],


                /*
                 * Priorizamos resultados cercanos
                 * al centro de Ceuta.
                 *
                 * No es una frontera dura.
                 * La comprobación definitiva se
                 * hace en Place Details.
                 */
                locationBias: {

                    circle: {

                        center: {

                            latitude:
                                35.8894,

                            longitude:
                                -5.3213,

                        },

                        radius:
                            15000,

                    },

                },

            };


            const response =
                await fetch(
                    "https://places.googleapis.com/v1/places:autocomplete",
                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json",

                            "X-Goog-Api-Key":
                                apiKey,

                        },

                        body:
                            JSON.stringify(
                                body
                            ),

                    }
                );


            const data =
                await response.json();


            /*
             * =====================================================
             * ERROR GOOGLE
             * =====================================================
             */

            if (!response.ok) {

                console.error(
                    "❌ Places Autocomplete New:",
                    data
                );


                return res.status(502).json({
                    ok: false,
                    error:
                        "No se pudieron buscar direcciones.",
                });

            }


            /*
             * =====================================================
             * NORMALIZAMOS RESULTADOS
             * =====================================================
             */

            const resultados =
                (data.suggestions || [])

                    .map(
                        (item) => {

                            const prediccion =
                                item.placePrediction;


                            if (
                                !prediccion?.placeId
                            ) {

                                return null;

                            }


                            const descripcion =
                                prediccion.text?.text ||
                                "";


                            return {

                                placeId:
                                    prediccion.placeId,


                                /*
                                 * Conservamos "descripcion"
                                 * para que index.js siga siendo
                                 * compatible.
                                 */
                                descripcion,


                                texto:
                                    descripcion,


                                principal:
                                    prediccion
                                        .structuredFormat
                                        ?.mainText
                                        ?.text ||
                                    descripcion,


                                secundaria:
                                    prediccion
                                        .structuredFormat
                                        ?.secondaryText
                                        ?.text ||
                                    "",

                            };

                        }
                    )

                    .filter(Boolean)

                    .slice(
                        0,
                        5
                    );


            return res.json({

                ok: true,

                resultados,

            });


        } catch (error) {

            console.error(
                "Error autocomplete dirección:",
                error
            );


            return res.status(500).json({
                ok: false,
                error:
                    "No se pudieron buscar direcciones.",
            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| DIRECCIONES - PLACE DETAILS PLACES API (NEW)
|--------------------------------------------------------------------------
|
| Al seleccionar una sugerencia obtenemos:
|
| - dirección
| - latitud
| - longitud
|
| No pedimos:
|
| - fotos
| - horarios
| - reseñas
| - teléfonos
| - web
|
| para no elevar innecesariamente el SKU.
|
*/

router.get(
    "/direcciones/place/:placeId",
    async (req, res) => {

        try {

            const placeId =
                String(
                    req.params.placeId ||
                    ""
                ).trim();


            /*
             * =====================================================
             * PLACE ID
             * =====================================================
             */

            if (!placeId) {

                return res.status(400).json({
                    ok: false,
                    error:
                        "Falta la ubicación.",
                });

            }


            /*
             * =====================================================
             * API KEY
             * =====================================================
             */

            const apiKey =
                process.env.GOOGLE_MAPS_API_KEY;


            if (!apiKey) {

                return res.status(500).json({
                    ok: false,
                    error:
                        "Google Maps no está configurado.",
                });

            }


            /*
             * =====================================================
             * PARÁMETROS
             * =====================================================
             */

            const params =
                new URLSearchParams({

                    languageCode:
                        "es",

                    regionCode:
                        "ES",

                });


            /*
             * =====================================================
             * PLACE DETAILS NEW
             * =====================================================
             */

            const response =
                await fetch(

                    `https://places.googleapis.com/v1/places/${encodeURIComponent(
                        placeId
                    )}?${params.toString()}`,

                    {

                        method:
                            "GET",

                        headers: {

                            "X-Goog-Api-Key":
                                apiKey,


                            /*
                             * Solo pedimos lo que necesitamos.
                             */
                            "X-Goog-FieldMask":
                                "id,formattedAddress,location",

                        },

                    }

                );


            const data =
                await response.json();


            /*
             * =====================================================
             * ERROR GOOGLE
             * =====================================================
             */

            if (
                !response.ok ||
                !data?.location
            ) {

                console.error(
                    "❌ Place Details New:",
                    data
                );


                return res.status(404).json({
                    ok: false,
                    error:
                        "No se pudo localizar esa dirección.",
                });

            }


            /*
             * =====================================================
             * COORDENADAS
             * =====================================================
             */

            const lat =
                Number(
                    data.location.latitude
                );


            const lng =
                Number(
                    data.location.longitude
                );


            if (
                !Number.isFinite(
                    lat
                ) ||
                !Number.isFinite(
                    lng
                )
            ) {

                return res.status(404).json({
                    ok: false,
                    error:
                        "La dirección no tiene coordenadas válidas.",
                });

            }


            /*
             * =====================================================
             * COMPROBACIÓN CEUTA
             * =====================================================
             *
             * Autocomplete solamente prioriza Ceuta.
             *
             * Aquí ponemos la frontera real.
             */

            const distanciaCeuta =
                distanciaMetros(
                    35.8894,
                    -5.3213,
                    lat,
                    lng
                );


            if (
                distanciaCeuta >
                20000
            ) {

                return res.status(400).json({
                    ok: false,
                    error:
                        "La dirección debe estar en Ceuta.",
                });

            }


            /*
             * =====================================================
             * RESPUESTA
             * =====================================================
             */

            return res.json({

                ok: true,


                direccion:
                    data.formattedAddress ||
                    "Ubicación seleccionada",


                lat,


                lng,


                placeId:
                    data.id ||
                    placeId,

            });


        } catch (error) {

            console.error(
                "Error detalle dirección:",
                error
            );


            return res.status(500).json({
                ok: false,
                error:
                    "No se pudo obtener la dirección.",
            });

        }

    }
);


/*
|--------------------------------------------------------------------------
| RESERVAS TAXI - CANCELAR
|--------------------------------------------------------------------------
*/

router.post(
    "/reservas/:id/cancelar",
    async (req, res) => {

        try {

            const {
                id,
            } = req.params;


            const reserva =
                await prisma.reservaTaxi.findUnique({
                    where: {
                        id,
                    },

                    include: {

                        taxista: {
                            include: {
                                vehiculo: true,
                            },
                        },

                    },
                });


            if (!reserva) {

                return res.status(404).json({
                    ok: false,
                    error:
                        "Reserva no encontrada.",
                });

            }


            /*
             * Estos estados ya no permiten
             * cancelar.
             */
            if (
                reserva.estado === "cancelada" ||
                reserva.estado === "completada" ||
                reserva.estado === "en_servicio"
            ) {

                return res.status(400).json({
                    ok: false,
                    error:
                        "Esta reserva ya no se puede cancelar.",
                });

            }


            /*
             * Guardamos el taxista antes
             * de cancelar.
             */
            const taxistaId =
                reserva.taxistaId;


            const estabaAceptada =
                reserva.estado ===
                "aceptada" &&
                !!taxistaId;


            /*
             * Cancelamos.
             */
            const actualizada =
                await prisma.reservaTaxi.update({

                    where: {
                        id,
                    },

                    data: {

                        estado:
                            "cancelada",

                        canceladaEn:
                            new Date(),

                    },

                });


            /*
             * ==================================================
             * AVISO SOCKET AL TAXISTA
             * ==================================================
             */
            if (
                estabaAceptada
            ) {

                try {

                    const {
                        obtenerIo,
                    } =
                        require("../socketSoloTwilio");


                    const io =
                        obtenerIo();


                    io.to(
                        `taxista:${taxistaId}`
                    ).emit(
                        "reserva:cancelada",
                        {
                            ok: true,

                            reservaId:
                                reserva.id,

                            fechaHora:
                                reserva.fechaHora,

                            direccionRecogida:
                                reserva.direccionRecogida,

                            telefonoCliente:
                                reserva.telefonoCliente,

                            mensaje:
                                "El cliente ha cancelado una reserva que tenías aceptada.",
                        }
                    );


                    console.log(
                        "📅 Reserva aceptada cancelada por cliente:",
                        {
                            reservaId:
                                reserva.id,

                            taxistaId,
                        }
                    );


                } catch (
                socketError
                ) {

                    console.log(
                        "No se pudo emitir reserva:cancelada:",
                        socketError.message
                    );

                }

            }


            /*
             * ==================================================
             * PUSH AL TAXISTA
             * ==================================================
             *
             * Así también se entera si tiene
             * la aplicación en segundo plano.
             */
            if (
                estabaAceptada &&
                reserva.taxista?.expoPushToken
            ) {

                try {

                    await fetch(
                        "https://exp.host/--/api/v2/push/send",
                        {

                            method:
                                "POST",

                            headers: {

                                Accept:
                                    "application/json",

                                "Content-Type":
                                    "application/json",

                            },

                            body:
                                JSON.stringify({

                                    to:
                                        reserva.taxista.expoPushToken,

                                    title:
                                        "Reserva cancelada",

                                    body:
                                        `${formatearFechaReservaParaPush(
                                            reserva.fechaHora
                                        )} · ${reserva.direccionBase ||
                                        reserva.direccionRecogida}`,

                                    data: {

                                        type:
                                            "reserva_cancelada",

                                        reservaId:
                                            reserva.id,

                                    },

                                    priority:
                                        "high",

                                    channelId:
                                        "default",

                                }),

                        }
                    );


                } catch (
                pushError
                ) {

                    /*
                     * No fallamos la cancelación
                     * aunque falle el push.
                     */
                    console.log(
                        "No se pudo enviar push de reserva cancelada:",
                        pushError.message
                    );

                }

            }


            return res.json({

                ok: true,

                reserva:
                    actualizada,

            });


        } catch (
        error
        ) {

            console.error(
                "Error POST /cliente/reservas/:id/cancelar:",
                error
            );


            return res.status(500).json({

                ok: false,

                error:
                    "No se pudo cancelar la reserva.",

            });

        }

    }
);

function formatearFechaReservaParaPush(
    valor
) {

    try {

        return new Date(
            valor
        ).toLocaleString(
            "es-ES",
            {
                timeZone:
                    "Europe/Madrid",

                day:
                    "2-digit",

                month:
                    "2-digit",

                hour:
                    "2-digit",

                minute:
                    "2-digit",
            }
        );

    } catch {

        return "Reserva";

    }

}

module.exports = router;