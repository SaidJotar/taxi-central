import {
    useCallback,
    useEffect,
    useState,
} from "react";

import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Alert,
} from "react-native";

import {
    SafeAreaView,
} from "react-native-safe-area-context";

import {
    Ionicons,
} from "@expo/vector-icons";

import {
    router,
    useLocalSearchParams,
} from "expo-router";

import {
    api,
} from "../src/api/client";


export default function ReservasScreen() {

    const params =
        useLocalSearchParams();


    const telefono =
        typeof params.telefono === "string"
            ? params.telefono
            : "";


    const [
        reservas,
        setReservas,
    ] = useState([]);


    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        actualizando,
        setActualizando,
    ] = useState(false);


    /*
     * =====================================================
     * CARGAR RESERVAS
     * =====================================================
     */
    const cargarReservas =
        useCallback(async (
            mostrarCarga = false
        ) => {

            if (!telefono) {

                setLoading(false);

                return;

            }


            try {

                if (mostrarCarga) {
                    setActualizando(true);
                }


                const res =
                    await api.getReservasCliente(
                        telefono
                    );


                const lista =
                    Array.isArray(res?.reservas)
                        ? res.reservas
                        : [];


                setReservas(
                    lista
                );


            } catch (error) {

                console.log(
                    "Error cargando reservas:",
                    error
                );


            } finally {

                setLoading(false);

                setActualizando(false);

            }

        }, [
            telefono,
        ]);


    /*
     * =====================================================
     * CARGA INICIAL + POLLING
     * =====================================================
     */
    useEffect(() => {

        cargarReservas();


        /*
         * Cada 5 segundos comprobamos
         * si un taxista ha aceptado.
         */
        const interval =
            setInterval(
                cargarReservas,
                5000
            );


        return () => {

            clearInterval(
                interval
            );

        };

    }, [
        cargarReservas,
    ]);


    /*
     * =====================================================
     * CANCELAR RESERVA
     * =====================================================
     */
    function preguntarCancelar(
        reserva
    ) {

        Alert.alert(
            "Cancelar reserva",
            "¿Seguro que quieres cancelar esta reserva?",
            [
                {
                    text:
                        "No",

                    style:
                        "cancel",
                },

                {
                    text:
                        "Sí, cancelar",

                    style:
                        "destructive",

                    onPress:
                        async () => {

                            try {

                                await api.cancelarReserva(
                                    reserva.id
                                );


                                await cargarReservas(
                                    true
                                );


                            } catch (error) {

                                console.log(
                                    "Error cancelando reserva:",
                                    error
                                );


                                Alert.alert(
                                    "No se pudo cancelar",
                                    error.message ||
                                    "Inténtalo de nuevo."
                                );

                            }

                        },
                },
            ]
        );

    }


    /*
     * =====================================================
     * SIN TELÉFONO
     * =====================================================
     */
    if (!telefono) {

        return (

            <SafeAreaView
                style={
                    styles.container
                }
            >

                <View
                    style={
                        styles.header
                    }
                >

                    <TouchableOpacity
                        style={
                            styles.backButton
                        }
                        onPress={() =>
                            router.back()
                        }
                    >

                        <Ionicons
                            name="chevron-back"
                            size={26}
                            color="#111827"
                        />

                    </TouchableOpacity>


                    <Text
                        style={
                            styles.headerTitle
                        }
                    >
                        Mis reservas
                    </Text>


                    <View
                        style={{
                            width: 42,
                        }}
                    />

                </View>


                <View
                    style={
                        styles.centered
                    }
                >

                    <Ionicons
                        name="call-outline"
                        size={48}
                        color="#94a3b8"
                    />


                    <Text
                        style={
                            styles.emptyTitle
                        }
                    >
                        No hay teléfono asociado
                    </Text>


                    <Text
                        style={
                            styles.emptyText
                        }
                    >
                        Necesitas un número de teléfono para consultar tus reservas.
                    </Text>


                    <TouchableOpacity
                        style={
                            styles.homeButton
                        }
                        onPress={() =>
                            router.back()
                        }
                    >

                        <Text
                            style={
                                styles.homeButtonText
                            }
                        >
                            Volver al inicio
                        </Text>

                    </TouchableOpacity>

                </View>

            </SafeAreaView>

        );

    }


    /*
     * =====================================================
     * PANTALLA
     * =====================================================
     */
    return (

        <SafeAreaView
            style={
                styles.container
            }
            edges={[
                "top",
                "bottom",
            ]}
        >

            {/* HEADER */}

            <View
                style={
                    styles.header
                }
            >

                <TouchableOpacity
                    style={
                        styles.backButton
                    }
                    onPress={() =>
                        router.back()
                    }
                >

                    <Ionicons
                        name="chevron-back"
                        size={26}
                        color="#111827"
                    />

                </TouchableOpacity>


                <Text
                    style={
                        styles.headerTitle
                    }
                >
                    Mis reservas
                </Text>


                <TouchableOpacity
                    style={
                        styles.refreshButton
                    }
                    onPress={() =>
                        cargarReservas(
                            true
                        )
                    }
                    disabled={
                        actualizando
                    }
                >

                    {actualizando ? (

                        <ActivityIndicator
                            size="small"
                            color="#111827"
                        />

                    ) : (

                        <Ionicons
                            name="refresh-outline"
                            size={22}
                            color="#111827"
                        />

                    )}

                </TouchableOpacity>

            </View>


            {/* LOADING */}

            {loading ? (

                <View
                    style={
                        styles.centered
                    }
                >

                    <ActivityIndicator
                        size="large"
                        color="#111827"
                    />


                    <Text
                        style={
                            styles.loadingText
                        }
                    >
                        Cargando tus reservas…
                    </Text>

                </View>

            ) : reservas.length === 0 ? (

                /*
                 * =================================================
                 * SIN RESERVAS
                 * =================================================
                 */

                <View
                    style={
                        styles.centered
                    }
                >

                    <View
                        style={
                            styles.emptyIcon
                        }
                    >

                        <Ionicons
                            name="calendar-outline"
                            size={38}
                            color="#64748b"
                        />

                    </View>


                    <Text
                        style={
                            styles.emptyTitle
                        }
                    >
                        No tienes reservas
                    </Text>


                    <Text
                        style={
                            styles.emptyText
                        }
                    >
                        Cuando reserves un taxi, podrás consultar aquí su estado.
                    </Text>


                    <TouchableOpacity
                        style={
                            styles.homeButton
                        }
                        onPress={() =>
                            router.replace("/")
                        }
                    >

                        <Ionicons
                            name="calendar-outline"
                            size={18}
                            color="#fff"
                        />

                        <Text
                            style={
                                styles.homeButtonText
                            }
                        >
                            Hacer una reserva
                        </Text>

                    </TouchableOpacity>

                </View>

            ) : (

                /*
                 * =================================================
                 * LISTA RESERVAS
                 * =================================================
                 */

                <ScrollView
                    contentContainerStyle={
                        styles.content
                    }
                    showsVerticalScrollIndicator={
                        false
                    }
                >

                    {reservas.map(
                        (reserva) => {

                            const puedeCancelar =
                                reserva.estado === "pendiente" ||
                                reserva.estado === "aceptada";


                            return (

                                <View
                                    key={
                                        reserva.id
                                    }
                                    style={
                                        styles.card
                                    }
                                >

                                    {/* CABECERA */}

                                    <View
                                        style={
                                            styles.cardTop
                                        }
                                    >

                                        <View>

                                            <Text
                                                style={
                                                    styles.date
                                                }
                                            >
                                                {formatearFecha(
                                                    reserva.fechaHora
                                                )}
                                            </Text>


                                            <Text
                                                style={
                                                    styles.hour
                                                }
                                            >
                                                {formatearHora(
                                                    reserva.fechaHora
                                                )}
                                            </Text>

                                        </View>


                                        {reserva.precioFinal != null && (

                                            <View
                                                style={
                                                    styles.priceBox
                                                }
                                            >

                                                <Text
                                                    style={
                                                        styles.price
                                                    }
                                                >
                                                    {reserva.precioFinal} €
                                                </Text>


                                                <Text
                                                    style={
                                                        styles.priceLabel
                                                    }
                                                >
                                                    Precio final
                                                </Text>

                                            </View>

                                        )}

                                    </View>


                                    {/* DIRECCIÓN */}

                                    <View
                                        style={
                                            styles.addressRow
                                        }
                                    >

                                        <View
                                            style={
                                                styles.addressIcon
                                            }
                                        >

                                            <Ionicons
                                                name="location-outline"
                                                size={18}
                                                color="#111827"
                                            />

                                        </View>


                                        <View
                                            style={{
                                                flex: 1,
                                            }}
                                        >

                                            <Text
                                                style={
                                                    styles.smallLabel
                                                }
                                            >
                                                Recogida
                                            </Text>


                                            <Text
                                                style={
                                                    styles.address
                                                }
                                            >
                                                {reserva.direccionRecogida}
                                            </Text>

                                        </View>

                                    </View>


                                    {/* REFERENCIA */}

                                    {reserva.referenciaRecogida ? (

                                        <View
                                            style={
                                                styles.referenceRow
                                            }
                                        >

                                            <Ionicons
                                                name="chatbubble-outline"
                                                size={16}
                                                color="#64748b"
                                            />


                                            <Text
                                                style={
                                                    styles.referenceText
                                                }
                                            >
                                                {reserva.referenciaRecogida}
                                            </Text>

                                        </View>

                                    ) : null}


                                    {/* ESTADO */}

                                    <EstadoReserva
                                        reserva={
                                            reserva
                                        }
                                    />


                                    {/* TAXISTA */}

                                    {reserva.estado === "aceptada" &&
                                        reserva.taxista && (

                                            <View
                                                style={
                                                    styles.taxiBox
                                                }
                                            >

                                                <View
                                                    style={
                                                        styles.taxiIcon
                                                    }
                                                >

                                                    <Ionicons
                                                        name="car-outline"
                                                        size={22}
                                                        color="#111827"
                                                    />

                                                </View>


                                                <View
                                                    style={{
                                                        flex: 1,
                                                    }}
                                                >

                                                    <Text
                                                        style={
                                                            styles.smallLabel
                                                        }
                                                    >
                                                        Taxi asignado
                                                    </Text>


                                                    <Text
                                                        style={
                                                            styles.taxiValue
                                                        }
                                                    >
                                                        {reserva.taxista
                                                            ?.vehiculo
                                                            ?.numeroTaxi
                                                            ? `Taxi ${reserva.taxista.vehiculo.numeroTaxi}`
                                                            : "Taxi asignado"}
                                                    </Text>


                                                    {reserva.taxista
                                                        ?.nombreCompleto ? (

                                                        <Text
                                                            style={
                                                                styles.driverName
                                                            }
                                                        >
                                                            {reserva.taxista.nombreCompleto}
                                                        </Text>

                                                    ) : null}

                                                </View>

                                            </View>

                                        )}


                                    {/* INFORMACIÓN PRECIO */}

                                    {reserva.tipo === "normal" &&
                                        reserva.precioFinal != null && (

                                            <View
                                                style={
                                                    styles.includedBox
                                                }
                                            >

                                                <Text
                                                    style={
                                                        styles.includedText
                                                    }
                                                >
                                                    Precio cerrado · Equipaje y espera incluidos
                                                </Text>

                                            </View>

                                        )}


                                    {/* CANCELAR */}

                                    {puedeCancelar && (

                                        <TouchableOpacity
                                            style={
                                                styles.cancelButton
                                            }
                                            onPress={() =>
                                                preguntarCancelar(
                                                    reserva
                                                )
                                            }
                                        >

                                            <Text
                                                style={
                                                    styles.cancelText
                                                }
                                            >
                                                Cancelar reserva
                                            </Text>

                                        </TouchableOpacity>

                                    )}

                                </View>

                            );

                        }
                    )}


                    <View
                        style={{
                            height: 20,
                        }}
                    />

                </ScrollView>

            )}

        </SafeAreaView>

    );

}


/*
 * =====================================================
 * ESTADO RESERVA
 * =====================================================
 */
function EstadoReserva({
    reserva,
}) {

    let texto =
        "Pendiente de taxista";

    let icono =
        "time-outline";

    let style =
        styles.statusPending;


    if (
        reserva.estado ===
        "aceptada"
    ) {

        texto =
            "Reserva aceptada";

        icono =
            "checkmark-circle";

        style =
            styles.statusAccepted;

    } else if (
        reserva.estado ===
        "cancelada"
    ) {

        texto =
            "Reserva cancelada";

        icono =
            "close-circle-outline";

        style =
            styles.statusCancelled;

    } else if (
        reserva.estado ===
        "en_servicio"
    ) {

        texto =
            "Servicio en curso";

        icono =
            "car-outline";

        style =
            styles.statusAccepted;

    } else if (
        reserva.estado ===
        "completada"
    ) {

        texto =
            "Reserva completada";

        icono =
            "checkmark-done-circle-outline";

        style =
            styles.statusCompleted;

    }


    return (

        <View
            style={[
                styles.statusRow,
                style,
            ]}
        >

            <Ionicons
                name={
                    icono
                }
                size={19}
                color="#111827"
            />


            <Text
                style={
                    styles.statusText
                }
            >
                {texto}
            </Text>

        </View>

    );

}


/*
 * =====================================================
 * FORMATO FECHA
 * =====================================================
 */

function formatearFecha(
    valor
) {

    if (!valor) {
        return "";
    }


    const fecha =
        new Date(
            valor
        );


    return fecha.toLocaleDateString(
        "es-ES",
        {
            weekday:
                "short",

            day:
                "numeric",

            month:
                "long",

            year:
                "numeric",
        }
    );

}


function formatearHora(
    valor
) {

    if (!valor) {
        return "";
    }


    const fecha =
        new Date(
            valor
        );


    return fecha.toLocaleTimeString(
        "es-ES",
        {
            hour:
                "2-digit",

            minute:
                "2-digit",

            hour12:
                false,
        }
    );

}


/*
 * =====================================================
 * ESTILOS
 * =====================================================
 */

const styles =
    StyleSheet.create({

        container: {
            flex: 1,
            backgroundColor:
                "#f8fafc",
        },


        header: {
            height: 60,

            paddingHorizontal:
                12,

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "space-between",

            backgroundColor:
                "#ffffff",

            borderBottomWidth:
                1,

            borderBottomColor:
                "#e2e8f0",
        },


        backButton: {
            width: 42,
            height: 42,

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        refreshButton: {
            width: 42,
            height: 42,

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        headerTitle: {
            fontSize:
                18,

            fontWeight:
                "800",

            color:
                "#111827",
        },


        content: {
            padding:
                16,

            gap:
                12,
        },


        centered: {
            flex: 1,

            alignItems:
                "center",

            justifyContent:
                "center",

            padding:
                30,
        },


        loadingText: {
            marginTop:
                10,

            color:
                "#64748b",

            fontSize:
                14,
        },


        emptyIcon: {
            width: 72,
            height: 72,

            borderRadius:
                36,

            backgroundColor:
                "#f1f5f9",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        emptyTitle: {
            marginTop:
                14,

            fontSize:
                19,

            fontWeight:
                "800",

            color:
                "#111827",
        },


        emptyText: {
            marginTop:
                6,

            maxWidth:
                280,

            fontSize:
                14,

            lineHeight:
                20,

            color:
                "#64748b",

            textAlign:
                "center",
        },


        homeButton: {
            marginTop:
                20,

            minHeight:
                50,

            paddingHorizontal:
                22,

            borderRadius:
                16,

            backgroundColor:
                "#111827",

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "center",

            gap:
                8,
        },


        homeButtonText: {
            color:
                "#ffffff",

            fontSize:
                15,

            fontWeight:
                "800",
        },


        card: {
            padding:
                16,

            borderRadius:
                20,

            backgroundColor:
                "#ffffff",

            borderWidth:
                1,

            borderColor:
                "#e2e8f0",
        },


        cardTop: {
            flexDirection:
                "row",

            alignItems:
                "flex-start",

            justifyContent:
                "space-between",

            gap:
                10,
        },


        date: {
            fontSize:
                13,

            color:
                "#64748b",

            fontWeight:
                "700",

            textTransform:
                "capitalize",
        },


        hour: {
            marginTop:
                2,

            fontSize:
                27,

            fontWeight:
                "900",

            color:
                "#111827",
        },


        priceBox: {
            alignItems:
                "flex-end",
        },


        price: {
            fontSize:
                25,

            fontWeight:
                "900",

            color:
                "#111827",
        },


        priceLabel: {
            marginTop:
                1,

            fontSize:
                10,

            color:
                "#64748b",

            fontWeight:
                "700",
        },


        addressRow: {
            marginTop:
                16,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                10,
        },


        addressIcon: {
            width: 38,
            height: 38,

            borderRadius:
                19,

            backgroundColor:
                "#f1f5f9",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        smallLabel: {
            fontSize:
                10,

            fontWeight:
                "700",

            color:
                "#64748b",

            textTransform:
                "uppercase",
        },


        address: {
            marginTop:
                2,

            flex: 1,

            fontSize:
                14,

            fontWeight:
                "700",

            color:
                "#111827",

            lineHeight:
                19,
        },


        referenceRow: {
            marginTop:
                12,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                7,

            paddingHorizontal:
                3,
        },


        referenceText: {
            flex: 1,

            fontSize:
                13,

            color:
                "#64748b",
        },


        statusRow: {
            marginTop:
                15,

            minHeight:
                44,

            borderRadius:
                14,

            paddingHorizontal:
                12,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                8,
        },


        statusPending: {
            backgroundColor:
                "#fef3c7",
        },


        statusAccepted: {
            backgroundColor:
                "#dcfce7",
        },


        statusCancelled: {
            backgroundColor:
                "#fee2e2",
        },


        statusCompleted: {
            backgroundColor:
                "#e2e8f0",
        },


        statusText: {
            fontSize:
                14,

            fontWeight:
                "800",

            color:
                "#111827",
        },


        taxiBox: {
            marginTop:
                12,

            padding:
                13,

            borderRadius:
                15,

            backgroundColor:
                "#f8fafc",

            borderWidth:
                1,

            borderColor:
                "#e2e8f0",

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                11,
        },


        taxiIcon: {
            width: 42,
            height: 42,

            borderRadius:
                21,

            backgroundColor:
                "#e2e8f0",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        taxiValue: {
            marginTop:
                2,

            fontSize:
                17,

            fontWeight:
                "900",

            color:
                "#111827",
        },


        driverName: {
            marginTop:
                2,

            fontSize:
                13,

            color:
                "#475569",
        },


        includedBox: {
            marginTop:
                11,

            padding:
                10,

            borderRadius:
                12,

            backgroundColor:
                "#f8fafc",
        },


        includedText: {
            fontSize:
                12,

            fontWeight:
                "600",

            color:
                "#64748b",

            textAlign:
                "center",
        },


        cancelButton: {
            marginTop:
                10,

            minHeight:
                42,

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        cancelText: {
            color:
                "#dc2626",

            fontSize:
                13,

            fontWeight:
                "800",
        },

    });