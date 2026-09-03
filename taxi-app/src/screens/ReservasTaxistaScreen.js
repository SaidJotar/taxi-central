import React, {
    useCallback,
    useEffect,
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
}) {

    const {
        token,
    } = useAuth();


    const API_BASE_URL = (
        process.env.EXPO_PUBLIC_API_BASE_URL ||
        "https://api.sjaceuta.es"
    ).replace(/\/$/, "");


    const socket =
        React.useMemo(
            () =>
                getSocket(token),
            [token]
        );


    const [
        pestaña,
        setPestaña,
    ] = useState(
        "disponibles"
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
        useCallback(async () => {

            try {

                setLoading(true);


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

            }

        }, [
            cargarDisponibles,
            cargarMias,
        ]);

    useEffect(() => {

        if (!socket) {
            return;
        }


        const onReservaCancelada = (
            data
        ) => {

            const reservaId =
                data?.reservaId;


            if (!reservaId) {
                return;
            }


            /*
             * La quitamos tanto de disponibles
             * como de nuestras reservas.
             */
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


        const onReservaAceptada = (
            data
        ) => {

            /*
             * Otro taxista puede haberla
             * aceptado.
             */
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


    useEffect(() => {

        cargarTodo();


        /*
         * Refresco de seguridad.
         *
         * El socket actualizará instantáneamente,
         * pero esto evita que se quede desactualizado.
         */
        const interval =
            setInterval(
                cargarTodo,
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
     * ACEPTAR RESERVA
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


            Alert.alert(
                "Reserva aceptada",
                "La reserva ya está asignada a tu taxi."
            );


            /*
             * La quitamos de disponibles.
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
             * La metemos en Mis reservas.
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


            setPestaña(
                "mias"
            );


        } catch (error) {

            Alert.alert(
                "No se pudo aceptar",
                error.message ||
                "Puede que otro taxista haya aceptado la reserva antes."
            );


            /*
             * Recargamos porque seguramente
             * otro taxista se la quedó.
             */
            await cargarTodo();


        } finally {

            setAceptandoId(
                null
            );

        }

    }


    /*
     * =====================================================
     * RENDER
     * =====================================================
     */

    const lista =
        pestaña ===
            "disponibles"
            ? disponibles
            : mias;


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
                    onPress={
                        onClose
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
                    Reservas
                </Text>


                <TouchableOpacity
                    style={
                        styles.refreshButton
                    }
                    onPress={
                        cargarTodo
                    }
                >

                    <Ionicons
                        name="refresh-outline"
                        size={22}
                        color="#111827"
                    />

                </TouchableOpacity>

            </View>


            {/* PESTAÑAS */}

            <View
                style={
                    styles.tabs
                }
            >

                <TouchableOpacity
                    style={[
                        styles.tab,

                        pestaña ===
                        "disponibles" &&
                        styles.tabActive,
                    ]}
                    onPress={() =>
                        setPestaña(
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

                                pestaña ===
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

                        pestaña ===
                        "mias" &&
                        styles.tabActive,
                    ]}
                    onPress={() =>
                        setPestaña(
                            "mias"
                        )
                    }
                >

                    <Text
                        style={[
                            styles.tabText,

                            pestaña ===
                            "mias" &&
                            styles.tabTextActive,
                        ]}
                    >
                        Mis reservas
                    </Text>

                </TouchableOpacity>

            </View>


            {/* CONTENIDO */}

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

            ) : lista.length === 0 ? (

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

                        {pestaña ===
                            "disponibles"
                            ? "No hay reservas disponibles"
                            : "No tienes reservas"}

                    </Text>


                    <Text
                        style={
                            styles.emptyText
                        }
                    >

                        {pestaña ===
                            "disponibles"
                            ? "Cuando un cliente cree una reserva aparecerá aquí."
                            : "Las reservas que aceptes aparecerán aquí."}

                    </Text>

                </View>

            ) : (

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
                                    pestaña ===
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
 * TARJETA
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
                        size={19}
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

            <View style={styles.phoneRow}>

                <View style={styles.phoneIcon}>

                    <Ionicons
                        name="call-outline"
                        size={18}
                        color="#111827"
                    />

                </View>


                <View style={{ flex: 1 }}>

                    <Text style={styles.smallLabel}>
                        Teléfono cliente
                    </Text>

                    <Text style={styles.phoneValue}>
                        {reserva.telefonoCliente || "-"}
                    </Text>

                </View>

            </View>


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
                                size={20}
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
                        size={19}
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

        header: {
            height: 60,

            paddingHorizontal:
                12,

            backgroundColor:
                "#fff",

            flexDirection:
                "row",

            alignItems:
                "center",

            justifyContent:
                "space-between",

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
            fontSize: 18,

            fontWeight:
                "800",

            color:
                "#111827",
        },

        tabs: {
            margin:
                12,

            padding:
                4,

            borderRadius:
                15,

            backgroundColor:
                "#e2e8f0",

            flexDirection:
                "row",
        },

        tab: {
            flex: 1,

            minHeight: 43,

            borderRadius:
                12,

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
                6,
        },

        tabText: {
            fontSize: 13,

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
            minWidth: 20,

            height: 20,

            borderRadius:
                10,

            paddingHorizontal:
                5,

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

            fontSize: 10,

            fontWeight:
                "800",
        },

        content: {
            paddingHorizontal:
                14,

            paddingBottom:
                30,

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

            fontSize: 14,

            color:
                "#64748b",
        },

        emptyIcon: {
            width: 70,
            height: 70,

            borderRadius:
                35,

            backgroundColor:
                "#e2e8f0",

            alignItems:
                "center",

            justifyContent:
                "center",
        },

        emptyTitle: {
            marginTop:
                14,

            fontSize: 18,

            fontWeight:
                "800",

            color:
                "#111827",
        },

        emptyText: {
            marginTop:
                5,

            maxWidth:
                280,

            textAlign:
                "center",

            fontSize: 13,

            lineHeight:
                19,

            color:
                "#64748b",
        },

        card: {
            padding:
                15,

            borderRadius:
                20,

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
                10,
        },

        date: {
            fontSize: 13,

            fontWeight:
                "700",

            color:
                "#64748b",

            textTransform:
                "capitalize",
        },

        hour: {
            marginTop:
                2,

            fontSize: 27,

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
            fontSize: 25,

            fontWeight:
                "900",

            color:
                "#111827",
        },

        priceLabel: {
            fontSize: 10,

            color:
                "#64748b",
        },

        infoRow: {
            marginTop:
                14,

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                10,
        },

        infoIcon: {
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
            fontSize: 10,

            fontWeight:
                "700",

            color:
                "#64748b",

            textTransform:
                "uppercase",
        },

        infoValue: {
            marginTop:
                2,

            fontSize: 14,

            lineHeight:
                19,

            fontWeight:
                "700",

            color:
                "#111827",
        },

        referenceBox: {
            marginTop:
                11,

            paddingTop:
                10,

            borderTopWidth:
                1,

            borderTopColor:
                "#e2e8f0",

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                7,
        },

        referenceText: {
            flex: 1,

            fontSize: 13,

            color:
                "#64748b",
        },

        acceptButton: {
            marginTop:
                14,

            minHeight:
                50,

            borderRadius:
                15,

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

        acceptButtonText: {
            color:
                "#fff",

            fontSize: 15,

            fontWeight:
                "800",
        },

        assignedBox: {
            marginTop:
                14,

            minHeight:
                44,

            paddingHorizontal:
                12,

            borderRadius:
                13,

            backgroundColor:
                "#dcfce7",

            flexDirection:
                "row",

            alignItems:
                "center",

            gap:
                7,
        },

        assignedText: {
            color:
                "#166534",

            fontSize: 13,

            fontWeight:
                "800",
        },

        phoneRow: {
            marginTop: 12,

            flexDirection: "row",
            alignItems: "center",

            gap: 10,
        },

        phoneIcon: {
            width: 38,
            height: 38,

            borderRadius: 19,

            backgroundColor: "#f1f5f9",

            alignItems: "center",
            justifyContent: "center",
        },

        phoneValue: {
            marginTop: 2,

            fontSize: 15,

            fontWeight: "800",

            color: "#111827",
        },

    });