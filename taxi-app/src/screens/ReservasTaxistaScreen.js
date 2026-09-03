import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
} from "react-native";

import {
    SafeAreaView,
} from "react-native-safe-area-context";

import {
    Ionicons,
} from "@expo/vector-icons";

import {
    useAuth,
} from "../context/AuthContext";

import {
    getSocket,
} from "../api/socket";


export default function ReservasTaxistaScreen({
    onClose,
    pestañaInicial = "disponibles",
}) {

    const {
        token,
    } = useAuth();


    const API_BASE_URL = (
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        "https://api.sjaceuta.es"
    ).replace(/\/$/, "");


    const socket =
        useMemo(
            () =>
                getSocket(token),
            [token]
        );


    const [
        pestana,
        setPestana,
    ] = useState(
        pestañaInicial
    );


    const [
        disponibles,
        setDisponibles,
    ] = useState([]);


    const [
        mias,
        setMias,
    ] = useState([]);


    const [
        loading,
        setLoading,
    ] = useState(true);


    const [
        actualizando,
        setActualizando,
    ] = useState(false);


    const [
        aceptandoId,
        setAceptandoId,
    ] = useState(null);


    /*
     * =====================================================
     * REQUEST AUTENTICADO
     * =====================================================
     */

    const request =
        useCallback(async (
            path,
            options = {}
        ) => {

            const response =
                await fetch(
                    `${API_BASE_URL}${path}`,
                    {
                        ...options,

                        headers: {
                            Accept:
                                "application/json",

                            Authorization:
                                `Bearer ${token}`,

                            ...(options.body
                                ? {
                                    "Content-Type":
                                        "application/json",
                                }
                                : {}),

                            ...(options.headers ||
                                {}),
                        },
                    }
                );


            let data =
                null;


            try {

                data =
                    await response.json();

            } catch {

                data =
                    null;

            }


            if (!response.ok) {

                throw new Error(
                    data?.error ||
                    data?.message ||
                    `Error ${response.status}`
                );

            }


            return data;

        }, [
            API_BASE_URL,
            token,
        ]);


    /*
     * =====================================================
     * CARGAR DISPONIBLES
     * =====================================================
     */

    const cargarDisponibles =
        useCallback(async () => {

            const res =
                await request(
                    "/mobile/reservas/disponibles"
                );


            setDisponibles(
                Array.isArray(
                    res?.reservas
                )
                    ? res.reservas
                    : []
            );

        }, [
            request,
        ]);


    /*
     * =====================================================
     * CARGAR MIS RESERVAS
     * =====================================================
     */

    const cargarMias =
        useCallback(async () => {

            const res =
                await request(
                    "/mobile/reservas/mias"
                );


            setMias(
                Array.isArray(
                    res?.reservas
                )
                    ? res.reservas
                    : []
            );

        }, [
            request,
        ]);


    /*
     * =====================================================
     * CARGAR TODO
     * =====================================================
     */

    const cargarTodo =
        useCallback(async (
            mostrarIndicador = false
        ) => {

            try {

                if (mostrarIndicador) {
                    setActualizando(true);
                }


                await Promise.all([
                    cargarDisponibles(),
                    cargarMias(),
                ]);


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
            cargarDisponibles,
            cargarMias,
        ]);


    /*
     * =====================================================
     * SOCKET
     * =====================================================
     */

    useEffect(() => {

        if (!socket) {
            return;
        }


        /*
         * Cliente cancela.
         */
        const onReservaCancelada = (
            data
        ) => {

            const reservaId =
                data?.reservaId;


            if (!reservaId) {
                return;
            }


            setDisponibles(
                (actual) =>
                    actual.filter(
                        (item) =>
                            item.id !==
                            reservaId
                    )
            );


            setMias(
                (actual) =>
                    actual.filter(
                        (item) =>
                            item.id !==
                            reservaId
                    )
            );

        };


        /*
         * Otro taxista acepta.
         */
        const onReservaAceptada = (
            data
        ) => {

            if (
                !data?.reservaId
            ) {
                return;
            }


            setDisponibles(
                (actual) =>
                    actual.filter(
                        (item) =>
                            item.id !==
                            data.reservaId
                    )
            );

        };


        /*
         * Nueva reserva.
         */
        const onNuevaReserva = () => {

            cargarDisponibles();

        };


        socket.on(
            "reserva:cancelada",
            onReservaCancelada
        );


        socket.on(
            "reserva:aceptada",
            onReservaAceptada
        );


        socket.on(
            "reserva:nueva",
            onNuevaReserva
        );


        return () => {

            socket.off(
                "reserva:cancelada",
                onReservaCancelada
            );


            socket.off(
                "reserva:aceptada",
                onReservaAceptada
            );


            socket.off(
                "reserva:nueva",
                onNuevaReserva
            );

        };

    }, [
        socket,
        cargarDisponibles,
    ]);


    /*
     * =====================================================
     * CARGA INICIAL + POLLING
     * =====================================================
     */

    useEffect(() => {

        cargarTodo();


        const interval =
            setInterval(
                () =>
                    cargarTodo(),
                15000
            );


        return () =>
            clearInterval(
                interval
            );

    }, [
        cargarTodo,
    ]);


    /*
     * =====================================================
     * CONFIRMAR ACEPTACIÓN
     * =====================================================
     */

    function confirmarAceptar(
        reserva
    ) {

        Alert.alert(
            "Aceptar reserva",

            `¿Quieres quedarte con la reserva del ${formatearFechaCompleta(
                reserva.fechaHora
            )} por ${reserva.precioFinal} €?`,

            [
                {
                    text:
                        "Cancelar",

                    style:
                        "cancel",
                },

                {
                    text:
                        "Aceptar reserva",

                    onPress: () =>
                        aceptarReserva(
                            reserva
                        ),
                },
            ]
        );

    }


    /*
     * =====================================================
     * ACEPTAR RESERVA
     * =====================================================
     */

    async function aceptarReserva(
        reserva
    ) {

        try {

            setAceptandoId(
                reserva.id
            );


            const res =
                await request(
                    `/mobile/reservas/${encodeURIComponent(
                        reserva.id
                    )}/aceptar`,
                    {
                        method:
                            "POST",
                    }
                );


            /*
             * Quitamos de disponibles.
             */
            setDisponibles(
                (actual) =>
                    actual.filter(
                        (item) =>
                            item.id !==
                            reserva.id
                    )
            );


            /*
             * Añadimos a Mis reservas.
             */
            if (
                res?.reserva
            ) {

                setMias(
                    (actual) => {

                        const existe =
                            actual.some(
                                (item) =>
                                    item.id ===
                                    res.reserva.id
                            );


                        if (existe) {
                            return actual;
                        }


                        return [
                            ...actual,
                            res.reserva,
                        ].sort(
                            (
                                a,
                                b
                            ) =>
                                new Date(
                                    a.fechaHora
                                ).getTime() -
                                new Date(
                                    b.fechaHora
                                ).getTime()
                        );

                    }
                );

            }


            setPestana(
                "mias"
            );


            Alert.alert(
                "Reserva aceptada",
                "La reserva ya está asignada a tu taxi."
            );


        } catch (error) {

            Alert.alert(
                "No se pudo aceptar",
                error.message ||
                "Puede que otro taxista haya aceptado la reserva antes."
            );


            await cargarTodo();


        } finally {

            setAceptandoId(
                null
            );

        }

    }


    /*
     * =====================================================
     * LISTA ACTUAL
     * =====================================================
     */

    const lista =
        pestana ===
            "disponibles"
            ? disponibles
            : mias;


    /*
     * =====================================================
     * RENDER
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

            {/* =================================================
          SUBMENÚ DE INICIO
      ================================================= */}

            <View style={styles.reservasTopRow}>

                <TouchableOpacity
                    style={styles.backButton}
                    onPress={onClose}
                >
                    <Ionicons
                        name="arrow-back"
                        size={21}
                        color="#111827"
                    />
                </TouchableOpacity>


                <Text style={styles.reservasTopTitle}>
                    Reservas
                </Text>


                <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={() =>
                        cargarTodo(true)
                    }
                    disabled={actualizando}
                >
                    {actualizando ? (
                        <ActivityIndicator
                            size="small"
                            color="#111827"
                        />
                    ) : (
                        <Ionicons
                            name="refresh-outline"
                            size={20}
                            color="#111827"
                        />
                    )}
                </TouchableOpacity>

            </View>


            {/* =================================================
          PESTAÑAS
      ================================================= */}

            <View
                style={
                    styles.tabs
                }
            >

                <TouchableOpacity

                    style={[
                        styles.tab,

                        pestana ===
                        "disponibles" &&
                        styles.tabActive,
                    ]}

                    onPress={() =>
                        setPestana(
                            "disponibles"
                        )
                    }

                >

                    <View
                        style={
                            styles.tabRow
                        }
                    >

                        <Text

                            style={[
                                styles.tabText,

                                pestana ===
                                "disponibles" &&
                                styles.tabTextActive,
                            ]}

                        >
                            Disponibles
                        </Text>


                        {disponibles.length >
                            0 && (

                                <View
                                    style={
                                        styles.tabBadge
                                    }
                                >

                                    <Text
                                        style={
                                            styles.tabBadgeText
                                        }
                                    >

                                        {disponibles.length >
                                            99
                                            ? "99+"
                                            : disponibles.length}

                                    </Text>

                                </View>

                            )}

                    </View>

                </TouchableOpacity>


                <TouchableOpacity

                    style={[
                        styles.tab,

                        pestana ===
                        "mias" &&
                        styles.tabActive,
                    ]}

                    onPress={() =>
                        setPestana(
                            "mias"
                        )
                    }

                >

                    <Text

                        style={[
                            styles.tabText,

                            pestana ===
                            "mias" &&
                            styles.tabTextActive,
                        ]}

                    >
                        Mis reservas
                    </Text>

                </TouchableOpacity>

            </View>


            {/* =================================================
          LOADING
      ================================================= */}

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
                        Cargando reservas…
                    </Text>

                </View>

            ) : lista.length ===
                0 ? (

                /*
                 * =================================================
                 * VACÍO
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
                            size={32}
                            color="#64748b"
                        />

                    </View>


                    <Text
                        style={
                            styles.emptyTitle
                        }
                    >

                        {pestana ===
                            "disponibles"
                            ? "No hay reservas disponibles"
                            : "No tienes reservas"}

                    </Text>


                    <Text
                        style={
                            styles.emptyText
                        }
                    >

                        {pestana ===
                            "disponibles"
                            ? "Cuando un cliente reserve un taxi aparecerá aquí."
                            : "Las reservas que aceptes aparecerán aquí."}

                    </Text>

                </View>

            ) : (

                /*
                 * =================================================
                 * RESERVAS
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

                    {lista.map(
                        (
                            reserva
                        ) => (

                            <ReservaCard

                                key={
                                    reserva.id
                                }

                                reserva={
                                    reserva
                                }

                                esDisponible={
                                    pestana ===
                                    "disponibles"
                                }

                                aceptando={
                                    aceptandoId ===
                                    reserva.id
                                }

                                onAceptar={() =>
                                    confirmarAceptar(
                                        reserva
                                    )
                                }

                            />

                        )
                    )}

                </ScrollView>

            )}

        </SafeAreaView>

    );

}


/*
 * =====================================================
 * CARD RESERVA
 * =====================================================
 */

function ReservaCard({
    reserva,
    esDisponible,
    aceptando,
    onAceptar,
}) {

    return (

        <View
            style={
                styles.card
            }
        >

            {/* FECHA + PRECIO */}

            <View
                style={
                    styles.cardHeader
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


                {reserva.precioFinal !=
                    null && (

                        <View
                            style={
                                styles.priceWrap
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


            {/* RECOGIDA */}

            <View
                style={
                    styles.infoRow
                }
            >

                <View
                    style={
                        styles.infoIcon
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
                            styles.infoValue
                        }
                    >
                        {reserva.direccionBase ||
                            reserva.direccionRecogida ||
                            "-"}
                    </Text>

                </View>

            </View>


            {/* TELÉFONO */}

            <View
                style={
                    styles.phoneRow
                }
            >

                <View
                    style={
                        styles.phoneIcon
                    }
                >

                    <Ionicons
                        name="call-outline"
                        size={17}
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
                        Teléfono cliente
                    </Text>


                    <Text
                        style={
                            styles.phoneValue
                        }
                    >
                        {reserva.telefonoCliente ||
                            "-"}
                    </Text>

                </View>

            </View>


            {/* REFERENCIA */}

            {reserva.referenciaRecogida ? (

                <View
                    style={
                        styles.referenceBox
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


            {/* BOTÓN */}

            {esDisponible ? (

                <TouchableOpacity

                    style={[
                        styles.acceptButton,

                        aceptando && {
                            opacity:
                                0.6,
                        },
                    ]}

                    disabled={
                        aceptando
                    }

                    onPress={
                        onAceptar
                    }

                >

                    {aceptando ? (

                        <ActivityIndicator
                            color="#fff"
                        />

                    ) : (

                        <>

                            <Ionicons
                                name="checkmark-circle-outline"
                                size={19}
                                color="#fff"
                            />


                            <Text
                                style={
                                    styles.acceptButtonText
                                }
                            >
                                Aceptar reserva
                            </Text>

                        </>

                    )}

                </TouchableOpacity>

            ) : (

                <View
                    style={
                        styles.assignedBox
                    }
                >

                    <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#166534"
                    />


                    <Text
                        style={
                            styles.assignedText
                        }
                    >
                        Esta reserva es tuya
                    </Text>

                </View>

            )}

        </View>

    );

}


/*
 * =====================================================
 * FECHAS
 * =====================================================
 */

function formatearFecha(
    valor
) {

    return new Date(
        valor
    ).toLocaleDateString(
        "es-ES",
        {
            weekday:
                "short",

            day:
                "numeric",

            month:
                "long",
        }
    );

}


function formatearHora(
    valor
) {

    return new Date(
        valor
    ).toLocaleTimeString(
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


function formatearFechaCompleta(
    valor
) {

    return new Date(
        valor
    ).toLocaleString(
        "es-ES",
        {
            weekday:
                "long",

            day:
                "numeric",

            month:
                "long",

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
 * STYLES
 * =====================================================
 */

const styles =
    StyleSheet.create({

        container: {
            flex: 1,

            backgroundColor:
                "#f8fafc",
        },


        /*
         * SUBMENÚ
         */

        backButton: {
            width: 38,
            height: 38,

            alignItems:
                "center",

            justifyContent:
                "center",
        },

        reservasTopRow: {
            height: 46,

            paddingHorizontal: 8,

            flexDirection: "row",

            alignItems: "center",

            backgroundColor: "#f8fafc",
        },

        backButton: {
            width: 38,
            height: 38,

            alignItems: "center",

            justifyContent: "center",
        },

        reservasTopTitle: {
            flex: 1,

            fontSize: 15,

            fontWeight: "800",

            color: "#111827",

            marginLeft: 2,
        },

        refreshButton: {
            width: 38,
            height: 38,

            alignItems: "center",

            justifyContent: "center",
        },

        refreshButton: {
            width: 38,
            height: 38,

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        /*
         * PESTAÑAS
         */

        tabs: {
            marginHorizontal: 10,

            marginTop: 2,

            marginBottom: 7,

            padding: 3,

            borderRadius: 12,

            backgroundColor: "#e2e8f0",

            flexDirection: "row",
        },


        tab: {
            flex: 1,

            minHeight: 37,

            borderRadius:
                9,

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        tabActive: {
            backgroundColor:
                "#ffffff",
        },


        tabRow: {
            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                5,
        },


        tabText: {
            fontSize: 12,

            fontWeight:
                "700",

            color:
                "#64748b",
        },


        tabTextActive: {
            color:
                "#111827",
        },


        tabBadge: {
            minWidth: 18,

            height: 18,

            borderRadius:
                9,

            paddingHorizontal:
                4,

            backgroundColor:
                "#ef4444",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        tabBadgeText: {
            color:
                "#fff",

            fontSize: 9,

            fontWeight:
                "800",
        },


        /*
         * LISTA
         */

        content: {
            paddingHorizontal:
                10,

            paddingBottom:
                25,

            gap:
                9,
        },


        centered: {
            flex: 1,

            alignItems:
                "center",

            justifyContent:
                "center",

            padding:
                25,
        },


        loadingText: {
            marginTop:
                8,

            fontSize:
                12,

            color:
                "#64748b",
        },


        /*
         * VACÍO
         */

        emptyIcon: {
            width: 60,
            height: 60,

            borderRadius:
                30,

            backgroundColor:
                "#e2e8f0",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        emptyTitle: {
            marginTop:
                12,

            fontSize: 16,

            fontWeight:
                "800",

            color:
                "#111827",
        },


        emptyText: {
            marginTop:
                4,

            maxWidth:
                260,

            textAlign:
                "center",

            fontSize: 12,

            lineHeight:
                18,

            color:
                "#64748b",
        },


        /*
         * CARD
         */

        card: {
            padding:
                13,

            borderRadius:
                17,

            backgroundColor:
                "#fff",

            borderWidth:
                1,

            borderColor:
                "#e2e8f0",
        },


        cardHeader: {
            flexDirection:
                "row",

            justifyContent:
                "space-between",

            alignItems:
                "flex-start",

            gap:
                8,
        },


        date: {
            fontSize: 12,

            fontWeight:
                "700",

            color:
                "#64748b",

            textTransform:
                "capitalize",
        },


        hour: {
            marginTop:
                1,

            fontSize: 23,

            lineHeight: 27,

            fontWeight:
                "900",

            color:
                "#111827",
        },


        priceWrap: {
            alignItems:
                "flex-end",
        },


        price: {
            fontSize: 22,

            fontWeight:
                "900",

            color:
                "#111827",
        },


        priceLabel: {
            fontSize: 9,

            color:
                "#64748b",
        },


        /*
         * INFO
         */

        infoRow: {
            marginTop:
                11,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                8,
        },


        infoIcon: {
            width: 34,
            height: 34,

            borderRadius:
                17,

            backgroundColor:
                "#f1f5f9",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        smallLabel: {
            fontSize: 9,

            fontWeight:
                "700",

            color:
                "#64748b",

            textTransform:
                "uppercase",
        },


        infoValue: {
            marginTop:
                1,

            fontSize: 13,

            lineHeight:
                18,

            fontWeight:
                "700",

            color:
                "#111827",
        },


        /*
         * TELÉFONO
         */

        phoneRow: {
            marginTop:
                9,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                8,
        },


        phoneIcon: {
            width: 34,
            height: 34,

            borderRadius:
                17,

            backgroundColor:
                "#f1f5f9",

            alignItems:
                "center",

            justifyContent:
                "center",
        },


        phoneValue: {
            marginTop:
                1,

            fontSize: 14,

            fontWeight:
                "800",

            color:
                "#111827",
        },


        /*
         * REFERENCIA
         */

        referenceBox: {
            marginTop:
                9,

            paddingTop:
                8,

            borderTopWidth:
                1,

            borderTopColor:
                "#e2e8f0",

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                6,
        },


        referenceText: {
            flex: 1,

            fontSize: 12,

            color:
                "#64748b",
        },


        /*
         * ACEPTAR
         */

        acceptButton: {
            marginTop:
                11,

            minHeight:
                44,

            borderRadius:
                13,

            backgroundColor:
                "#111827",

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "center",

            gap:
                7,
        },


        acceptButtonText: {
            color:
                "#fff",

            fontSize: 13,

            fontWeight:
                "800",
        },


        /*
         * ASIGNADA
         */

        assignedBox: {
            marginTop:
                11,

            minHeight:
                40,

            paddingHorizontal:
                10,

            borderRadius:
                12,

            backgroundColor:
                "#dcfce7",

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                6,
        },


        assignedText: {
            color:
                "#166534",

            fontSize: 12,

            fontWeight:
                "800",
        },

    });