const prisma = require("./bd");
const { distanciaMetros } = require("./geoUtils");

async function buscarParadaMasCercana(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  const paradas = await prisma.parada.findMany({
    where: { activa: true },
  });

  if (!paradas.length) {
    return null;
  }

  let mejor = null;

  for (const parada of paradas) {
    const distancia = distanciaMetros(lat, lng, parada.lat, parada.lng);

    if (!mejor || distancia < mejor.distanciaMetros) {
      mejor = {
        ...parada,
        distanciaMetros: distancia,
      };
    }
  }

  return mejor;
}

async function buscarParadaCercanaParaEntrada(lat, lng, radioMetros = 40) {
  const parada = await buscarParadaMasCercana(lat, lng);

  if (!parada) return null;
  if (parada.distanciaMetros > radioMetros) return null;

  return parada;
}

async function obtenerColaParada(paradaId) {
  if (!paradaId) return [];

  const taxistas = await prisma.taxista.findMany({
    where: {
      paradaId,
      estado: "disponible",
      enParadaDesde: { not: null },
    },
    include: {
      vehiculo: true,
      parada: true,
    },
    orderBy: {
      enParadaDesde: "asc",
    },
  });

  return taxistas.map((taxista, index) => ({
    taxistaId: taxista.id,
    nombreCompleto: taxista.nombreCompleto,
    numeroTaxi: taxista.vehiculo?.numeroTaxi || null,
    posicion: index + 1,
    enParadaDesde: taxista.enParadaDesde,
  }));
}

module.exports = {
  buscarParadaMasCercana,
  buscarParadaCercanaParaEntrada,
  obtenerColaParada,
};