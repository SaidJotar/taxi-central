import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import MapView, {
    Marker,
    Polyline,
    PROVIDER_GOOGLE,
} from "react-native-maps";

import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Linking,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { api } from "../src/api/client";

const SEARCHING_POLL_MS = 3000;
const ASSIGNED_POLL_MS = 4000;

function formatDist(metros) {
    if (metros == null) return "—";
    if (metros < 1000) return `${metros} m`;
    return `${(metros / 1000).toFixed(1)} km`;
}

/*
 * =====================================================
 * DECODIFICAR GOOGLE ENCODED POLYLINE
 * =====================================================
 *
 * No necesitamos instalar ningún paquete.
 */

function decodeGooglePolyline(
    encoded
) {

    if (!encoded) {
        return [];
    }


    const points =
        [];


    let index =
        0;

    let lat =
        0;

    let lng =
        0;


    while (
        index <
        encoded.length
    ) {

        let result =
            0;

        let shift =
            0;

        let byte;


        do {

            byte =
                encoded
                    .charCodeAt(
                        index++
                    ) -
                63;


            result |=
                (byte & 0x1f)
                << shift;


            shift +=
                5;

        } while (
            byte >=
            0x20
        );


        const deltaLat =
            result & 1
                ? ~(result >> 1)
                : result >> 1;


        lat +=
            deltaLat;


        result =
            0;

        shift =
            0;


        do {

            byte =
                encoded
                    .charCodeAt(
                        index++
                    ) -
                63;


            result |=
                (byte & 0x1f)
                << shift;


            shift +=
                5;

        } while (
            byte >=
            0x20
        );


        const deltaLng =
            result & 1
                ? ~(result >> 1)
                : result >> 1;


        lng +=
            deltaLng;


        points.push({

            latitude:
                lat / 1e5,

            longitude:
                lng / 1e5,

        });

    }


    return points;

}

export default function RideScreen() {
    const {
        solicitudId,
        originalLat,
        originalLng,
        originalDireccion,
    } = useLocalSearchParams();

    const mapRef = useRef(null);
    const pollRef = useRef(null);;

    const [loading, setLoading] = useState(true);
    const [solicitud, setSolicitud] = useState(null);

    const [rating, setRating] = useState(0);
    const [comentario, setComentario] = useState("");
    const [enviandoValoracion, setEnviandoValoracion] = useState(false);

    const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
    const [ultimoMensajeLeidoId, setUltimoMensajeLeidoId] = useState(null);

    const [seguirTaxi, setSeguirTaxi] = useState(true);
    const [ultimoTaxiCoords, setUltimoTaxiCoords] = useState(null);

    const sinTaxiAvisadoRef = useRef(false);

    const mensajesInicializadosRef = useRef(false);
    const ultimoMensajeTaxistaRef = useRef(null);

    const detenerPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const cargarEstado = useCallback(async () => {
        try {
            if (!solicitudId) return;

            const res = await api.estadoSolicitud(String(solicitudId));
            const data = res?.solicitud || null;

            setSolicitud(data);

            if (
                data?.estado === "cancelada" ||
                data?.estado === "sin_taxista" ||
                data?.estado === "completada"
            ) {
                detenerPolling();
            }
        } catch (error) {
            console.log("Error cargando estado del viaje:", error.message);
        } finally {
            setLoading(false);
        }
    }, [detenerPolling, solicitudId]);

    useEffect(() => {

        if (
            solicitud?.estado !==
            "sin_taxista"
        ) {

            sinTaxiAvisadoRef.current =
                false;

            return;
        }


        if (
            sinTaxiAvisadoRef.current
        ) {

            return;
        }


        sinTaxiAvisadoRef.current =
            true;


        Alert.alert(
            "No hay taxis disponibles",

            "Ningún taxista ha podido aceptar tu solicitud en este momento. Puedes volver a intentarlo.",

            [
                {
                    text:
                        "Volver al inicio",

                    onPress: () =>
                        volverInicio(),
                },
            ],

            {
                cancelable:
                    false,
            }
        );

    }, [
        solicitud?.estado,
    ]);

    useEffect(() => {
        cargarEstado();

        return () => {
            detenerPolling();
        };
    }, [cargarEstado, detenerPolling]);

    useEffect(() => {
        if (!solicitudId) return;

        detenerPolling();

        const ms =
            solicitud?.estado === "asignada"
                ? ASSIGNED_POLL_MS
                : SEARCHING_POLL_MS;

        pollRef.current = setInterval(() => {
            cargarEstado();
        }, ms);

        return () => {
            detenerPolling();
        };
    }, [cargarEstado, detenerPolling, solicitud?.estado, solicitudId]);

    const pickupCoords = useMemo(() => {

        const lat =
            Number(
                solicitud?.latRecogida
            );

        const lng =
            Number(
                solicitud?.lngRecogida
            );


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return null;

        }


        return {

            latitude:
                lat,

            longitude:
                lng,

        };

    }, [
        solicitud?.latRecogida,
        solicitud?.lngRecogida,
    ]);


    const taxiCoords = useMemo(() => {

        const lat =
            Number(
                solicitud?.taxista?.lat
            );

        const lng =
            Number(
                solicitud?.taxista?.lng
            );


        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
        ) {

            return null;

        }


        return {

            latitude:
                lat,

            longitude:
                lng,

        };

    }, [
        solicitud?.taxista?.lat,
        solicitud?.taxista?.lng,
    ]);


    /*
     * =====================================================
     * RUTA GOOGLE
     * =====================================================
     *
     * IMPORTANTE:
     *
     * Este hook tiene que estar SIEMPRE
     * antes de cualquier:
     *
     * if (loading) return ...
     * if (!solicitud) return ...
     */

    const rutaCoords =
        useMemo(
            () => {

                return decodeGooglePolyline(
                    solicitud?.rutaPolyline
                );

            },
            [
                solicitud?.rutaPolyline,
            ]
        );

    useEffect(() => {
        if (!solicitud?.id) return;

        let activo = true;

        const revisarMensajes = async () => {
            try {
                const res = await api.getMensajes(solicitud.id);

                const mensajes =
                    Array.isArray(res?.mensajes)
                        ? res.mensajes
                        : [];

                const mensajesTaxista =
                    mensajes.filter(
                        (m) => m.emisorTipo === "taxista"
                    );

                /*
                 * Primera comprobación.
                 *
                 * Solo guardamos el estado actual.
                 * NO mostramos mensajes antiguos
                 * como nuevos.
                 */
                if (!mensajesInicializadosRef.current) {
                    mensajesInicializadosRef.current = true;

                    if (mensajesTaxista.length > 0) {
                        const ultimo =
                            mensajesTaxista[
                            mensajesTaxista.length - 1
                            ];

                        ultimoMensajeTaxistaRef.current =
                            ultimo.id;
                    }

                    return;
                }

                /*
                 * Ya estamos inicializados.
                 *
                 * Si todavía no había ningún mensaje
                 * y acaba de llegar el primero,
                 * ESTE SÍ es nuevo.
                 */
                if (
                    mensajesTaxista.length > 0 &&
                    !ultimoMensajeTaxistaRef.current
                ) {
                    const ultimo =
                        mensajesTaxista[
                        mensajesTaxista.length - 1
                        ];

                    ultimoMensajeTaxistaRef.current =
                        ultimo.id;

                    if (activo) {
                        setMensajesNoLeidos(
                            mensajesTaxista.length
                        );
                    }

                    return;
                }

                if (!mensajesTaxista.length) {
                    return;
                }

                const ultimo =
                    mensajesTaxista[
                    mensajesTaxista.length - 1
                    ];

                /*
                 * No ha llegado nada nuevo.
                 */
                if (
                    ultimo.id ===
                    ultimoMensajeTaxistaRef.current
                ) {
                    return;
                }

                /*
                 * Averiguamos cuántos mensajes nuevos
                 * hay desde el último conocido.
                 */
                const indexAnterior =
                    mensajesTaxista.findIndex(
                        (m) =>
                            m.id ===
                            ultimoMensajeTaxistaRef.current
                    );

                let nuevos = 1;

                if (indexAnterior >= 0) {
                    nuevos =
                        mensajesTaxista.length -
                        indexAnterior -
                        1;
                }

                ultimoMensajeTaxistaRef.current =
                    ultimo.id;

                if (activo) {
                    setMensajesNoLeidos(
                        (actual) =>
                            actual + nuevos
                    );
                }

            } catch (error) {
                console.log(
                    "Error revisando mensajes:",
                    error.message
                );
            }
        };

        revisarMensajes();

        const interval =
            setInterval(
                revisarMensajes,
                2500
            );

        return () => {
            activo = false;
            clearInterval(interval);
        };

    }, [solicitud?.id]);

    useEffect(() => {
        if (!taxiCoords) return;

        const cambio =
            !ultimoTaxiCoords ||
            taxiCoords.latitude !== ultimoTaxiCoords.latitude ||
            taxiCoords.longitude !== ultimoTaxiCoords.longitude;

        if (!cambio) return;

        setUltimoTaxiCoords(taxiCoords);

        if (!seguirTaxi || !mapRef.current) return;

        if (pickupCoords) {
            mapRef.current.fitToCoordinates([pickupCoords, taxiCoords], {
                edgePadding: {
                    top: 120,
                    right: 70,
                    bottom: 320,
                    left: 70,
                },
                animated: true,
            });
        } else {
            mapRef.current.animateToRegion(
                {
                    latitude: taxiCoords.latitude,
                    longitude: taxiCoords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                },
                500
            );
        }
    }, [taxiCoords, pickupCoords, seguirTaxi, ultimoTaxiCoords]);

    const region = useMemo(() => {
        if (pickupCoords) {
            return {
                latitude: pickupCoords.latitude,
                longitude: pickupCoords.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            };
        }

        return {
            latitude: 35.8894,
            longitude: -5.3213,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
        };
    }, [pickupCoords]);

    function volverInicioLimpio() {
        router.replace({
            pathname: "/",
            params: {
                reset: "1",

                originalLat:
                    originalLat
                        ? String(originalLat)
                        : "",

                originalLng:
                    originalLng
                        ? String(originalLng)
                        : "",

                originalDireccion:
                    originalDireccion
                        ? String(originalDireccion)
                        : "",
            },
        });
    }

    async function cancelarSolicitud() {
        try {
            if (!solicitud?.id) return;

            await api.cancelarSolicitud(solicitud.id);
            detenerPolling();

            Alert.alert(
                "Solicitud cancelada",
                "Hemos cancelado tu solicitud.",
                [
                    {
                        text: "Aceptar",
                        onPress: () =>
                            router.replace({
                                pathname: "/",
                                params: {
                                    lat: solicitud?.latRecogida
                                        ? String(solicitud.latRecogida)
                                        : "",
                                    lng: solicitud?.lngRecogida
                                        ? String(solicitud.lngRecogida)
                                        : "",
                                    direccion:
                                        solicitud?.direccionBase ||
                                        solicitud?.direccionRecogida ||
                                        "",
                                    reuseLocation: "1",
                                },
                            }),
                    },
                ]
            );
        } catch (error) {
            Alert.alert(
                "No se pudo cancelar",
                error.message || "Inténtalo de nuevo."
            );
        }
    }

    function volverInicio() {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace("/");
    }

    function llamarTaxista() {
        const telefono = solicitud?.taxista?.telefono;
        if (!telefono) {
            Alert.alert("Teléfono no disponible");
            return;
        }

        Linking.openURL(`tel:${telefono}`);
    }

    async function abrirMensajes() {
        if (!solicitud?.id) return;

        try {
            const res =
                await api.getMensajes(
                    solicitud.id
                );

            const mensajes =
                Array.isArray(res?.mensajes)
                    ? res.mensajes
                    : [];

            const mensajesTaxista =
                mensajes.filter(
                    (m) =>
                        m.emisorTipo === "taxista"
                );

            if (mensajesTaxista.length) {
                const ultimo =
                    mensajesTaxista[
                    mensajesTaxista.length - 1
                    ];

                ultimoMensajeTaxistaRef.current =
                    ultimo.id;
            }

            /*
             * Al abrir el chat:
             * todo queda leído.
             */
            setMensajesNoLeidos(0);

        } catch (error) {
            console.log(
                "Error preparando chat:",
                error.message
            );
        }

        router.push({
            pathname: "/chat",
            params: {
                solicitudId:
                    solicitud.id,
            },
        });
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color="#111827" />
                <Text style={styles.loadingText}>Cargando tu solicitud…</Text>
            </View>
        );
    }

    if (!solicitud) {
        return (
            <View style={styles.centered}>
                <Text style={styles.screenTitle}>Solicitud no encontrada</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={volverInicio}>
                    <Text style={styles.primaryButtonText}>Volver al inicio</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.locateButton}
                    onPress={() => {
                        if (pickupCoords && taxiCoords && mapRef.current) {
                            mapRef.current.fitToCoordinates([pickupCoords, taxiCoords], {
                                edgePadding: {
                                    top: 120,
                                    right: 70,
                                    bottom: 360,
                                    left: 70,
                                },
                                animated: true,
                            });
                        }
                    }}
                >
                    <Ionicons name="locate" size={20} color="#111827" />
                </TouchableOpacity>
            </View>
        );
    }

    const etaTexto =
        solicitud?.etaTexto ||
        (
            solicitud?.etaMinutos != null
                ? `${solicitud.etaMinutos} min`
                : "—"
        );

    return (
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>

            <MapView
                provider={PROVIDER_GOOGLE}
                ref={mapRef}
                style={styles.map}
                initialRegion={region}
                showsUserLocation
                showsMyLocationButton={false}
                rotateEnabled={false}

            >

                {pickupCoords && (
                    <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 1 }}>
                        <View style={styles.pickupMarkerWrap}>
                            <Ionicons name="location-sharp" size={34} color="#111827" />
                        </View>
                    </Marker>
                )}

                {solicitud?.faseServicio !==
                    "en_viaje" &&
                    rutaCoords.length > 1 && (

                        <Polyline
                            coordinates={
                                rutaCoords
                            }
                            strokeWidth={5}
                            lineCap="round"
                            lineJoin="round"
                        />

                    )}

                {taxiCoords && (
                    <Marker coordinate={taxiCoords} anchor={{ x: 0.5, y: 0.5 }}>
                        <View style={styles.taxiMarker}>
                            <MaterialCommunityIcons name="car-connected" size={20} color="#fff" />
                        </View>
                    </Marker>
                )}
            </MapView>

            {solicitud?.estado !== "asignada" && solicitud?.estado !== "completada" && (
                <TouchableOpacity style={styles.backButton} onPress={volverInicio}>
                    <Ionicons name="chevron-back" size={22} color="#111827" />
                </TouchableOpacity>
            )}

            <View style={styles.bottomCard}>
                <View style={styles.dragHandle} />

                {(solicitud.estado === "pendiente" || solicitud.estado === "ofertada") && (
                    <>
                        <Text style={styles.screenTitle}>Buscando taxi</Text>
                        <Text style={styles.subtitle}>
                            Estamos avisando a taxistas disponibles cerca de ti.
                        </Text>

                        <View style={styles.searchingCard}>
                            <ActivityIndicator size="small" color="#111827" />
                            <Text style={styles.searchingText}>Esperando aceptación…</Text>
                        </View>

                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>Recogida</Text>
                            <Text style={styles.infoValue}>
                                {solicitud.direccionBase || solicitud.direccionRecogida || "-"}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={cancelarSolicitud}
                        >
                            <Text style={styles.secondaryButtonText}>Cancelar solicitud</Text>
                        </TouchableOpacity>
                    </>
                )}

                {solicitud.estado === "asignada" && (
                    <>
                        <View style={styles.heroRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.screenTitle}>

                                    {solicitud?.faseServicio ===
                                        "en_viaje"
                                        ? "Viaje en curso"

                                        : solicitud?.faseServicio ===
                                            "esperando_cliente"
                                            ? "Tu taxi ya ha llegado"

                                            : solicitud?.etaEstado ===
                                                "cerca"
                                                ? "Tu taxi está a punto de llegar"

                                                : "Tu taxi viene de camino"}

                                </Text>
                            </View>

                            <View style={styles.etaBadge}>
                                {solicitud?.faseServicio !==
                                    "en_viaje" && (

                                        <Text style={styles.etaValue}>
                                            {etaTexto}
                                        </Text>

                                    )}
                            </View>
                        </View>

                        <View style={styles.driverCard}>
                            <View style={styles.driverAvatar}>
                                <Ionicons name="person-outline" size={22} color="#111827" />
                            </View>

                            <View style={{ flex: 1 }}>

                                <Text style={styles.driverName}>
                                    {solicitud?.taxista?.nombreCompleto ||
                                        "Taxista asignado"}
                                </Text>


                                {/* VALORACIÓN DEL TAXISTA */}

                                {solicitud?.taxista?.numeroValoraciones > 0 ? (

                                    <View style={styles.driverRatingRow}>

                                        <Ionicons
                                            name="star"
                                            size={15}
                                            color="#f59e0b"
                                        />

                                        <Text style={styles.driverRatingValue}>
                                            {Number(
                                                solicitud.taxista.valoracionMedia
                                            ).toFixed(1)}
                                        </Text>

                                        <Text style={styles.driverRatingCount}>
                                            ·{" "}
                                            {solicitud.taxista.numeroValoraciones}{" "}
                                            {solicitud.taxista.numeroValoraciones === 1
                                                ? "valoración"
                                                : "valoraciones"}
                                        </Text>

                                    </View>

                                ) : (

                                    <View style={styles.driverRatingRow}>

                                        <Ionicons
                                            name="star-outline"
                                            size={14}
                                            color="#94a3b8"
                                        />

                                        <Text style={styles.driverNoRating}>
                                            Sin valoraciones todavía
                                        </Text>

                                    </View>

                                )}


                                <Text style={styles.driverMeta}>
                                    {solicitud?.taxista?.numeroTaxi
                                        ? `Taxi ${solicitud.taxista.numeroTaxi}`
                                        : "Taxi asignado"}
                                </Text>


                                {(solicitud?.taxista?.marca ||
                                    solicitud?.taxista?.modelo) && (

                                        <Text style={styles.driverMeta}>
                                            {[
                                                solicitud?.taxista?.marca,
                                                solicitud?.taxista?.modelo,
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        </Text>

                                    )}


                                {!!solicitud?.taxista?.matricula && (

                                    <Text style={styles.driverMeta}>
                                        {solicitud.taxista.matricula}
                                    </Text>

                                )}

                            </View>
                        </View>

                        <View style={styles.infoCard}>
                            <Text style={styles.infoLabel}>Recogida</Text>
                            <Text style={styles.infoValue}>
                                {solicitud.direccionBase || solicitud.direccionRecogida || "-"}
                            </Text>
                        </View>

                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={abrirMensajes}
                            >
                                <View style={styles.chatIconWrap}>

                                    <Ionicons
                                        name="chatbubble-ellipses-outline"
                                        size={18}
                                        color="#111827"
                                    />

                                    {mensajesNoLeidos > 0 && (
                                        <View style={styles.chatBadge}>
                                            <Text
                                                style={styles.chatBadgeText}
                                            >
                                                {mensajesNoLeidos > 9
                                                    ? "9+"
                                                    : mensajesNoLeidos}
                                            </Text>
                                        </View>
                                    )}

                                </View>

                                <Text style={styles.actionButtonText}>
                                    Mensaje
                                </Text>

                                {mensajesNoLeidos > 0 && (
                                    <View style={styles.messageDot} />
                                )}

                            </TouchableOpacity>
                        </View>
                    </>
                )}

                {solicitud.estado === "sin_taxista" && (
                    <>
                        <Text style={styles.screenTitle}>Sin taxis disponibles</Text>
                        <Text style={styles.subtitle}>
                            No hay taxis libres ahora mismo. Inténtalo de nuevo más tarde.
                        </Text>
                    </>
                )}

                {solicitud.estado === "cancelada" && (
                    <>
                        <Text style={styles.screenTitle}>Solicitud cancelada</Text>
                        <Text style={styles.subtitle}>Tu solicitud ya no está activa.</Text>

                        <TouchableOpacity style={styles.primaryButton} onPress={volverInicio}>
                            <Text style={styles.primaryButtonText}>Nueva solicitud</Text>
                        </TouchableOpacity>
                    </>
                )}

                {solicitud.estado === "completada" && (
                    <>
                        <Text style={styles.screenTitle}>¿Qué tal fue tu viaje?</Text>
                        <Text style={styles.subtitle}>
                            Valora tu experiencia con el taxista.
                        </Text>

                        <View style={styles.ratingRow}>
                            {[1, 2, 3, 4, 5].map((item) => (
                                <TouchableOpacity key={item} onPress={() => setRating(item)}>
                                    <Ionicons
                                        name={item <= rating ? "star" : "star-outline"}
                                        size={30}
                                        color="#f59e0b"
                                    />
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={[styles.primaryButton, enviandoValoracion && { opacity: 0.7 }]}
                            disabled={enviandoValoracion}
                            onPress={async () => {
                                try {
                                    if (!rating) {
                                        Alert.alert("Valoración", "Selecciona una puntuación");
                                        return;
                                    }

                                    setEnviandoValoracion(true);

                                    await api.valorarServicio(solicitud.id, {
                                        rating,
                                        comentario,
                                    });
                                    Alert.alert("Gracias", "Tu valoración se ha guardado", [
                                        {
                                            text: "Aceptar",
                                            onPress: () => volverInicioLimpio(),
                                        },
                                    ]);
                                } catch (error) {
                                    Alert.alert("Error", error.message || "No se pudo guardar la valoración");
                                } finally {
                                    setEnviandoValoracion(false);
                                }
                            }}
                        >
                            <Text style={styles.primaryButtonText}>
                                {enviandoValoracion ? "Enviando..." : "Enviar valoración"}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f8fafc",
    },
    map: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
        paddingHorizontal: 24,
    },
    loadingText: {
        marginTop: 10,
        color: "#334155",
        fontSize: 15,
    },
    backButton: {
        position: "absolute",
        top: 62,
        left: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    bottomCard: {
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 60,
        backgroundColor: "#fff",
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 14,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 8,
    },
    dragHandle: {
        width: 44,
        height: 5,
        borderRadius: 999,
        backgroundColor: "#e2e8f0",
        alignSelf: "center",
        marginBottom: 14,
    },
    heroRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
    },
    screenTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: "#0f172a",
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        lineHeight: 18,
        color: "#64748b",
    },
    etaBadge: {
        minWidth: 82,
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: "#111827",
        alignItems: "center",
    },
    etaValue: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "800",
    },
    etaLabel: {
        color: "#cbd5e1",
        fontSize: 11,
        marginTop: 2,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    searchingCard: {
        marginTop: 18,
        borderRadius: 18,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        paddingVertical: 16,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    searchingText: {
        color: "#0f172a",
        fontSize: 15,
        fontWeight: "600",
    },
    driverCard: {
        marginTop: 14,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
        padding: 12,
        borderRadius: 18,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    driverAvatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: "#ecfdf5",
        alignItems: "center",
        justifyContent: "center",
    },
    driverName: {
        fontSize: 16,
        fontWeight: "800",
        color: "#0f172a",
    },
    driverMeta: {
        marginTop: 3,
        fontSize: 13,
        color: "#475569",
    },
    statsRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    statBox: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        paddingVertical: 14,
        alignItems: "center",
    },
    statValue: {
        fontSize: 18,
        fontWeight: "800",
        color: "#0f172a",
    },
    statLabel: {
        marginTop: 4,
        fontSize: 12,
        color: "#64748b",
        fontWeight: "700",
        textTransform: "uppercase",
    },
    actionRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    actionButton: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: "#ffffff",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    actionButtonText: {
        color: "#111827",
        fontSize: 14,
        fontWeight: "700",
    },
    infoCard: {
        marginTop: 16,
        padding: 14,
        borderRadius: 20,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    infoLabel: {
        fontSize: 12,
        color: "#64748b",
        marginBottom: 4,
        textTransform: "uppercase",
        fontWeight: "700",
    },
    infoValue: {
        fontSize: 15,
        color: "#0f172a",
        lineHeight: 21,
        fontWeight: "600",
    },
    primaryButton: {
        marginTop: 18,
        backgroundColor: "#111827",
        borderRadius: 18,
        paddingVertical: 16,
        alignItems: "center",
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    secondaryButton: {
        marginTop: 16,
        backgroundColor: "#fff",
        borderRadius: 18,
        paddingVertical: 15,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#cbd5e1",
    },
    secondaryButtonText: {
        color: "#0f172a",
        fontSize: 15,
        fontWeight: "700",
    },
    liveHint: {
        marginTop: 14,
        color: "#475569",
        fontSize: 13,
        lineHeight: 19,
    },
    taxiMarker: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#22c55e",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "#ffffff",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
    },
    locateButton: {
        position: "absolute",
        top: 62,
        right: 16,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    ratingRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 10,
        marginTop: 18,
    },
    ratingInput: {
        marginTop: 16,
        minHeight: 90,
        borderRadius: 18,
        backgroundColor: "#f8fafc",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: "#111827",
        textAlignVertical: "top",
    },
    pickupMarkerWrap: {
        alignItems: "center",
        justifyContent: "center",
    },
    chatIconWrap: {
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
    },

    chatBadge: {
        position: "absolute",
        top: -6,
        right: -8,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: "#ef4444",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
    },

    chatBadgeText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
    },
    followButton: {
        position: "absolute",
        top: 62,
        right: 70,
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 22,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    followButtonText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#111827",
    },
    messageLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },

    messageDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#ef4444",
    },
    driverRatingRow: {
        marginTop: 3,

        flexDirection: "row",

        alignItems: "center",

        gap: 3,
    },

    driverRatingValue: {
        fontSize: 13,

        fontWeight: "800",

        color: "#111827",
    },

    driverRatingCount: {
        fontSize: 12,

        color: "#64748b",
    },

    driverNoRating: {
        marginTop: 3,

        fontSize: 12,

        color: "#94a3b8",
    },
    driverRatingRow: {
        marginTop: 3,

        flexDirection: "row",

        alignItems: "center",

        gap: 3,
    },

    driverRatingValue: {
        fontSize: 13,

        fontWeight: "800",

        color: "#111827",
    },

    driverRatingCount: {
        fontSize: 12,

        color: "#64748b",
    },

    driverNoRating: {
        fontSize: 12,

        color: "#94a3b8",

        fontWeight: "600",
    },
});