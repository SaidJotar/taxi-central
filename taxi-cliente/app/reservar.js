import { useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";

import MapView, {
    Marker,
    PROVIDER_GOOGLE,
} from "react-native-maps";

import {
    Modal,
} from "react-native";

import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Platform,
    TextInput,
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

import DateTimePicker
    from "@react-native-community/datetimepicker";

import { api } from "../src/api/client";


export default function ReservarScreen() {

    const params =
        useLocalSearchParams();


    /*
     * DATOS DE RECOGIDA
     */

    const [pickupReserva, setPickupReserva] =
        useState({
            latitude: Number(params.lat),
            longitude: Number(params.lng),

            direccionRecogida:
                typeof params.direccion === "string"
                    ? params.direccion
                    : "",

            direccionBase:
                typeof params.direccionBase === "string"
                    ? params.direccionBase
                    : "",
        });

    const [cambiandoRecogida, setCambiandoRecogida] =
        useState(false);

    const [referencia, setReferencia] =
        useState(
            typeof params.referencia === "string"
                ? params.referencia
                : ""
        );

    const telefono =
        typeof params.telefono === "string"
            ? params.telefono
            : "";


    /*
     * FECHA / HORA
     */

    const fechaMinima =
        useMemo(() => {

            /*
             * La UI deja un pequeño margen
             * sobre la hora obligatoria.
             */
            return new Date(
                Date.now() +
                61 * 60 * 1000
            );

        }, []);


    const [fechaHora, setFechaHora] =
        useState(fechaMinima);


    const [
        mostrarSelectorFecha,
        setMostrarSelectorFecha,
    ] = useState(false);


    const [
        mostrarSelectorHora,
        setMostrarSelectorHora,
    ] = useState(false);


    /*
     * PRECIO
     */

    const [
        cargandoPrecio,
        setCargandoPrecio,
    ] = useState(false);


    const [
        precioFinal,
        setPrecioFinal,
    ] = useState(null);


    const [
        tipoTarifa,
        setTipoTarifa,
    ] = useState(null);


    const [
        creandoReserva,
        setCreandoReserva,
    ] = useState(false);


    /*
     * =====================================================
     * CALCULAR PRECIO
     * =====================================================
     */

    async function actualizarPrecio(
        nuevaFecha
    ) {

        try {

            setCargandoPrecio(true);

            const res =
                await api.calcularReserva({
                    tipo:
                        "normal",

                    fechaHora:
                        nuevaFecha.toISOString(),
                });


            setPrecioFinal(
                res?.precioFinal ??
                null
            );


            setTipoTarifa(
                res?.tipoTarifa ??
                null
            );


        } catch (error) {

            console.log(
                "Error calculando reserva:",
                error
            );


            setPrecioFinal(null);

            setTipoTarifa(null);


            Alert.alert(
                "Reserva",
                error.message ||
                "No se pudo calcular el precio."
            );

        } finally {

            setCargandoPrecio(false);

        }

    }


    /*
     * Primera carga.
     */
    useEffect(() => {

        actualizarPrecio(
            fechaHora
        );

    }, []);

    async function seleccionarNuevaRecogida(event) {

        const {
            latitude,
            longitude,
        } = event.nativeEvent.coordinate;


        try {

            const items =
                await Location.reverseGeocodeAsync({
                    latitude,
                    longitude,
                });


            const item =
                items?.[0];


            const linea1 = [
                item?.street,
                item?.streetNumber,
            ]
                .filter(Boolean)
                .join(" ");


            const linea2 = [
                item?.district,
                item?.city,
            ]
                .filter(Boolean)
                .join(", ");


            const direccion =
                [linea1, linea2]
                    .filter(Boolean)
                    .join(", ") ||
                "Ubicación seleccionada";


            setPickupReserva({
                latitude,
                longitude,

                direccionRecogida:
                    direccion,

                direccionBase:
                    direccion,
            });


        } catch (error) {

            setPickupReserva({
                latitude,
                longitude,

                direccionRecogida:
                    "Ubicación seleccionada",

                direccionBase:
                    "Ubicación seleccionada",
            });

        }

    }


    /*
     * =====================================================
     * CAMBIAR FECHA
     * =====================================================
     */

    function cambiarFecha(
        event,
        fechaSeleccionada
    ) {

        if (
            Platform.OS === "android"
        ) {
            setMostrarSelectorFecha(false);
        }


        if (!fechaSeleccionada) {
            return;
        }


        const nueva =
            new Date(
                fechaHora
            );


        nueva.setFullYear(
            fechaSeleccionada.getFullYear()
        );

        nueva.setMonth(
            fechaSeleccionada.getMonth()
        );

        nueva.setDate(
            fechaSeleccionada.getDate()
        );


        setFechaHora(
            nueva
        );


        actualizarPrecio(
            nueva
        );

    }


    /*
     * =====================================================
     * CAMBIAR HORA
     * =====================================================
     */

    function cambiarHora(
        event,
        horaSeleccionada
    ) {

        if (
            Platform.OS === "android"
        ) {
            setMostrarSelectorHora(false);
        }


        if (!horaSeleccionada) {
            return;
        }


        const nueva =
            new Date(
                fechaHora
            );


        nueva.setHours(
            horaSeleccionada.getHours()
        );

        nueva.setMinutes(
            horaSeleccionada.getMinutes()
        );

        nueva.setSeconds(
            0
        );

        nueva.setMilliseconds(
            0
        );


        setFechaHora(
            nueva
        );


        actualizarPrecio(
            nueva
        );

    }


    /*
     * =====================================================
     * CONFIRMAR RESERVA
     * =====================================================
     */

    async function confirmarReserva() {

        if (
            !telefono
        ) {

            Alert.alert(
                "Teléfono",
                "Necesitas tener un número de teléfono guardado antes de realizar una reserva."
            );

            return;

        }


        if (
            !Number.isFinite(
                pickupReserva?.latitude
            ) ||
            !Number.isFinite(
                pickupReserva?.longitude
            )
        ) {

            Alert.alert(
                "Ubicación",
                "No se ha podido recuperar el punto de recogida."
            );

            return;
        }

        if (
            precioFinal == null
        ) {

            Alert.alert(
                "Reserva",
                "Todavía no se ha podido calcular el precio."
            );

            return;

        }


        Alert.alert(
            "Confirmar reserva",
            `Vas a reservar un taxi para ${formatearFechaCompleta(
                fechaHora
            )} por ${precioFinal} €.\n\nEste es el precio final e incluye equipaje y tiempo de espera.`,
            [
                {
                    text:
                        "Volver",

                    style:
                        "cancel",
                },

                {
                    text:
                        "Confirmar",

                    onPress:
                        crearReserva,
                },
            ]
        );

    }


    /*
     * =====================================================
     * CREAR RESERVA
     * =====================================================
     */

    async function crearReserva() {

        try {

            setCreandoReserva(
                true
            );


            const res =
                await api.crearReserva({

                    tipo:
                        "normal",

                    telefonoCliente:
                        telefono,

                    lat:
                        pickupReserva.latitude,

                    lng:
                        pickupReserva.longitude,

                    direccionRecogida:
                        pickupReserva.direccionRecogida,

                    direccionBase:
                        pickupReserva.direccionBase,

                    referenciaRecogida:
                        referencia.trim() || null,

                    fechaHora:
                        fechaHora.toISOString(),

                });


            if (
                !res?.reserva?.id
            ) {

                throw new Error(
                    "La API no devolvió la reserva creada."
                );

            }


            Alert.alert(
                "Reserva realizada",
                `Tu taxi está reservado para ${formatearFechaCompleta(
                    fechaHora
                )}.\n\nPrecio final: ${res.reserva.precioFinal} €.`,
                [
                    {
                        text:
                            "Aceptar",

                        onPress: () =>
                            router.replace({
                                pathname: "/reservas",

                                params: {
                                    telefono,
                                },
                            }),
                    },
                ]
            );


        } catch (error) {

            console.log(
                "Error creando reserva:",
                error
            );


            Alert.alert(
                "No se pudo realizar la reserva",
                error.message ||
                "Inténtalo de nuevo."
            );


        } finally {

            setCreandoReserva(
                false
            );

        }

    }


    return (

        <SafeAreaView
            style={styles.container}
            edges={[
                "top",
                "bottom",
            ]}
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
                        size={25}
                        color="#111827"
                    />

                </TouchableOpacity>


                <Text
                    style={
                        styles.headerTitle
                    }
                >
                    Reservar taxi
                </Text>


                <View
                    style={{
                        width: 42,
                    }}
                />

            </View>


            <View style={styles.content}>

                {/* RECOGIDA */}


                <View style={styles.pickupCard}>

                    <View style={styles.pickupTop}>

                        <View style={styles.iconCircle}>

                            <Ionicons
                                name="location"
                                size={19}
                                color="#111827"
                            />

                        </View>


                        <View style={{ flex: 1 }}>

                            <Text style={styles.label}>
                                Recogida
                            </Text>

                            <Text
                                style={styles.pickupAddress}
                                numberOfLines={2}
                            >
                                {pickupReserva.direccionRecogida}
                            </Text>

                        </View>


                        <TouchableOpacity
                            style={styles.changePickupSmall}
                            onPress={() =>
                                setCambiandoRecogida(true)
                            }
                        >
                            <Text style={styles.changePickupSmallText}>
                                Cambiar
                            </Text>
                        </TouchableOpacity>

                    </View>

                    <View style={styles.compactReference}>

                        <Ionicons
                            name="chatbubble-outline"
                            size={16}
                            color="#64748b"
                        />

                        <TextInput
                            style={styles.compactReferenceInput}
                            value={referencia}
                            onChangeText={setReferencia}
                            placeholder="Añadir referencia opcional"
                            placeholderTextColor="#94a3b8"
                            maxLength={120}
                            returnKeyType="done"
                            blurOnSubmit
                        />

                    </View>

                </View>


                {/* FECHA Y HORA */}

                <Text
                    style={[
                        styles.sectionTitle,
                        {
                            marginTop: 22,
                        },
                    ]}
                >
                    ¿Cuándo?
                </Text>


                <View style={styles.dateTimeRow}>

                    <TouchableOpacity
                        style={styles.compactDateButton}
                        onPress={() => {
                            setMostrarSelectorHora(false);
                            setMostrarSelectorFecha(true);
                        }}
                    >

                        <Ionicons
                            name="calendar-outline"
                            size={19}
                            color="#111827"
                        />

                        <View>
                            <Text style={styles.compactLabel}>
                                Día
                            </Text>

                            <Text style={styles.compactValue}>
                                {formatearFecha(fechaHora)}
                            </Text>
                        </View>

                    </TouchableOpacity>


                    <TouchableOpacity
                        style={styles.compactDateButton}
                        onPress={() => {
                            setMostrarSelectorFecha(false);
                            setMostrarSelectorHora(true);
                        }}
                    >

                        <Ionicons
                            name="time-outline"
                            size={19}
                            color="#111827"
                        />

                        <View>
                            <Text style={styles.compactLabel}>
                                Hora
                            </Text>

                            <Text style={styles.compactValue}>
                                {formatearHora(fechaHora)}
                            </Text>
                        </View>

                    </TouchableOpacity>

                </View>


                {mostrarSelectorFecha && (

                    <View style={styles.pickerBox}>

                        <DateTimePicker
                            value={fechaHora}
                            mode="date"
                            minimumDate={fechaMinima}
                            display={
                                Platform.OS === "ios"
                                    ? "inline"
                                    : "default"
                            }
                            onChange={(event, fechaSeleccionada) => {

                                if (
                                    Platform.OS === "android"
                                ) {
                                    setMostrarSelectorFecha(false);
                                }

                                if (!fechaSeleccionada) {
                                    return;
                                }

                                const nueva =
                                    new Date(fechaHora);

                                nueva.setFullYear(
                                    fechaSeleccionada.getFullYear()
                                );

                                nueva.setMonth(
                                    fechaSeleccionada.getMonth()
                                );

                                nueva.setDate(
                                    fechaSeleccionada.getDate()
                                );

                                setFechaHora(nueva);

                                actualizarPrecio(nueva);
                            }}
                        />


                        {Platform.OS === "ios" && (

                            <TouchableOpacity
                                style={styles.pickerConfirmButton}
                                onPress={() =>
                                    setMostrarSelectorFecha(false)
                                }
                            >
                                <Text style={styles.pickerConfirmText}>
                                    Aceptar
                                </Text>
                            </TouchableOpacity>

                        )}

                    </View>

                )}

                {mostrarSelectorHora && (

                    <View style={styles.pickerBox}>

                        <DateTimePicker
                            value={fechaHora}
                            mode="time"
                            is24Hour
                            display={
                                Platform.OS === "ios"
                                    ? "spinner"
                                    : "default"
                            }
                            onChange={(event, horaSeleccionada) => {

                                if (
                                    Platform.OS === "android"
                                ) {
                                    setMostrarSelectorHora(false);
                                }

                                if (!horaSeleccionada) {
                                    return;
                                }

                                const nueva =
                                    new Date(fechaHora);

                                nueva.setHours(
                                    horaSeleccionada.getHours()
                                );

                                nueva.setMinutes(
                                    horaSeleccionada.getMinutes()
                                );

                                nueva.setSeconds(0);

                                nueva.setMilliseconds(0);

                                setFechaHora(nueva);

                                actualizarPrecio(nueva);
                            }}
                        />


                        {Platform.OS === "ios" && (

                            <TouchableOpacity
                                style={styles.pickerConfirmButton}
                                onPress={() =>
                                    setMostrarSelectorHora(false)
                                }
                            >
                                <Text style={styles.pickerConfirmText}>
                                    Aceptar
                                </Text>
                            </TouchableOpacity>

                        )}

                    </View>

                )}


                {/* AVISO ANTELACIÓN */}

                <View style={styles.compactNotice}>

                    <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color="#475569"
                    />

                    <Text style={styles.compactNoticeText}>
                        Reserva con mínimo 1 hora de antelación.
                    </Text>

                </View>


                {/* PRECIO */}

                <Text
                    style={[
                        styles.sectionTitle,
                        {
                            marginTop: 22,
                        },
                    ]}
                >
                    Precio
                </Text>


                <View style={styles.compactPriceCard}>

                    <View>

                        <Text style={styles.priceLabel}>
                            Precio final
                        </Text>

                        <Text style={styles.priceInfo}>
                            {tipoTarifa === "nocturna"
                                ? "Tarifa nocturna"
                                : "Tarifa diurna"}
                        </Text>

                    </View>


                    {cargandoPrecio ? (

                        <ActivityIndicator
                            color="#111827"
                        />

                    ) : (

                        <Text style={styles.compactPrice}>
                            {precioFinal != null
                                ? `${precioFinal} €`
                                : "--"}
                        </Text>

                    )}

                </View>


                <View style={styles.compactIncluded}>

                    <Ionicons
                        name="checkmark-circle-outline"
                        size={17}
                        color="#475569"
                    />

                    <Text style={styles.compactIncludedText}>
                        Precio cerrado · Equipaje y tiempo de espera incluidos
                    </Text>

                </View>

                {/* TELÉFONO */}

                <View style={styles.compactPhone}>

                    <Ionicons
                        name="call-outline"
                        size={17}
                        color="#64748b"
                    />

                    <Text style={styles.compactPhoneText}>
                        {telefono}
                    </Text>

                </View>


                {/* CONFIRMAR */}

                <TouchableOpacity

                    style={[
                        styles.confirmButton,

                        (
                            creandoReserva ||
                            cargandoPrecio ||
                            precioFinal == null
                        ) &&
                        styles.buttonDisabled,
                    ]}

                    disabled={
                        creandoReserva ||
                        cargandoPrecio ||
                        precioFinal == null
                    }

                    onPress={
                        confirmarReserva
                    }

                >

                    {creandoReserva ? (

                        <ActivityIndicator
                            color="#fff"
                        />

                    ) : (

                        <>

                            <Ionicons
                                name="calendar-outline"
                                size={21}
                                color="#fff"
                            />

                            <Text
                                style={
                                    styles.confirmButtonText
                                }
                            >
                                Confirmar reserva
                            </Text>

                        </>

                    )}

                </TouchableOpacity>


                <View
                    style={{
                        height: 25,
                    }}
                />

            </View>

            <Modal
                visible={cambiandoRecogida}
                animationType="slide"
            >

                <SafeAreaView
                    style={{
                        flex: 1,
                        backgroundColor: "#fff",
                    }}
                >

                    <View style={styles.mapHeader}>

                        <TouchableOpacity
                            onPress={() =>
                                setCambiandoRecogida(false)
                            }
                        >
                            <Ionicons
                                name="close"
                                size={26}
                                color="#111827"
                            />
                        </TouchableOpacity>

                        <Text style={styles.mapHeaderTitle}>
                            Punto de recogida
                        </Text>

                        <View style={{ width: 26 }} />

                    </View>


                    <MapView
                        provider={PROVIDER_GOOGLE}
                        style={{ flex: 1 }}

                        initialRegion={{
                            latitude:
                                pickupReserva.latitude,

                            longitude:
                                pickupReserva.longitude,

                            latitudeDelta:
                                0.006,

                            longitudeDelta:
                                0.006,
                        }}

                        onPress={
                            seleccionarNuevaRecogida
                        }
                    >

                        <Marker
                            coordinate={{
                                latitude:
                                    pickupReserva.latitude,

                                longitude:
                                    pickupReserva.longitude,
                            }}
                        />

                    </MapView>


                    <View style={styles.mapBottom}>

                        <Text style={styles.mapAddress}>
                            {pickupReserva.direccionRecogida}
                        </Text>


                        <TouchableOpacity
                            style={styles.mapConfirmButton}
                            onPress={() =>
                                setCambiandoRecogida(false)
                            }
                        >
                            <Text style={styles.mapConfirmText}>
                                Confirmar recogida
                            </Text>
                        </TouchableOpacity>

                    </View>

                </SafeAreaView>

            </Modal>

        </SafeAreaView>

    );

}


function IncludedItem({
    texto,
}) {

    return (

        <View
            style={
                styles.includedItem
            }
        >

            <Ionicons
                name="checkmark"
                size={17}
                color="#111827"
            />

            <Text
                style={
                    styles.includedText
                }
            >
                {texto}
            </Text>

        </View>

    );

}


function formatearFecha(
    fecha
) {

    return fecha.toLocaleDateString(
        "es-ES",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }
    );

}

function formatearHora(
    fecha
) {

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


function formatearFechaCompleta(
    fecha
) {

    return fecha.toLocaleString(
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

const styles = StyleSheet.create({

    /*
     * =====================================================
     * PANTALLA
     * =====================================================
     */

    container: {
        flex: 1,
        backgroundColor: "#f8fafc",
    },


    /*
     * =====================================================
     * HEADER
     * =====================================================
     */

    header: {
        height: 58,

        paddingHorizontal: 12,

        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",

        backgroundColor: "#ffffff",

        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
    },

    backButton: {
        width: 42,
        height: 42,

        alignItems: "center",
        justifyContent: "center",
    },

    headerTitle: {
        fontSize: 18,
        fontWeight: "800",
        color: "#111827",
    },


    /*
     * =====================================================
     * CONTENIDO
     * =====================================================
     */

    content: {
        flex: 1,

        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
    },


    /*
     * =====================================================
     * RECOGIDA
     * =====================================================
     */

    pickupCard: {
        backgroundColor: "#ffffff",

        borderRadius: 18,

        padding: 13,

        borderWidth: 1,
        borderColor: "#e2e8f0",
    },

    pickupTop: {
        flexDirection: "row",
        alignItems: "center",

        gap: 10,
    },

    iconCircle: {
        width: 40,
        height: 40,

        borderRadius: 20,

        backgroundColor: "#f1f5f9",

        alignItems: "center",
        justifyContent: "center",
    },

    label: {
        fontSize: 10,

        fontWeight: "700",

        color: "#64748b",

        textTransform: "uppercase",
    },

    pickupAddress: {
        marginTop: 2,

        fontSize: 14,

        lineHeight: 18,

        fontWeight: "700",

        color: "#111827",
    },

    changePickupSmall: {
        minHeight: 36,

        paddingHorizontal: 10,

        alignItems: "center",
        justifyContent: "center",
    },

    changePickupSmallText: {
        fontSize: 12,

        fontWeight: "800",

        color: "#111827",
    },


    /*
     * REFERENCIA
     */

    compactReference: {
        marginTop: 9,

        paddingTop: 8,

        borderTopWidth: 1,
        borderTopColor: "#e2e8f0",

        flexDirection: "row",
        alignItems: "center",

        gap: 6,
    },


    /*
     * =====================================================
     * FECHA Y HORA
     * =====================================================
     */

    dateTimeRow: {
        marginTop: 10,

        flexDirection: "row",

        gap: 9,
    },

    compactDateButton: {
        flex: 1,

        minHeight: 58,

        paddingHorizontal: 12,

        borderRadius: 16,

        borderWidth: 1,
        borderColor: "#e2e8f0",

        backgroundColor: "#ffffff",

        flexDirection: "row",
        alignItems: "center",

        gap: 9,
    },

    compactLabel: {
        fontSize: 10,

        color: "#64748b",

        fontWeight: "700",

        textTransform: "uppercase",
    },

    compactValue: {
        marginTop: 2,

        fontSize: 14,

        color: "#111827",

        fontWeight: "800",
    },


    /*
     * =====================================================
     * SELECTOR FECHA / HORA
     * =====================================================
     */

    pickerBox: {
        marginTop: 8,

        padding: 8,

        backgroundColor: "#ffffff",

        borderRadius: 16,

        borderWidth: 1,
        borderColor: "#e2e8f0",
    },

    pickerConfirmButton: {
        minHeight: 42,

        backgroundColor: "#111827",

        borderRadius: 13,

        alignItems: "center",
        justifyContent: "center",

        marginTop: 6,
    },

    pickerConfirmText: {
        color: "#ffffff",

        fontSize: 14,

        fontWeight: "800",
    },


    /*
     * =====================================================
     * PRECIO
     * =====================================================
     */

    compactPriceCard: {
        marginTop: 10,

        minHeight: 68,

        paddingHorizontal: 15,

        borderRadius: 17,

        borderWidth: 1,
        borderColor: "#e2e8f0",

        backgroundColor: "#ffffff",

        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },

    priceLabel: {
        fontSize: 12,

        color: "#64748b",

        fontWeight: "700",
    },

    priceInfo: {
        marginTop: 2,

        fontSize: 12,

        color: "#64748b",
    },

    compactPrice: {
        fontSize: 28,

        fontWeight: "900",

        color: "#111827",
    },


    /*
     * =====================================================
     * INCLUIDO EN PRECIO
     * =====================================================
     */

    compactIncluded: {
        marginTop: 7,

        flexDirection: "row",

        alignItems: "center",
        justifyContent: "center",

        gap: 6,
    },

    compactIncludedText: {
        flexShrink: 1,

        fontSize: 11,

        color: "#64748b",

        fontWeight: "600",

        textAlign: "center",
    },


    /*
     * =====================================================
     * AVISO 1 HORA
     * =====================================================
     */

    compactNotice: {
        marginTop: 9,

        minHeight: 40,

        paddingHorizontal: 11,

        borderRadius: 13,

        backgroundColor: "#f1f5f9",

        flexDirection: "row",
        alignItems: "center",

        gap: 7,
    },

    compactNoticeText: {
        flex: 1,

        fontSize: 12,

        color: "#475569",

        fontWeight: "600",
    },


    /*
     * =====================================================
     * TELÉFONO
     * =====================================================
     */

    compactPhone: {
        marginTop: 8,

        minHeight: 36,

        flexDirection: "row",

        alignItems: "center",
        justifyContent: "center",

        gap: 7,
    },

    compactPhoneText: {
        fontSize: 13,

        fontWeight: "700",

        color: "#475569",
    },


    /*
     * =====================================================
     * CONFIRMAR
     * =====================================================
     */

    confirmButton: {
        marginTop: 10,

        minHeight: 54,

        backgroundColor: "#111827",

        borderRadius: 17,

        flexDirection: "row",

        alignItems: "center",
        justifyContent: "center",

        gap: 8,
    },

    confirmButtonText: {
        color: "#ffffff",

        fontSize: 16,

        fontWeight: "800",
    },

    buttonDisabled: {
        opacity: 0.55,
    },


    /*
     * =====================================================
     * MODAL CAMBIAR RECOGIDA
     * =====================================================
     */

    mapHeader: {
        height: 58,

        paddingHorizontal: 16,

        flexDirection: "row",

        alignItems: "center",
        justifyContent: "space-between",

        backgroundColor: "#ffffff",

        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
    },

    mapHeaderTitle: {
        fontSize: 17,

        fontWeight: "800",

        color: "#111827",
    },

    mapBottom: {
        paddingHorizontal: 16,

        paddingTop: 13,

        paddingBottom: 16,

        backgroundColor: "#ffffff",

        borderTopWidth: 1,
        borderTopColor: "#e2e8f0",
    },

    mapAddress: {
        fontSize: 14,

        lineHeight: 19,

        fontWeight: "700",

        color: "#111827",

        marginBottom: 12,
    },

    mapConfirmButton: {
        minHeight: 54,

        borderRadius: 17,

        backgroundColor: "#111827",

        alignItems: "center",
        justifyContent: "center",
    },

    mapConfirmText: {
        color: "#ffffff",

        fontSize: 16,

        fontWeight: "800",
    },

    compactReferenceInput: {
        flex: 1,
        minHeight: 34,
        paddingVertical: 0,
        fontSize: 13,
        color: "#111827",
    },

});