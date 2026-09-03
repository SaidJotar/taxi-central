const fetch = (...args) =>
    import("node-fetch").then(
        ({ default: fetch }) =>
            fetch(...args)
    );


const ROUTES_URL =
    "https://routes.googleapis.com/directions/v2:computeRoutes";


/*
 * =====================================================
 * CALCULAR RUTA REAL TAXI → CLIENTE
 * =====================================================
 *
 * IMPORTANTE:
 *
 * - DRIVE
 * - TRAFFIC_UNAWARE
 * - Routes Essentials
 *
 * NO usamos:
 *
 * TRAFFIC_AWARE
 * TRAFFIC_AWARE_OPTIMAL
 *
 * porque subirían a un SKU superior.
 */

async function calcularRutaTaxiCliente({
    origenLat,
    origenLng,
    destinoLat,
    destinoLng,
}) {

    const apiKey =
        process.env.GOOGLE_MAPS_API_KEY;


    if (!apiKey) {

        throw new Error(
            "Falta GOOGLE_MAPS_API_KEY"
        );

    }


    const valores = [
        origenLat,
        origenLng,
        destinoLat,
        destinoLng,
    ].map(Number);


    if (
        !valores.every(
            Number.isFinite
        )
    ) {

        throw new Error(
            "Coordenadas inválidas para calcular la ruta"
        );

    }


    const body = {

        origin: {

            location: {

                latLng: {

                    latitude:
                        Number(
                            origenLat
                        ),

                    longitude:
                        Number(
                            origenLng
                        ),

                },

            },

        },


        destination: {

            location: {

                latLng: {

                    latitude:
                        Number(
                            destinoLat
                        ),

                    longitude:
                        Number(
                            destinoLng
                        ),

                },

            },

        },


        travelMode:
            "DRIVE",


        /*
         * Ruta real pero SIN tráfico
         * en tiempo real.
         */
        routingPreference:
            "TRAFFIC_UNAWARE",


        computeAlternativeRoutes:
            false,


        languageCode:
            "es",


        units:
            "METRIC",

    };


    const response =
        await fetch(
            ROUTES_URL,
            {

                method:
                    "POST",

                headers: {

                    "Content-Type":
                        "application/json",

                    "X-Goog-Api-Key":
                        apiKey,


                    /*
                     * Con UNA llamada obtenemos:
                     *
                     * - duración
                     * - distancia
                     * - ruta dibujable
                     */
                    "X-Goog-FieldMask":
                        [
                            "routes.duration",
                            "routes.distanceMeters",
                            "routes.polyline.encodedPolyline",
                        ].join(","),

                },


                body:
                    JSON.stringify(
                        body
                    ),

            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        console.error(
            "❌ Google Routes:",
            data
        );


        throw new Error(
            data?.error?.message ||
            "Google Routes no disponible"
        );

    }


    const ruta =
        data?.routes?.[0];


    if (!ruta) {

        throw new Error(
            "Google no devolvió ninguna ruta"
        );

    }


    const distanciaMetros =
        Number(
            ruta.distanceMeters
        );


    /*
     * Google devuelve:
     *
     * "325s"
     * "325.123s"
     */
    const duracionTexto =
        String(
            ruta.duration ||
            ""
        ).replace(
            "s",
            ""
        );


    const duracionSegundos =
        Number(
            duracionTexto
        );


    if (
        !Number.isFinite(
            distanciaMetros
        ) ||
        !Number.isFinite(
            duracionSegundos
        )
    ) {

        throw new Error(
            "Google devolvió una ruta incompleta"
        );

    }


    const etaMinutos =
        Math.max(
            1,
            Math.ceil(
                duracionSegundos /
                60
            )
        );


    return {

        distanciaMetros:
            Math.round(
                distanciaMetros
            ),


        duracionSegundos:
            Math.round(
                duracionSegundos
            ),


        etaMinutos,


        polyline:
            ruta?.polyline
                ?.encodedPolyline ||
            null,


        fuente:
            "google_routes_essentials",

    };

}


module.exports = {
    calcularRutaTaxiCliente,
};