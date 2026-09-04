const express = require("express");
const prisma = require("../services/bd");
const { verificarToken } = require("../services/authToken");
const authTaxista = require("../routes/authTaxista");

const router = express.Router();

/*
 * =====================================================
 * UBICACIÓN BACKGROUND DEL TAXISTA
 * =====================================================
 */

router.post(
  "/ubicacion-background",
  authTaxista,
  async (req, res) => {
    try {
      const taxistaId =
        req.taxistaAuth
          ?.taxistaId;

      const {
        lat,
        lng,
      } = req.body || {};

      if (!taxistaId) {
        return res
          .status(401)
          .json({
            ok: false,
            error:
              "No autorizado",
          });
      }

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Ubicación inválida",
          });
      }

      /*
       * Require intencionadamente aquí.
       *
       * Así evitamos cargar
       * socketSoloTwilio al inicializar
       * este router.
       */
      const {
        procesarUbicacionTaxista,
      } =
        require("../socketSoloTwilio");

      if (
        typeof procesarUbicacionTaxista !==
        "function"
      ) {
        throw new Error(
          "procesarUbicacionTaxista no disponible"
        );
      }

      const resultado =
        await procesarUbicacionTaxista({
          taxistaId,
          lat,
          lng,
          socket: null,
          esBackground: true,
        });

      console.log(
        "📍 GPS background recibido",
        {
          taxistaId,
          lat,
          lng,
          accion:
            resultado?.accion ||
            null,
        }
      );

      return res.json({
        ok: true,

        accion:
          resultado?.accion ||
          "gps_actualizado",

        ubicacionActualizadaEn:
          resultado?.taxista
            ?.ubicacionActualizadaEn ||
          null,

        estado:
          resultado?.taxista
            ?.estado ||
          null,

        paradaId:
          resultado?.taxista
            ?.paradaId ||
          null,
      });

    } catch (error) {
      console.error(
        "❌ Error POST /mobile/ubicacion-background:",
        error
      );

      return res
        .status(500)
        .json({
          ok: false,

          error:
            "No se pudo actualizar la ubicación",

          detalle:
            error?.message ||
            "Error desconocido",
        });
    }
  }
);

router.post("/push-token", authTaxista, async (req, res) => {
  try {
    const { expoPushToken } = req.body || {};
    const taxistaId = req.taxistaAuth.taxistaId;

    if (!expoPushToken) {
      return res.status(400).json({
        ok: false,
        error: "expoPushToken requerido",
      });
    }

    await prisma.taxista.update({
      where: { id: taxistaId },
      data: { expoPushToken },
    });

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
        ofrecidaEn: "desc",
      },
      include: {
        solicitudViaje: true,
      },
    });

    if (!oferta || !oferta.solicitudViaje) {
      return res.json(null);
    }

    const expiresAt = new Date(
      new Date(oferta.ofrecidaEn).getTime() + 10000
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

      cliente:
        item.solicitudViaje.nombreCliente || null,

      telefono:
        item.solicitudViaje.telefonoCliente || null,

      recogida:
        item.solicitudViaje.direccionBase ||
        item.solicitudViaje.direccionRecogida ||
        null,

      taxista: item.taxista?.vehiculo?.numeroTaxi
        ? `Taxi ${item.taxista.vehiculo.numeroTaxi}`
        : item.taxista?.nombreCompleto || null,

      estado:
        item.solicitudViaje.estado || "completada",

      importe:
        item.solicitudViaje.costoFinal ?? null,

      rating:
        item.solicitudViaje.ratingCliente ?? null,

      comentarioRating:
        item.solicitudViaje.comentarioRating ?? null,
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

router.get("/objetos-perdidos", authTaxista, async (req, res) => {
  try {
    const taxistaId = req.taxistaAuth.taxistaId;

    const objetos = await prisma.objetoPerdido.findMany({
      where: {
        taxistaId,
        estado: "con_taxista",
      },
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
        estado: "con_taxista",
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
    const taxistaId = req.taxistaAuth.taxistaId;

    const existente = await prisma.objetoPerdido.findUnique({
      where: { id },
    });

    if (!existente) {
      return res.status(404).json({
        ok: false,
        error: "Objeto no encontrado",
      });
    }

    if (existente.taxistaId !== taxistaId) {
      return res.status(403).json({
        ok: false,
        error: "No puedes modificar un objeto de otro taxista",
      });
    }

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

router.patch(
  "/objetos-perdidos/:id/entregar-central",
  authTaxista,
  async (req, res) => {
    try {
      const { id } = req.params;
      const taxistaId = req.taxistaAuth.taxistaId;

      const existente = await prisma.objetoPerdido.findUnique({
        where: { id },
      });

      if (!existente) {
        return res.status(404).json({
          ok: false,
          error: "Objeto no encontrado",
        });
      }

      if (existente.taxistaId !== taxistaId) {
        return res.status(403).json({
          ok: false,
          error: "No puedes modificar un objeto de otro taxista",
        });
      }

      if (existente.estado !== "con_taxista") {
        return res.status(409).json({
          ok: false,
          error: "Este objeto ya no está pendiente de entrega por el taxista",
        });
      }

      const objeto = await prisma.objetoPerdido.update({
        where: { id },
        data: {
          estado: "en_central",
          entregadoCentralEn: new Date(),
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
          entregadoCentralEn: objeto.entregadoCentralEn,
        },
      });
    } catch (error) {
      console.error(
        "Error PATCH /mobile/objetos-perdidos/:id/entregar-central:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "No se pudo entregar el objeto en la central",
        detalle: error.message,
      });
    }
  }
);

router.delete("/objetos-perdidos/:id", authTaxista, async (req, res) => {
  try {
    const { id } = req.params;
    const taxistaId = req.taxistaAuth.taxistaId;

    const existente = await prisma.objetoPerdido.findUnique({
      where: { id },
    });

    if (!existente) {
      return res.status(404).json({
        ok: false,
        error: "Objeto no encontrado",
      });
    }

    if (existente.taxistaId !== taxistaId) {
      return res.status(403).json({
        ok: false,
        error: "No puedes eliminar un objeto de otro taxista",
      });
    }

    if (existente.estado !== "con_taxista") {
      return res.status(409).json({
        ok: false,
        error: "No puedes eliminar un objeto que ya fue entregado en la central",
      });
    }

    await prisma.objetoPerdido.delete({
      where: { id },
    });

    return res.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Error DELETE /mobile/objetos-perdidos/:id:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "No se pudo eliminar el objeto perdido",
      detalle: error.message,
    });
  }
});

router.get("/public/objetos-perdidos", async (req, res) => {
  try {
    const q = (req.query.q || "")
      .toString()
      .trim()
      .slice(0, 100);

    const where = {
      estado: "en_central",
    };

    if (q) {
      where.OR = [
        {
          descripcion: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          observaciones: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          taxista: {
            vehiculo: {
              numeroTaxi: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    const objetos = await prisma.objetoPerdido.findMany({
      where,
      select: {
        id: true,
        descripcion: true,
        observaciones: true,
        fechaHallazgo: true,
        entregadoCentralEn: true,
        estado: true,

        taxista: {
          select: {
            vehiculo: {
              select: {
                numeroTaxi: true,
              },
            },
          },
        },
      },
      orderBy: [
        {
          entregadoCentralEn: "desc",
        },
        {
          creadoEn: "desc",
        },
      ],
      take: 100,
    });

    const resultado = objetos.map((item) => ({
      id: item.id,
      descripcion: item.descripcion,
      observaciones: item.observaciones || null,
      fecha: item.fechaHallazgo,
      disponibleEnCentralDesde: item.entregadoCentralEn,
      numeroTaxi: item.taxista?.vehiculo?.numeroTaxi || null,
      estado: item.estado,
    }));

    return res.json(resultado);
  } catch (error) {
    console.error(
      "Error GET /mobile/public/objetos-perdidos:",
      error
    );

    return res.status(500).json({
      error: "No se pudieron cargar los objetos perdidos",
    });
  }
});

function formatearTextoFecha(fecha) {
  if (!fecha) return "";

  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleDateString("es-ES");
}

/*
|--------------------------------------------------------------------------
| RESERVAS DISPONIBLES
|--------------------------------------------------------------------------
*/

router.get(
  "/reservas/disponibles",
  authTaxista,
  async (req, res) => {
    try {
      const reservas =
        await prisma.reservaTaxi.findMany({
          where: {
            estado:
              "pendiente",

            fechaHora: {
              gt:
                new Date(),
            },

            /*
             * De momento enseñamos
             * reservas normales.
             *
             * Las especiales tendrán
             * un flujo aparte.
             */
            tipo:
              "normal",
          },

          orderBy: {
            fechaHora:
              "asc",
          },

          select: {
            id: true,

            tipo: true,

            fechaHora: true,

            direccionRecogida:
              true,

            direccionBase:
              true,

            referenciaRecogida:
              true,

            latRecogida:
              true,

            lngRecogida:
              true,

            precioFinal:
              true,

            creadaEn:
              true,

            telefonoCliente:
              true,
          },
        });


      return res.json({
        ok: true,
        reservas,
        total:
          reservas.length,
      });

    } catch (error) {
      console.error(
        "Error GET /mobile/reservas/disponibles:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "No se pudieron cargar las reservas.",
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| MIS RESERVAS ACEPTADAS
|--------------------------------------------------------------------------
*/

router.get(
  "/reservas/mias",
  authTaxista,
  async (req, res) => {
    try {
      const taxistaId =
        req.taxistaAuth.taxistaId;


      const reservas =
        await prisma.reservaTaxi.findMany({
          where: {
            taxistaId,

            estado: {
              in: [
                "aceptada",
                "en_servicio",
              ],
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
        "Error GET /mobile/reservas/mias:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "No se pudieron consultar tus reservas.",
      });
    }
  }
);


/*
|--------------------------------------------------------------------------
| ACEPTAR RESERVA
|--------------------------------------------------------------------------
|
| IMPORTANTE:
|
| updateMany + estado pendiente + taxistaId null
| hace que SOLO pueda ganarla un taxista.
|--------------------------------------------------------------------------
*/

router.post(
  "/reservas/:id/aceptar",
  authTaxista,
  async (req, res) => {
    try {
      const {
        id,
      } = req.params;

      const taxistaId =
        req.taxistaAuth.taxistaId;


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


      if (!taxista) {
        return res.status(404).json({
          ok: false,
          error:
            "Taxista no encontrado.",
        });
      }


      if (!taxista.vehiculo) {
        return res.status(400).json({
          ok: false,
          error:
            "El taxista no tiene vehículo asociado.",
        });
      }


      const reserva =
        await prisma.reservaTaxi.findUnique({
          where: {
            id,
          },
        });


      if (!reserva) {
        return res.status(404).json({
          ok: false,
          error:
            "Reserva no encontrada.",
        });
      }


      if (
        reserva.tipo !==
        "normal"
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Las reservas especiales tienen otro proceso de aceptación.",
        });
      }


      if (
        reserva.fechaHora <=
        new Date()
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "La reserva ya ha vencido.",
        });
      }


      /*
       * OPERACIÓN ATÓMICA.
       *
       * Si dos taxistas pulsan
       * aceptar simultáneamente,
       * solo uno conseguirá count = 1.
       */
      const resultado =
        await prisma.reservaTaxi.updateMany({
          where: {
            id,

            estado:
              "pendiente",

            taxistaId:
              null,
          },

          data: {
            estado:
              "aceptada",

            taxistaId,

            aceptadaEn:
              new Date(),
          },
        });


      if (
        resultado.count === 0
      ) {
        return res.status(409).json({
          ok: false,
          error:
            "Esta reserva ya ha sido aceptada por otro taxista.",
        });
      }


      const aceptada =
        await prisma.reservaTaxi.findUnique({
          where: {
            id,
          },

          include: {
            taxista: {
              include: {
                vehiculo:
                  true,
              },
            },
          },
        });


      /*
       * Avisamos a todas las apps
       * para que desaparezca de
       * disponibles inmediatamente.
       */
      try {
        const {
          obtenerIo,
        } =
          require("../socketSoloTwilio");

        const io =
          obtenerIo();


        io.emit(
          "reserva:aceptada",
          {
            reservaId:
              id,

            taxistaId,
          }
        );

      } catch (socketError) {
        console.log(
          "No se pudo emitir reserva:aceptada:",
          socketError.message
        );
      }


      return res.json({
        ok: true,

        mensaje:
          "La reserva es tuya.",

        reserva:
          aceptada,
      });

    } catch (error) {
      console.error(
        "Error POST /mobile/reservas/:id/aceptar:",
        error
      );

      return res.status(500).json({
        ok: false,
        error:
          "No se pudo aceptar la reserva.",
      });
    }
  }
);

module.exports = router;