const express = require("express");
const prisma = require("../services/bd");
const { buscarParadaMasCercana } = require("../services/paradasService");
const {
    buscarSiguienteTaxistaDisponible,
    emitirOfertaATaxista,
} = require("../services/ofertasServiceSoloTwilio");
const { distanciaMetros } = require("../services/geoUtils");

const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

const router = express.Router();

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

        let distanciaTaxiMetros = null;
        let etaMinutos = null;

        if (
            taxista &&
            solicitud.latRecogida != null &&
            solicitud.lngRecogida != null &&
            taxista.lat != null &&
            taxista.lng != null
        ) {
            distanciaTaxiMetros = Math.round(
                distanciaMetros(
                    Number(solicitud.latRecogida),
                    Number(solicitud.lngRecogida),
                    Number(taxista.lat),
                    Number(taxista.lng)
                )
            );

            etaMinutos = Math.max(1, Math.ceil(distanciaTaxiMetros / 350));
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
                taxista: taxista
                    ? {
                        id: taxista.id,
                        nombreCompleto: taxista.nombreCompleto,
                        telefono: taxista.telefono,
                        numeroTaxi: vehiculo?.numeroTaxi || null,
                        matricula: vehiculo?.matricula || null,
                        marca: vehiculo?.marca || null,
                        modelo: vehiculo?.modelo || null,
                        lat: taxista.lat ?? null,
                        lng: taxista.lng ?? null,
                        ubicacionActualizadaEn: taxista.ubicacionActualizadaEn ?? null,
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

module.exports = router;