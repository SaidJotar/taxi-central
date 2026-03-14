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

module.exports = {
  buscarParadaMasCercana,
  buscarParadaCercanaParaEntrada,
};