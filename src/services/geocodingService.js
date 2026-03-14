const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

function limpiarDireccion(direccionTexto) {
  return direccionTexto
    .trim()
    .replace(/\s+/g, " ")
    .replace(/º|ª/g, "")
    .replace(/\bnumero\b/gi, "")
    .replace(/\bnúmero\b/gi, "");
}

async function geocodificarDireccion(direccionTexto) {
  try {
    if (!direccionTexto || !direccionTexto.trim()) {
      return null;
    }

    if (!GOOGLE_MAPS_API_KEY) {
      throw new Error("Falta GOOGLE_MAPS_API_KEY");
    }

    const limpia = limpiarDireccion(direccionTexto);
    const direccionCompleta = `${limpia}, Ceuta, España`;

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", direccionCompleta);
    url.searchParams.set("key", GOOGLE_MAPS_API_KEY);
    url.searchParams.set("region", "es");
    url.searchParams.set("language", "es");

    const response = await fetch(url.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
      console.log("❌ No se encontraron resultados");
      return null;
    }

    const first = data.results[0];
    const location = first.geometry?.location;

    if (!location) {
      return null;
    }

    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
      direccionFormateada: first.formatted_address || direccionTexto,
      placeId: first.place_id || null,
    };
  } catch (error) {
    console.error("❌ Error en geocodificarDireccion:", error.message);
    return null;
  }
}

module.exports = {
  geocodificarDireccion,
};