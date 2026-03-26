const express = require("express");
const prisma = require("../services/bd");
const { verificarToken } = require("../services/authToken");

const router = express.Router();

function authTaxista(req, res, next) {
    try {
        const auth = req.headers.authorization || "";
        const token = auth.replace("Bearer ", "").trim();

        if (!token) {
            return res.status(401).json({ error: "Token requerido" });
        }

        const payload = verificarToken(token);

        if (!payload || payload.tipo !== "taxista") {
            return res.status(401).json({ error: "Token inválido" });
        }

        req.taxistaAuth = {
            taxistaId: payload.sub,
            telefono: payload.telefono,
        };

        next();
    } catch (error) {
        return res.status(401).json({ error: "No autorizado" });
    }
}

router.post("/push-token", authTaxista, async (req, res) => {
    try {
        const { expoPushToken } = req.body || {};
        const taxistaId = req.taxistaAuth.taxistaId;

        console.log("📲 /mobile/push-token");
        console.log("taxistaId:", taxistaId);
        console.log("body:", req.body);
        console.log("expoPushToken:", expoPushToken);

        if (!expoPushToken) {
            return res.status(400).json({
                ok: false,
                error: "expoPushToken requerido",
            });
        }

        const actualizado = await prisma.taxista.update({
            where: { id: taxistaId },
            data: { expoPushToken },
        });

        console.log("✅ taxista actualizado:", actualizado.id);

        return res.json({ ok: true });
    } catch (error) {
        console.error("❌ Error /mobile/push-token completo:", error);
        return res.status(500).json({
            ok: false,
            error: "No se pudo guardar el push token",
            detalle: error.message,
        });
    }
});

router.get("/oferta-pendiente", authTaxista, async (req, res) => {
    try {
        const taxistaId = req.taxistaAuth.taxistaId;

        const oferta = await prisma.ofertaSolicitud.findFirst({
            where: {
                taxistaId,
                estado: "pendiente",
            },
            orderBy: {
                creadaEn: "desc",
            },
            include: {
                solicitudViaje: true,
            },
        });

        if (!oferta || !oferta.solicitudViaje) {
            return res.json(null);
        }

        const expiresAt = new Date(
            new Date(oferta.creadaEn).getTime() + 10000
        ).toISOString();

        return res.json({
            ofertaId: oferta.id,
            expiresAt,
            solicitud: {
                id: oferta.solicitudViaje.id,
                nombreCliente: oferta.solicitudViaje.nombreCliente,
                telefonoCliente: oferta.solicitudViaje.telefonoCliente,
                direccionRecogida: oferta.solicitudViaje.direccionRecogida,
                direccionBase: oferta.solicitudViaje.direccionBase || null,
                referenciaRecogida: oferta.solicitudViaje.referenciaRecogida || null,
            },
        });
    } catch (error) {
        console.error("Error /mobile/oferta-pendiente:", error.message);
        return res.status(500).json({
            error: "No se pudo consultar la oferta pendiente",
        });
    }
});

router.get("/servicios", authTaxista, async (req, res) => {
  try {
    const taxistaId = req.taxistaAuth.taxistaId;

    const asignaciones = await prisma.asignacionSolicitud.findMany({
      where: {
        taxistaId,
        solicitudViaje: {
          estado: "completada",
        },
      },
      include: {
        solicitudViaje: true,
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
      orderBy: {
        asignadaEn: "desc",
      },
    });

    const resultado = asignaciones.map((item) => ({
      id: item.solicitudViaje.id,
      fecha:
        item.solicitudViaje.confirmadaEn ||
        item.solicitudViaje.creadaEn ||
        item.asignadaEn,
      cliente: item.solicitudViaje.nombreCliente || null,
      recogida:
        item.solicitudViaje.direccionBase ||
        item.solicitudViaje.direccionRecogida ||
        null,
      taxista: item.taxista?.vehiculo?.numeroTaxi
        ? `Taxi ${item.taxista.vehiculo.numeroTaxi}`
        : item.taxista?.nombreCompleto || null,
      estado: item.solicitudViaje.estado || "completada",
    }));

    return res.json(resultado);
  } catch (error) {
    console.error("Error /mobile/servicios:", error);
    return res.status(500).json({
      error: "No se pudieron cargar los servicios",
      detalle: error.message,
    });
  }
});

router.get("/paradas-resumen", async (req, res) => {
    try {
        const paradas = await prisma.parada.findMany({
            where: {
                activa: true,
            },
            orderBy: {
                nombre: "asc",
            },
            include: {
                taxistas: {
                    where: {
                        estado: "disponible",
                        enParadaDesde: {
                            not: null,
                        },
                    },
                    include: {
                        vehiculo: true,
                    },
                    orderBy: {
                        enParadaDesde: "asc",
                    },
                },
            },
        });

        const resultado = paradas.map((parada) => ({
            paradaId: parada.id,
            nombre: parada.nombre,
            direccion: parada.direccion,
            totalTaxis: parada.taxistas.length,
            cola: parada.taxistas.map((taxista, index) => ({
                taxistaId: taxista.id,
                nombreCompleto: taxista.nombreCompleto,
                numeroTaxi: taxista.vehiculo?.numeroTaxi || null,
                posicion: index + 1,
                enParadaDesde: taxista.enParadaDesde,
            })),
        }));

        return res.json(resultado);
    } catch (error) {
        console.error("Error /mobile/paradas-resumen:", error.message);
        return res.status(500).json({
            error: "No se pudieron cargar las paradas",
        });
    }
});

router.get("/objetos-perdidos", async (req, res) => {
  try {
    const objetos = await prisma.objetoPerdido.findMany({
      orderBy: {
        creadoEn: "desc",
      },
      include: {
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
    });

    const resultado = objetos.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      observaciones: item.observaciones || null,
      fecha: item.fechaHallazgo,
      taxistaNombre: item.taxista?.nombreCompleto || null,
      numeroTaxi: item.taxista?.vehiculo?.numeroTaxi || null,
      estado: item.estado,
    }));

    return res.json(resultado);
  } catch (error) {
    console.error("Error /mobile/objetos-perdidos:", error);
    return res.status(500).json({
      error: "No se pudieron cargar los objetos perdidos",
      detalle: error.message,
    });
  }
});

router.post("/objetos-perdidos", authTaxista, async (req, res) => {
  try {
    const taxistaId = req.taxistaAuth.taxistaId;
    const { descripcion, observaciones } = req.body || {};

    if (!descripcion || !descripcion.trim()) {
      return res.status(400).json({
        ok: false,
        error: "La descripción es obligatoria",
      });
    }

    const objeto = await prisma.objetoPerdido.create({
      data: {
        descripcion: descripcion.trim(),
        observaciones: observaciones?.trim() || null,
        taxistaId,
      },
      include: {
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
    });

    return res.json({
      ok: true,
      objeto: {
        id: objeto.id,
        descripcion: objeto.descripcion,
        observaciones: objeto.observaciones,
        fecha: objeto.fechaHallazgo,
        taxistaNombre: objeto.taxista?.nombreCompleto || null,
        numeroTaxi: objeto.taxista?.vehiculo?.numeroTaxi || null,
        estado: objeto.estado,
      },
    });
  } catch (error) {
    console.error("Error POST /mobile/objetos-perdidos:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo registrar el objeto perdido",
      detalle: error.message,
    });
  }
});

router.patch("/objetos-perdidos/:id/entregar", authTaxista, async (req, res) => {
  try {
    const { id } = req.params;

    const objeto = await prisma.objetoPerdido.update({
      where: { id },
      data: {
        estado: "entregado",
      },
      include: {
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
    });

    return res.json({
      ok: true,
      objeto: {
        id: objeto.id,
        descripcion: objeto.descripcion,
        observaciones: objeto.observaciones,
        fecha: objeto.fechaHallazgo,
        taxistaNombre: objeto.taxista?.nombreCompleto || null,
        numeroTaxi: objeto.taxista?.vehiculo?.numeroTaxi || null,
        estado: objeto.estado,
      },
    });
  } catch (error) {
    console.error("Error PATCH /mobile/objetos-perdidos/:id/entregar:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo marcar el objeto como entregado",
      detalle: error.message,
    });
  }
});

router.delete("/objetos-perdidos/:id", authTaxista, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.objetoPerdido.delete({
      where: { id },
    });

    return res.json({
      ok: true,
    });
  } catch (error) {
    console.error("Error DELETE /mobile/objetos-perdidos/:id:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo eliminar el objeto perdido",
      detalle: error.message,
    });
  }
});

router.get("/public/objetos-perdidos", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim().toLowerCase();

    const objetos = await prisma.objetoPerdido.findMany({
      orderBy: {
        creadoEn: "desc",
      },
      include: {
        taxista: {
          include: {
            vehiculo: true,
          },
        },
      },
    });

    let resultado = objetos.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      observaciones: item.observaciones || null,
      fecha: item.fechaHallazgo || item.creadoEn,
      numeroTaxi: item.taxista?.vehiculo?.numeroTaxi || null,
      estado: item.estado,
    }));

    if (q) {
      resultado = resultado.filter((item) => {
        const texto = [
          item.descripcion,
          item.observaciones,
          item.numeroTaxi,
          item.estado,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return texto.includes(q);
      });
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Error /mobile/public/objetos-perdidos:", error);
    return res.status(500).json({
      error: "No se pudieron cargar los objetos perdidos",
      detalle: error.message,
    });
  }
});

module.exports = router;