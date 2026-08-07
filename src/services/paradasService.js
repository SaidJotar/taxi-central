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

function normalizarNombreParada(texto = "") {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bparada(s)?\b/g, "")
    .replace(/\btaxi(s)?\b/g, "")
    .replace(/\bde\b/g, "")
    .replace(/\bdel\b/g, "")
    .replace(/\bla\b/g, "")
    .replace(/\bel\b/g, "")
    .replace(/\ben\b/g, "")
    .replace(/\bceuta\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buscarParadaPorNombre(texto) {
  const consulta = normalizarNombreParada(texto);

  if (!consulta) {
    return null;
  }

  const paradas = await prisma.parada.findMany({
    where: {
      activa: true,
    },
  });

  let mejor = null;
  let mejorPuntuacion = 0;

  for (const parada of paradas) {
    const nombre = normalizarNombreParada(parada.nombre || "");
    const direccion = normalizarNombreParada(parada.direccion || "");

    let puntuacion = 0;

    if (nombre === consulta) {
      puntuacion += 100;
    }

    if (nombre.includes(consulta)) {
      puntuacion += 50;
    }

    if (consulta.includes(nombre) && nombre.length >= 3) {
      puntuacion += 40;
    }

    if (direccion.includes(consulta)) {
      puntuacion += 30;
    }

    const palabrasConsulta = consulta
      .split(" ")
      .filter((p) => p.length >= 3);

    for (const palabra of palabrasConsulta) {
      if (nombre.includes(palabra)) {
        puntuacion += 10;
      }

      if (direccion.includes(palabra)) {
        puntuacion += 5;
      }
    }

    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejor = parada;
    }
  }

  if (!mejor || mejorPuntuacion < 10) {
    return null;
  }

  console.log("🚕 Parada encontrada en BD:", {
    id: mejor.id,
    nombre: mejor.nombre,
    puntuacion: mejorPuntuacion,
  });

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
  buscarParadaPorNombre,
};