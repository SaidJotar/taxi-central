import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";

import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  router,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";

import { api } from "../src/api/client";


function formatearDireccionDesdeReverse(item) {
  if (!item) return "";

  const linea1 = [
    item.street,
    item.streetNumber,
  ]
    .filter(Boolean)
    .join(" ");

  const linea2 = [
    item.district,
    item.city,
  ]
    .filter(Boolean)
    .join(", ");

  return [linea1, linea2]
    .filter(Boolean)
    .join(", ");
}


function normalizarTelefono(valor) {
  if (!valor) return null;

  let telefono = valor
    .trim()
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");

  // 0034... -> +34...
  if (telefono.startsWith("00")) {
    telefono = "+" + telefono.slice(2);
  }

  // 612345678 -> +34612345678
  if (/^\d{9}$/.test(telefono)) {
    telefono = "+34" + telefono;
  }

  // Formato internacional
  if (!/^\+\d{8,15}$/.test(telefono)) {
    return null;
  }

  return telefono;
}


export default function HomeScreen() {

  const mapRef = useRef(null);

  const params = useLocalSearchParams();

  const [tieneReservasActivas, setTieneReservasActivas] =
    useState(false);


  /*
   * UBICACIÓN
   */
  const [loading, setLoading] = useState(true);

  const [addressLoading, setAddressLoading] =
    useState(false);

  const [requestingTaxi, setRequestingTaxi] =
    useState(false);

  const [miUbicacion, setMiUbicacion] =
    useState(null);

  const [pickup, setPickup] =
    useState(null);

  const [pickupOriginal, setPickupOriginal] =
    useState(null);

  const [cambiandoRecogida, setCambiandoRecogida] =
    useState(false);


  /*
   * REFERENCIA
   */
  const [referencia, setReferencia] =
    useState("");


  /*
   * TELÉFONO
   */
  const [telefonoCliente, setTelefonoCliente] =
    useState(null);

  const [telefonoInput, setTelefonoInput] =
    useState("+34");

  const [modalTelefonoVisible, setModalTelefonoVisible] =
    useState(false);

  const [guardandoTelefono, setGuardandoTelefono] =
    useState(false);

  /*
   * true:
   * el modal apareció porque pulsó PEDIR TAXI
   *
   * false:
   * el modal apareció porque pulsó CAMBIAR TELÉFONO
   */
  const [
    accionTrasTelefono,
    setAccionTrasTelefono,
  ] = useState(null);

  /*
   * TECLADO
   */
  const [keyboardHeight, setKeyboardHeight] =
    useState(0);


  /*
   * =====================================================
   * COMPROBAR RESERVAS ACTIVAS
   * =====================================================
   *
   * El punto rojo solamente debe aparecer si existe
   * al menos una reserva:
   *
   * - pendiente
   * - aceptada
   *
   * No cuentan:
   *
   * - cancelada
   * - completada
   */
  const comprobarReservasActivas =
    useCallback(async (telefono) => {

      if (!telefono) {

        setTieneReservasActivas(
          false
        );

        return;
      }


      try {

        const res =
          await api.getReservasCliente(
            telefono
          );


        const reservas =
          Array.isArray(
            res?.reservas
          )
            ? res.reservas
            : [];


        const activas =
          reservas.filter(
            (reserva) => {

              const estado =
                String(
                  reserva?.estado ||
                  ""
                ).toLowerCase();


              return (
                estado === "pendiente" ||
                estado === "aceptada"
              );

            }
          );


        console.log(
          "📅 Reservas cliente:",
          reservas.map(
            (reserva) => ({
              id:
                reserva.id,

              estado:
                reserva.estado,

              fechaHora:
                reserva.fechaHora,
            })
          )
        );


        console.log(
          "🔴 Reservas activas:",
          activas.length
        );


        /*
         * IMPORTANTE:
         *
         * Si no queda ninguna reserva,
         * esto pone explícitamente false.
         */
        setTieneReservasActivas(
          activas.length > 0
        );


      } catch (error) {

        console.log(
          "Error comprobando reservas:",
          error.message
        );


        /*
         * Si falla la consulta no dejamos
         * un punto rojo antiguo.
         */
        setTieneReservasActivas(
          false
        );

      }

    }, []);


  /*
   * =====================================================
   * ACTUALIZAR RESERVAS AL VOLVER A INICIO
   * =====================================================
   *
   * Esto NO toca el GPS.
   *
   * Cada vez que index.js vuelve a estar visible:
   *
   * /reservas
   *     ↓ atrás
   * /index
   *
   * consultamos únicamente las reservas.
   */
  useFocusEffect(

    useCallback(() => {

      let pantallaActiva =
        true;


      async function actualizar() {

        if (!telefonoCliente) {

          if (
            pantallaActiva
          ) {

            setTieneReservasActivas(
              false
            );

          }

          return;
        }


        try {

          await comprobarReservasActivas(
            telefonoCliente
          );


        } catch (error) {

          console.log(
            "Error actualizando reservas al volver:",
            error.message
          );


          if (
            pantallaActiva
          ) {

            setTieneReservasActivas(
              false
            );

          }

        }

      }


      actualizar();


      return () => {

        pantallaActiva =
          false;

      };

    }, [
      telefonoCliente,
      comprobarReservasActivas,
    ])

  );

  /*
   * =====================================================
   * OBTENER DIRECCIÓN
   * =====================================================
   */
  const obtenerDireccion =
    useCallback(async (latitude, longitude) => {

      try {

        setAddressLoading(true);

        const items =
          await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });

        const first =
          items?.[0] || null;

        const direccion =
          formatearDireccionDesdeReverse(first) ||
          "Ubicación seleccionada";

        return direccion;

      } catch (error) {

        console.log(
          "Error obteniendo dirección:",
          error
        );

        return "Ubicación seleccionada";

      } finally {

        setAddressLoading(false);

      }

    }, []);


  /*
   * =====================================================
   * OBTENER GPS
   * =====================================================
   */
  const cargarMiUbicacion =
    useCallback(async () => {

      try {

        setLoading(true);

        const { status } =
          await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {

          Alert.alert(
            "Permiso de ubicación",
            "Necesitamos tu ubicación para saber dónde debe recogerte el taxi."
          );

          return;
        }


        const loc =
          await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });


        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };


        setMiUbicacion(coords);


        const direccion =
          await obtenerDireccion(
            coords.latitude,
            coords.longitude
          );


        const pickupGps = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          direccionRecogida: direccion,
          direccionBase: direccion,
        };


        setPickup(pickupGps);

        setPickupOriginal(pickupGps);


        const region = {
          ...coords,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        };


        setTimeout(() => {

          mapRef.current?.animateToRegion(
            region,
            500
          );

        }, 300);


      } catch (error) {

        console.log(
          "Error obteniendo ubicación:",
          error
        );

        Alert.alert(
          "Ubicación",
          "No se pudo obtener tu ubicación actual."
        );

      } finally {

        setLoading(false);

      }

    }, [obtenerDireccion]);


  /*
   * =====================================================
   * CARGAR TELÉFONO GUARDADO
   * =====================================================
   */
  useEffect(() => {

    async function cargarTelefonoGuardado() {

      try {

        const telefono =
          await SecureStore.getItemAsync(
            "telefonoCliente"
          );

        if (telefono) {

          setTelefonoCliente(
            telefono
          );

          setTelefonoInput(
            telefono
          );

          await comprobarReservasActivas(
            telefono
          );

        }

      } catch (error) {

        console.log(
          "Error cargando teléfono:",
          error
        );

      }

    }


    cargarTelefonoGuardado();

  }, [comprobarReservasActivas]);


  /*
   * =====================================================
   * ENTRADA EN INDEX
   * =====================================================
   */
  useEffect(() => {

    /*
     * SERVICIO FINALIZADO
     *
     * Volvemos a la ubicación GPS original
     * sin buscar GPS otra vez.
     */
    if (
      params?.reset === "1" &&
      params?.originalLat &&
      params?.originalLng
    ) {

      const latitude =
        Number(params.originalLat);

      const longitude =
        Number(params.originalLng);


      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {

        const direccion =
          typeof params.originalDireccion === "string" &&
            params.originalDireccion
            ? params.originalDireccion
            : "Mi ubicación actual";


        const coords = {
          latitude,
          longitude,
        };


        const pickupGps = {
          latitude,
          longitude,
          direccionRecogida: direccion,
          direccionBase: direccion,
        };


        /*
         * Limpiar viaje anterior
         */
        setReferencia("");

        setCambiandoRecogida(false);

        setMiUbicacion(coords);

        setPickup(pickupGps);

        setPickupOriginal(pickupGps);

        setLoading(false);

        setAddressLoading(false);

        setRequestingTaxi(false);

        return;

      }

    }


    /*
     * SOLICITUD CANCELADA
     *
     * Reutilizamos ubicación anterior.
     */
    if (
      params?.reuseLocation === "1" &&
      params?.lat &&
      params?.lng
    ) {

      const latitude =
        Number(params.lat);

      const longitude =
        Number(params.lng);


      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {

        const direccion =
          typeof params.direccion === "string" &&
            params.direccion
            ? params.direccion
            : "Ubicación actual";


        const coords = {
          latitude,
          longitude,
        };


        const pickupAnterior = {
          latitude,
          longitude,
          direccionRecogida: direccion,
          direccionBase: direccion,
        };


        setMiUbicacion(coords);

        setPickup(pickupAnterior);

        setLoading(false);

        setAddressLoading(false);

        setRequestingTaxi(false);

        return;

      }

    }


    /*
     * Entrada normal.
     */
    cargarMiUbicacion();

  }, [
    cargarMiUbicacion,
    params?.reset,
    params?.originalLat,
    params?.originalLng,
    params?.originalDireccion,
    params?.reuseLocation,
    params?.lat,
    params?.lng,
    params?.direccion,
  ]);


  /*
   * =====================================================
   * TECLADO
   * =====================================================
   */
  useEffect(() => {

    const showEvent =
      Platform.OS === "ios"
        ? "keyboardWillShow"
        : "keyboardDidShow";

    const hideEvent =
      Platform.OS === "ios"
        ? "keyboardWillHide"
        : "keyboardDidHide";


    const showSub =
      Keyboard.addListener(
        showEvent,
        (event) => {

          setKeyboardHeight(
            event.endCoordinates.height
          );

        }
      );


    const hideSub =
      Keyboard.addListener(
        hideEvent,
        () => {

          setKeyboardHeight(0);

        }
      );


    return () => {

      showSub.remove();

      hideSub.remove();

    };

  }, []);


  /*
   * =====================================================
   * SELECCIONAR RECOGIDA EN MAPA
   * =====================================================
   */
  const seleccionarEnMapa =
    useCallback(async (event) => {

      if (!cambiandoRecogida) {
        return;
      }


      const {
        latitude,
        longitude,
      } = event.nativeEvent.coordinate;


      const direccion =
        await obtenerDireccion(
          latitude,
          longitude
        );


      setPickup({
        latitude,
        longitude,
        direccionRecogida: direccion,
        direccionBase: direccion,
      });


      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        350
      );

    }, [
      cambiandoRecogida,
      obtenerDireccion,
    ]);


  /*
   * =====================================================
   * VOLVER A MI UBICACIÓN ORIGINAL
   * =====================================================
   */
  function usarMiUbicacion() {

    setCambiandoRecogida(false);


    if (!miUbicacion) {
      return;
    }


    if (pickupOriginal) {

      setPickup(pickupOriginal);

    } else {

      setPickup({
        latitude: miUbicacion.latitude,
        longitude: miUbicacion.longitude,
        direccionRecogida:
          "Mi ubicación actual",
        direccionBase:
          "Mi ubicación actual",
      });

    }


    mapRef.current?.animateToRegion(
      {
        latitude:
          miUbicacion.latitude,

        longitude:
          miUbicacion.longitude,

        latitudeDelta: 0.006,

        longitudeDelta: 0.006,
      },
      300
    );

  }


  /*
   * =====================================================
   * CREAR SOLICITUD TAXI
   * =====================================================
   */
  async function crearSolicitudTaxi(
    telefono
  ) {

    try {

      if (!pickup) {

        Alert.alert(
          "Ubicación",
          "Todavía no tenemos tu punto de recogida."
        );

        return;

      }


      setRequestingTaxi(true);


      const res =
        await api.solicitarTaxi({

          nombreCliente:
            "Cliente app",

          telefonoCliente:
            telefono,

          lat:
            pickup.latitude,

          lng:
            pickup.longitude,

          direccionRecogida:
            pickup.direccionRecogida,

          direccionBase:
            pickup.direccionBase,

          referenciaRecogida:
            referencia.trim() || null,

        });


      console.log(
        "Solicitud creada:",
        res
      );


      const solicitudId =
        res?.solicitudId ||
        res?.solicitud?.id ||
        res?.id;


      if (!solicitudId) {

        throw new Error(
          "La API no devolvió el identificador de la solicitud."
        );

      }


      router.push({

        pathname: "/ride",

        params: {

          solicitudId:
            String(solicitudId),

          originalLat:
            String(
              pickupOriginal?.latitude ??
              miUbicacion.latitude
            ),

          originalLng:
            String(
              pickupOriginal?.longitude ??
              miUbicacion.longitude
            ),

          originalDireccion:
            pickupOriginal?.direccionRecogida ||
            pickup?.direccionRecogida ||
            "",

        },

      });


    } catch (error) {

      console.log(
        "Error solicitando taxi:",
        error
      );


      Alert.alert(
        "No se pudo pedir el taxi",
        error.message ||
        "Inténtalo de nuevo."
      );


    } finally {

      setRequestingTaxi(false);

    }

  }


  /*
   * =====================================================
   * BOTÓN PEDIR TAXI
   * =====================================================
   */
  /*
   * =====================================================
   * BOTÓN PEDIR TAXI
   * =====================================================
   */
  async function pedirTaxi() {

    /*
     * Ya tiene teléfono guardado.
     */
    if (telefonoCliente) {

      await crearSolicitudTaxi(
        telefonoCliente
      );

      return;
    }


    /*
     * No tiene teléfono.
     *
     * Abrimos modal y recordamos
     * que después hay que pedir taxi.
     */
    setAccionTrasTelefono(
      "pedirTaxi"
    );

    setTelefonoInput(
      "+34"
    );

    setModalTelefonoVisible(
      true
    );

  }


  /*
   * =====================================================
   * BOTÓN RESERVAR TAXI
   * =====================================================
   */
  function abrirReserva() {

    /*
     * Si todavía no tiene teléfono,
     * primero se lo pedimos.
     */
    if (!telefonoCliente) {

      setAccionTrasTelefono(
        "reservar"
      );

      setTelefonoInput(
        "+34"
      );

      setModalTelefonoVisible(
        true
      );

      return;
    }


    /*
     * Ya tiene teléfono.
     */
    irAReserva(
      telefonoCliente
    );

  }

  function abrirMisReservas() {

    if (!telefonoCliente) {

      setAccionTrasTelefono(
        "misReservas"
      );

      setTelefonoInput("+34");

      setModalTelefonoVisible(true);

      return;
    }


    router.push({
      pathname: "/reservas",

      params: {
        telefono:
          telefonoCliente,
      },
    });

  }


  /*
   * =====================================================
   * IR A PANTALLA DE RESERVA
   * =====================================================
   */
  function irAReserva(
    telefono
  ) {

    if (!pickup || !miUbicacion) {

      Alert.alert(
        "Ubicación",
        "Todavía no tenemos tu punto de recogida."
      );

      return;
    }


    router.push({

      pathname:
        "/reservar",

      params: {

        lat:
          String(
            pickup?.latitude ??
            miUbicacion.latitude
          ),

        lng:
          String(
            pickup?.longitude ??
            miUbicacion.longitude
          ),

        direccion:
          pickup?.direccionRecogida ||
          "",

        direccionBase:
          pickup?.direccionBase ||
          pickup?.direccionRecogida ||
          "",

        referencia:
          referencia || "",

        telefono:
          telefono,
      },

    });

  }


  /*
   * =====================================================
   * ABRIR MODAL PARA CAMBIAR TELÉFONO
   * =====================================================
   */
  function cambiarTelefono() {

    /*
     * null significa:
     *
     * después de guardar el teléfono
     * NO hacemos ninguna otra acción.
     */
    setAccionTrasTelefono(
      null
    );

    setTelefonoInput(
      telefonoCliente ||
      "+34"
    );

    setModalTelefonoVisible(
      true
    );

  }


  /*
   * =====================================================
   * CERRAR MODAL TELÉFONO
   * =====================================================
   */
  function cerrarModalTelefono() {

    /*
     * Cancelamos cualquier acción
     * que estuviese pendiente.
     */
    setAccionTrasTelefono(
      null
    );

    setModalTelefonoVisible(
      false
    );

    Keyboard.dismiss();

  }


  /*
   * =====================================================
   * GUARDAR / CONFIRMAR TELÉFONO
   * =====================================================
   */
  async function confirmarTelefono() {

    const telefono =
      normalizarTelefono(
        telefonoInput
      );


    if (!telefono) {

      Alert.alert(
        "Número incorrecto",
        "Introduce un número válido. Por ejemplo: +34 612 345 678"
      );

      return;
    }


    /*
     * Guardamos la acción ANTES
     * de ponerla a null.
     *
     * Puede ser:
     *
     * "pedirTaxi"
     * "reservar"
     * null
     */
    const accion =
      accionTrasTelefono;


    try {

      setGuardandoTelefono(
        true
      );


      /*
       * Guardamos permanentemente
       * el teléfono en el dispositivo.
       */
      await SecureStore.setItemAsync(
        "telefonoCliente",
        telefono
      );


      /*
       * Actualizamos interfaz.
       */
      setTelefonoCliente(
        telefono
      );

      setTelefonoInput(
        telefono
      );

      await comprobarReservasActivas(
        telefono
      );


      /*
       * Cerramos modal.
       */
      setModalTelefonoVisible(
        false
      );

      setAccionTrasTelefono(
        null
      );

      Keyboard.dismiss();


      /*
       * ==================================================
       * VENÍA DE PEDIR TAXI
       * ==================================================
       */
      if (
        accion ===
        "pedirTaxi"
      ) {

        await crearSolicitudTaxi(
          telefono
        );

        return;
      }


      /*
       * ==================================================
       * VENÍA DE RESERVAR TAXI
       * ==================================================
       */
      if (
        accion ===
        "reservar"
      ) {

        irAReserva(
          telefono
        );

        return;
      }

      if (
        accion ===
        "misReservas"
      ) {

        router.push({
          pathname: "/reservas",

          params: {
            telefono,
          },
        });

        return;
      }


      /*
       * ==================================================
       * VENÍA DE CAMBIAR TELÉFONO
       * ==================================================
       *
       * No hacemos nada más.
       *
       * Ya está guardado y el modal
       * simplemente se cierra.
       */

    } catch (error) {

      console.log(
        "Error guardando teléfono:",
        error
      );


      Alert.alert(
        "Error",
        "No se pudo guardar el número de teléfono."
      );


    } finally {

      setGuardandoTelefono(
        false
      );

    }

  }


  /*
   * =====================================================
   * CARGANDO UBICACIÓN
   * =====================================================
   */
  if (
    loading ||
    !miUbicacion
  ) {

    return (

      <View style={styles.centered}>

        <ActivityIndicator
          size="large"
          color="#111827"
        />

        <Text
          style={styles.loadingText}
        >
          Iniciando aplicación…
        </Text>

      </View>

    );

  }


  const direccion =
    pickup?.direccionRecogida ||
    "Ubicación actual";


  return (

    <SafeAreaView
      style={styles.container}
      edges={[
        "top",
        "bottom",
      ]}
    >

      <View
        style={{
          flex: 1,
        }}
      >

        {/* =================================================
            MAPA
        ================================================= */}

        <MapView

          provider={
            PROVIDER_GOOGLE
          }

          ref={
            mapRef
          }

          style={
            styles.map
          }

          initialRegion={{
            latitude:
              miUbicacion.latitude,

            longitude:
              miUbicacion.longitude,

            latitudeDelta:
              0.006,

            longitudeDelta:
              0.006,
          }}

          showsUserLocation

          showsMyLocationButton={
            false
          }

          rotateEnabled={
            false
          }

          onPress={
            seleccionarEnMapa
          }

        >

          {pickup && (

            <Marker

              coordinate={{
                latitude:
                  pickup.latitude,

                longitude:
                  pickup.longitude,
              }}

              anchor={{
                x: 0.5,
                y: 1,
              }}

            >

              <View
                style={
                  styles.pickupMarker
                }
              >

                <Ionicons
                  name="location-sharp"
                  size={42}
                  color="#111827"
                />

              </View>

            </Marker>

          )}

        </MapView>


        {/* =================================================
            AVISO CAMBIAR RECOGIDA
        ================================================= */}

        {cambiandoRecogida && (

          <View
            style={
              styles.mapInstruction
            }
          >

            <Ionicons
              name="finger-print-outline"
              size={20}
              color="#111827"
            />

            <Text
              style={
                styles.mapInstructionText
              }
            >
              Toca en el mapa donde quieres que te recojamos
            </Text>

          </View>

        )}


        {/* =================================================
            TARJETA PRINCIPAL
        ================================================= */}

        <View
          style={[
            styles.bottomCard,
            {
              bottom:
                keyboardHeight > 0
                  ? keyboardHeight + 10
                  : 20,
            },
          ]}
        >


          {/* =================================================
                DIRECCIÓN
            ================================================= */}

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

                <Text style={styles.pickupLabel}>
                  Recogida
                </Text>


                <Text
                  style={styles.pickupAddress}
                  numberOfLines={2}
                >
                  {addressLoading
                    ? "Buscando dirección…"
                    : direccion}
                </Text>

              </View>


              {!cambiandoRecogida && (

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

              )}

            </View>

          </View>

          {/* =================================================
              REFERENCIA
          ================================================= */}

          {!cambiandoRecogida && (

            <View
              style={
                styles.referenceBox
              }
            >

              <Ionicons
                name="chatbubble-outline"
                size={19}
                color="#64748b"
              />


              <TextInput

                style={
                  styles.referenceInput
                }

                value={
                  referencia
                }

                onChangeText={
                  setReferencia
                }

                placeholder="Ej: puerta de urgencias, frente al bar…"

                placeholderTextColor="#94a3b8"

                maxLength={120}

                returnKeyType="done"

                blurOnSubmit

              />

            </View>

          )}


          {/* =================================================
              MODO NORMAL
          ================================================= */}

          {!cambiandoRecogida && (

            <>

              <TouchableOpacity

                style={[
                  styles.primaryButton,

                  (
                    requestingTaxi ||
                    addressLoading
                  ) &&
                  styles.buttonDisabled,

                ]}

                disabled={
                  requestingTaxi ||
                  addressLoading
                }

                onPress={
                  pedirTaxi
                }

              >

                {requestingTaxi ? (

                  <ActivityIndicator
                    color="#fff"
                  />

                ) : (

                  <>

                    <Ionicons
                      name="car-outline"
                      size={21}
                      color="#fff"
                    />

                    <Text
                      style={
                        styles.primaryButtonText
                      }
                    >
                      Pedir taxi
                    </Text>

                  </>

                )}

              </TouchableOpacity>

              <View style={styles.reservationsRow}>

                <TouchableOpacity
                  style={styles.reservationHalfButton}
                  onPress={abrirReserva}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color="#111827"
                  />

                  <Text style={styles.reservationHalfText}>
                    Reservar taxi
                  </Text>
                </TouchableOpacity>


                <View style={styles.reservationDivider} />


                <TouchableOpacity
                  style={[
                    styles.reservationHalfButton,
                    styles.misReservasButton,
                  ]}
                  onPress={abrirMisReservas}
                >

                  {tieneReservasActivas && (
                    <View
                      style={
                        styles.reservaNotificationDot
                      }
                    />
                  )}

                  <Ionicons
                    name="list-outline"
                    size={18}
                    color="#111827"
                  />

                  <Text
                    style={
                      styles.reservationHalfText
                    }
                  >
                    Mis reservas
                  </Text>

                </TouchableOpacity>
              </View>


              {/* TELÉFONO GUARDADO */}

              {telefonoCliente && (

                <View
                  style={
                    styles.phoneRow
                  }
                >

                  <View
                    style={
                      styles.phoneRowLeft
                    }
                  >

                    <Ionicons
                      name="call-outline"
                      size={16}
                      color="#64748b"
                    />

                    <Text
                      style={
                        styles.savedPhoneText
                      }
                    >
                      {telefonoCliente}
                    </Text>

                  </View>


                  <TouchableOpacity
                    onPress={
                      cambiarTelefono
                    }
                  >

                    <Text
                      style={
                        styles.changePhoneText
                      }
                    >
                      Cambiar
                    </Text>

                  </TouchableOpacity>

                </View>

              )}

            </>

          )}


          {/* =================================================
              MODO CAMBIAR RECOGIDA
          ================================================= */}

          {cambiandoRecogida && (

            <>

              <TouchableOpacity

                style={[
                  styles.primaryButton,

                  addressLoading &&
                  styles.buttonDisabled,
                ]}

                disabled={
                  addressLoading
                }

                onPress={() =>
                  setCambiandoRecogida(false)
                }

              >

                <Ionicons
                  name="checkmark"
                  size={21}
                  color="#fff"
                />

                <Text
                  style={
                    styles.primaryButtonText
                  }
                >
                  Confirmar esta ubicación
                </Text>

              </TouchableOpacity>


              <TouchableOpacity

                style={
                  styles.changeButton
                }

                onPress={
                  usarMiUbicacion
                }

              >

                <Ionicons
                  name="locate-outline"
                  size={18}
                  color="#334155"
                />

                <Text
                  style={
                    styles.changeButtonText
                  }
                >
                  Volver a mi ubicación actual
                </Text>

              </TouchableOpacity>

            </>

          )}

        </View>

        {/* =================================================
    MODAL TELÉFONO
================================================= */}

        <Modal

          visible={
            modalTelefonoVisible
          }

          transparent

          animationType="fade"

          onRequestClose={
            cerrarModalTelefono
          }

        >

          <KeyboardAvoidingView

            style={
              styles.phoneModalOverlay
            }

            behavior={
              Platform.OS === "ios"
                ? "padding"
                : "height"
            }

          >

            <View
              style={
                styles.phoneModalCard
              }
            >

              <View
                style={
                  styles.phoneIcon
                }
              >

                <Ionicons
                  name="call-outline"
                  size={25}
                  color="#111827"
                />

              </View>


              <Text
                style={
                  styles.phoneTitle
                }
              >

                {accionTrasTelefono === "pedirTaxi"
                  ? "Introduce tu teléfono"
                  : accionTrasTelefono === "reservar"
                    ? "Teléfono de contacto"
                    : accionTrasTelefono === "misReservas"
                      ? "Consulta tus reservas"
                      : "Cambiar teléfono"}

              </Text>


              <Text
                style={
                  styles.phoneSubtitle
                }
              >

                {accionTrasTelefono === "pedirTaxi"
                  ? "El taxista podrá utilizar este número para contactar contigo durante el servicio."
                  : accionTrasTelefono === "reservar"
                    ? "Necesitamos un número para identificar tu reserva."
                    : accionTrasTelefono === "misReservas"
                      ? "Introduce tu número para consultar las reservas asociadas."
                      : "Introduce el nuevo número que quieres utilizar en tus próximos servicios."}
              </Text>


              <TextInput

                style={
                  styles.phoneInput
                }

                value={
                  telefonoInput
                }

                onChangeText={
                  setTelefonoInput
                }

                placeholder="+34 612 345 678"

                keyboardType="phone-pad"

                autoFocus

                returnKeyType="done"

                onSubmitEditing={
                  confirmarTelefono
                }

              />


              <Text
                style={
                  styles.phoneHint
                }
              >
                Asegúrate de escribir correctamente tu número.
              </Text>


              <TouchableOpacity

                style={[
                  styles.phoneContinueButton,

                  guardandoTelefono &&
                  styles.buttonDisabled,
                ]}

                disabled={
                  guardandoTelefono
                }

                onPress={
                  confirmarTelefono
                }

              >

                {guardandoTelefono ? (

                  <ActivityIndicator
                    color="#fff"
                  />

                ) : (

                  <Text
                    style={
                      styles.phoneContinueText
                    }
                  >

                    {accionTrasTelefono === "pedirTaxi"
                      ? "Continuar y pedir taxi"
                      : accionTrasTelefono === "reservar"
                        ? "Continuar con la reserva"
                        : accionTrasTelefono === "misReservas"
                          ? "Ver mis reservas"
                          : "Guardar número"}

                  </Text>

                )}

              </TouchableOpacity>


              <TouchableOpacity

                style={
                  styles.phoneCancelButton
                }

                disabled={
                  guardandoTelefono
                }

                onPress={
                  cerrarModalTelefono
                }

              >

                <Text
                  style={
                    styles.phoneCancelText
                  }
                >
                  Cancelar
                </Text>

              </TouchableOpacity>

            </View>

          </KeyboardAvoidingView>

        </Modal>

      </View>

    </SafeAreaView>

  );

}


const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#fff",
  },


  map: {
    flex: 1,
  },


  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },


  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#475569",
  },


  pickupMarker: {
    alignItems: "center",
    justifyContent: "center",
  },


  mapInstruction: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,

    backgroundColor: "#fff",

    borderRadius: 16,

    paddingVertical: 12,
    paddingHorizontal: 16,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 8,

    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 6,
  },


  mapInstructionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },


  bottomCard: {
    position: "absolute",

    left: 12,
    right: 12,

    backgroundColor: "#fff",

    borderRadius: 24,

    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,

    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 15,

    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 10,
  },


  dragHandle: {
    width: 42,
    height: 5,

    borderRadius: 99,

    backgroundColor: "#e2e8f0",

    alignSelf: "center",

    marginBottom: 14,
  },


  title: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0f172a",
  },


  subtitle: {
    marginTop: 4,
    marginBottom: 12,

    fontSize: 13,

    color: "#64748b",
  },

  referenceBox: {
    marginTop: 10,

    minHeight: 50,

    borderRadius: 16,

    backgroundColor: "#f8fafc",

    borderWidth: 1,
    borderColor: "#e2e8f0",

    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 14,

    gap: 10,
  },


  referenceInput: {
    flex: 1,

    fontSize: 14,

    color: "#111827",

    paddingVertical: 12,
  },


  primaryButton: {
    marginTop: 14,

    backgroundColor: "#111827",

    minHeight: 54,

    borderRadius: 17,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    gap: 9,
  },


  primaryButtonText: {
    color: "#fff",

    fontSize: 17,

    fontWeight: "800",
  },


  buttonDisabled: {
    opacity: 0.6,
  },


  changeButton: {
    marginTop: 8,

    minHeight: 44,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    gap: 7,
  },


  changeButtonText: {
    color: "#334155",

    fontSize: 14,

    fontWeight: "700",
  },


  /*
   * TELÉFONO MOSTRADO EN PRINCIPAL
   */
  phoneRow: {
    marginTop: 2,

    minHeight: 38,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "space-between",

    paddingHorizontal: 8,
  },


  phoneRowLeft: {
    flexDirection: "row",

    alignItems: "center",

    gap: 7,
  },


  savedPhoneText: {
    fontSize: 13,

    color: "#64748b",

    fontWeight: "600",
  },


  changePhoneText: {
    fontSize: 13,

    color: "#111827",

    fontWeight: "800",
  },


  /*
   * MODAL TELÉFONO
   */
  phoneModalOverlay: {
    flex: 1,

    backgroundColor:
      "rgba(15, 23, 42, 0.45)",

    justifyContent: "center",

    paddingHorizontal: 20,
  },


  phoneModalCard: {
    backgroundColor: "#fff",

    borderRadius: 24,

    paddingHorizontal: 20,

    paddingTop: 24,

    paddingBottom: 18,
  },


  phoneIcon: {
    width: 48,
    height: 48,

    borderRadius: 24,

    backgroundColor: "#f1f5f9",

    alignItems: "center",

    justifyContent: "center",

    marginBottom: 16,
  },


  phoneTitle: {
    fontSize: 22,

    fontWeight: "800",

    color: "#0f172a",
  },


  phoneSubtitle: {
    marginTop: 7,

    fontSize: 14,

    lineHeight: 20,

    color: "#64748b",
  },


  phoneInput: {
    marginTop: 20,

    height: 56,

    borderRadius: 16,

    borderWidth: 1,

    borderColor: "#cbd5e1",

    backgroundColor: "#f8fafc",

    paddingHorizontal: 16,

    fontSize: 19,

    fontWeight: "700",

    color: "#111827",
  },


  phoneHint: {
    marginTop: 8,

    fontSize: 12,

    color: "#64748b",
  },


  phoneContinueButton: {
    marginTop: 20,

    minHeight: 54,

    borderRadius: 17,

    backgroundColor: "#111827",

    alignItems: "center",

    justifyContent: "center",
  },


  phoneContinueText: {
    color: "#fff",

    fontSize: 16,

    fontWeight: "800",
  },


  phoneCancelButton: {
    minHeight: 44,

    alignItems: "center",

    justifyContent: "center",

    marginTop: 5,
  },


  phoneCancelText: {
    color: "#475569",

    fontSize: 14,

    fontWeight: "700",
  },

  reservationsRow: {
    marginTop: 8,

    minHeight: 50,

    flexDirection: "row",

    borderRadius: 17,

    borderWidth: 1,
    borderColor: "#cbd5e1",

    backgroundColor: "#ffffff",

    overflow: "hidden",
  },

  reservationHalfButton: {
    flex: 1,

    flexDirection: "row",

    alignItems: "center",
    justifyContent: "center",

    gap: 7,

    paddingHorizontal: 8,
  },

  reservationDivider: {
    width: 1,

    marginVertical: 10,

    backgroundColor: "#e2e8f0",
  },

  reservationHalfText: {
    fontSize: 13,

    color: "#111827",

    fontWeight: "800",
  },

  pickupCard: {
    marginTop: 12,

    backgroundColor: "#f8fafc",

    borderRadius: 18,

    borderWidth: 1,
    borderColor: "#e2e8f0",

    padding: 13,
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

    backgroundColor: "#e2e8f0",

    alignItems: "center",
    justifyContent: "center",
  },

  pickupLabel: {
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
  misReservasButton: {
    position: "relative",
  },

  reservaNotificationDot: {
    position: "absolute",

    top: 7,
    right: 10,

    width: 9,
    height: 9,

    borderRadius: 5,

    backgroundColor: "#ef4444",

    borderWidth: 2,
    borderColor: "#ffffff",

    zIndex: 10,
  },
});