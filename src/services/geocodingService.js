const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Centro aproximado de Ceuta.
// El radio limita la preferencia de resultados a la ciudad y alrededores.
const CEUTA_CENTER = {
  latitude: 35.8894,
  longitude: -5.3213,
};

const CEUTA_SEARCH_RADIUS_METERS = 15000;

// Límites amplios de seguridad para impedir que se acepte un lugar
// encontrado en otra ciudad.
const CEUTA_BOUNDS = {
  minLat: 35.80,
  maxLat: 35.95,
  minLng: -5.42,
  maxLng: -5.20,
};

function limpiarDireccion(direccionTexto = "") {
  return direccionTexto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/º|ª/g, "")
    .replace(/\bn[uú]mero\b/gi, "")
    .trim();
}

function contieneCeuta(texto = "") {
  return /\bceuta\b/i.test(texto);
}

function prepararConsulta(texto) {
  const limpio = limpiarDireccion(texto);

  if (!limpio) {
    return "";
  }

  return contieneCeuta(limpio)
    ? limpio
    : `${limpio}, Ceuta`;
}

function estaDentroDeCeuta(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= CEUTA_BOUNDS.minLat &&
    lat <= CEUTA_BOUNDS.maxLat &&
    lng >= CEUTA_BOUNDS.minLng &&
    lng <= CEUTA_BOUNDS.maxLng
  );
}

function normalizarResultado({
  nombre,
  direccionFormateada,
  lat,
  lng,
  placeId,
  tipos = [],
  fuente,
}) {
  return {
    encontrada: true,
    motivo: "encontrada",
    nombre: nombre || null,
    direccionFormateada: direccionFormateada || nombre || null,
    lat: Number(lat),
    lng: Number(lng),
    placeId: placeId || null,
    tipos,
    fuente,
  };
}

async function buscarConPlaces(textoConsulta) {
  const url =
    "https://places.googleapis.com/v1/places:searchText";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.types",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: textoConsulta,
      languageCode: "es",
      regionCode: "ES",
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: CEUTA_CENTER,
          radius: CEUTA_SEARCH_RADIUS_METERS,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Places HTTP ${response.status}: ${body.slice(0, 500)}`
    );
  }

  const data = await response.json();
  const resultados = Array.isArray(data.places)
    ? data.places
    : [];

  console.log(
    "📦 Resultados Places:",
    resultados.length
  );

  const candidatosCeuta = resultados
    .map((place) => {
      const lat = Number(place.location?.latitude);
      const lng = Number(place.location?.longitude);

      return {
        nombre: place.displayName?.text || null,
        direccionFormateada:
          place.formattedAddress || null,
        lat,
        lng,
        placeId: place.id || null,
        tipos: Array.isArray(place.types)
          ? place.types
          : [],
      };
    })
    .filter((place) =>
      estaDentroDeCeuta(place.lat, place.lng)
    );

  if (candidatosCeuta.length === 0) {
    return null;
  }

  const primero = candidatosCeuta[0];

  return normalizarResultado({
    ...primero,
    fuente: "places_text_search",
  });
}

async function buscarConGeocoding(textoConsulta) {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/geocode/json"
  );

  url.searchParams.set(
    "address",
    `${textoConsulta}, España`
  );
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);
  url.searchParams.set("region", "es");
  url.searchParams.set("language", "es");

  // Restringe los resultados hacia Ceuta.
  url.searchParams.set(
    "bounds",
    `${CEUTA_BOUNDS.minLat},${CEUTA_BOUNDS.minLng}|` +
    `${CEUTA_BOUNDS.maxLat},${CEUTA_BOUNDS.maxLng}`
  );

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `Geocoding HTTP ${response.status}`
    );
  }

  const data = await response.json();

  console.log("🌐 Estado Geocoding:", data.status);
  console.log(
    "📦 Resultados Geocoding:",
    data.results?.length || 0
  );

  if (
    data.status !== "OK" ||
    !Array.isArray(data.results) ||
    data.results.length === 0
  ) {
    return null;
  }

  const candidato = data.results.find((result) => {
    const lat = Number(
      result.geometry?.location?.lat
    );
    const lng = Number(
      result.geometry?.location?.lng
    );

    return estaDentroDeCeuta(lat, lng);
  });

  if (!candidato) {
    return null;
  }

  return normalizarResultado({
    nombre: null,
    direccionFormateada:
      candidato.formatted_address || textoConsulta,
    lat: candidato.geometry.location.lat,
    lng: candidato.geometry.location.lng,
    placeId: candidato.place_id || null,
    tipos: candidato.types || [],
    fuente: "geocoding",
  });
}

async function geocodificarDireccion(direccionTexto) {
  try {
    if (
      !direccionTexto ||
      !direccionTexto.trim()
    ) {
      return {
        encontrada: false,
        motivo: "texto_vacio",
      };
    }

    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error(
        "Falta GOOGLE_MAPS_API_KEY"
      );
    }

    const consulta =
      prepararConsulta(direccionTexto);

    console.log(
      "📍 Ubicación original:",
      direccionTexto
    );
    console.log(
      "🔎 Consulta preparada:",
      consulta
    );

    // 1. Negocios, establecimientos, edificios y POI.
    const resultadoPlaces =
      await buscarConPlaces(consulta);

    if (resultadoPlaces) {
      console.log(
        "✅ Lugar encontrado con Places:",
        resultadoPlaces
      );

      return resultadoPlaces;
    }

    // 2. Respaldo para calles y direcciones postales.
    const resultadoGeocoding =
      await buscarConGeocoding(consulta);

    if (resultadoGeocoding) {
      console.log(
        "✅ Dirección encontrada con Geocoding:",
        resultadoGeocoding
      );

      return resultadoGeocoding;
    }

    console.log(
      "❌ No se encontró una ubicación válida en Ceuta"
    );

    return {
      encontrada: false,
      motivo: "no_encontrada",
    };
  } catch (error) {
    console.error(
      "❌ Error localizando ubicación:",
      error.message
    );

    return {
      encontrada: false,
      motivo: "error",
      errorInterno: error.message,
    };
  }
}

module.exports = {
  geocodificarDireccion,
  estaDentroDeCeuta,
};