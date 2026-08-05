import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import MapView, {Marker, PROVIDER_GOOGLE} from "react-native-maps";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { api } from "../src/api/client";

function formatearDireccionDesdeReverse(item) {
  if (!item) return "";

  const linea1 = [item.street, item.streetNumber].filter(Boolean).join(" ");
  const linea2 = [item.district, item.city].filter(Boolean).join(", ");

  return [linea1, linea2].filter(Boolean).join(", ");
}

export default function HomeScreen() {
  const mapRef = useRef(null);
  const mapMoveTimeoutRef = useRef(null);

  const [loadingLocation, setLoadingLocation] = useState(true);
  const [region, setRegion] = useState(null);
  const [pickup, setPickup] = useState(null);

  const [addressLoading, setAddressLoading] = useState(false);
  const [requestingTaxi, setRequestingTaxi] = useState(false);

  const reverseGeocode = useCallback(async (latitude, longitude) => {
    try {
      setAddressLoading(true);

      const items = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      const first = items?.[0] || null;
      const direccion = formatearDireccionDesdeReverse(first);

      setPickup({
        latitude,
        longitude,
        direccionRecogida: direccion || "Ubicación seleccionada en el mapa",
        direccionBase: direccion || "Ubicación seleccionada en el mapa",
        referenciaRecogida: null,
      });
    } catch (error) {
      setPickup({
        latitude,
        longitude,
        direccionRecogida: "Ubicación seleccionada en el mapa",
        direccionBase: "Ubicación seleccionada en el mapa",
        referenciaRecogida: null,
      });
    } finally {
      setAddressLoading(false);
    }
  }, []);

  const pickupCoords = useMemo(() => {
    if (
      pickup &&
      typeof pickup.latitude === "number" &&
      typeof pickup.longitude === "number"
    ) {
      return {
        latitude: pickup.latitude,
        longitude: pickup.longitude,
      };
    }
    return null;
  }, [pickup]);

  const centrarEnMiUbicacion = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const nextRegion = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };

      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 600);

      await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
    } catch (error) {
      Alert.alert("Ubicación", "No se pudo centrar el mapa.");
    }
  }, [reverseGeocode]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoadingLocation(true);

        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          Alert.alert(
            "Permiso requerido",
            "Necesitamos la ubicación para pedir un taxi."
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (!mounted) return;

        const nextRegion = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        };

        setRegion(nextRegion);
        await reverseGeocode(loc.coords.latitude, loc.coords.longitude);
      } catch (error) {
        Alert.alert("Ubicación", "No se pudo obtener tu ubicación actual.");
      } finally {
        if (mounted) {
          setLoadingLocation(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;

      if (mapMoveTimeoutRef.current) {
        clearTimeout(mapMoveTimeoutRef.current);
      }
    };
  }, [reverseGeocode]);

  const onRegionChangeComplete = useCallback(
    (nextRegion) => {
      setRegion(nextRegion);

      if (mapMoveTimeoutRef.current) {
        clearTimeout(mapMoveTimeoutRef.current);
      }

      mapMoveTimeoutRef.current = setTimeout(() => {
        reverseGeocode(nextRegion.latitude, nextRegion.longitude);
      }, 500);
    },
    [reverseGeocode]
  );

  async function pedirTaxi() {
    try {
      if (!pickupCoords || !pickup?.direccionRecogida) {
        Alert.alert(
          "Recogida",
          "Coloca el pin correctamente antes de pedir el taxi."
        );
        return;
      }

      setRequestingTaxi(true);

      const res = await api.solicitarTaxi({
        nombreCliente: "Centralita",
        telefonoCliente: "App cliente",
        lat: pickupCoords.latitude,
        lng: pickupCoords.longitude,
        direccionRecogida: pickup.direccionRecogida,
        direccionBase: pickup.direccionBase,
        referenciaRecogida: pickup.referenciaRecogida,
      });

      router.push({
        pathname: "/ride",
        params: {
          solicitudId: res.solicitudId,
        },
      });
    } catch (error) {
      Alert.alert("Error", error.message || "No se pudo pedir el taxi.");
    } finally {
      setRequestingTaxi(false);
    }
  }

  if (loadingLocation || !region) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Cargando mapa…</Text>
      </View>
    );
  }

  const direccionActual =
    pickup?.direccionRecogida || "Mueve el mapa para seleccionar la recogida";

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <MapView
       provider={PROVIDER_GOOGLE}
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        rotateEnabled={false}
      />

      <View pointerEvents="none" style={styles.centerPinWrap}>
        <Ionicons name="location-sharp" size={38} color="#111827" />
      </View>

      <TouchableOpacity
        style={styles.locateButton}
        onPress={centrarEnMiUbicacion}
      >
        <View style={styles.locateIconWrap}>
          <Ionicons name="locate" size={22} color="#111827" />
        </View>
      </TouchableOpacity>

      <View style={styles.bottomCard}>
        <View style={styles.dragHandle} />
        <Text style={styles.title}>Confirma tu recogida</Text>
        <Text style={styles.subtitle}>
          Mueve el mapa hasta colocar el pin exactamente donde quieres que te recojamos.
        </Text>

        <View style={styles.addressBox}>
          <View style={styles.addressBullet} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>Punto de recogida</Text>
            <Text style={styles.addressValue}>
              {addressLoading ? "Buscando dirección…" : direccionActual}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (requestingTaxi || addressLoading) && styles.buttonDisabled,
          ]}
          disabled={requestingTaxi || addressLoading}
          onPress={pedirTaxi}
        >
          {requestingTaxi ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="car-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Pedir taxi</Text>
            </>
          )}
        </TouchableOpacity>
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
  },
  loadingText: {
    marginTop: 10,
    color: "#334155",
    fontSize: 15,
  },
  centerPinWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -19,
    marginTop: -18,
    alignItems: "center",
    justifyContent: "center",
  },
  locateButton: {
    position: "absolute",
    top: 64,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  locateIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomCard: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 60,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748b",
  },
  addressBox: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 10,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  addressBullet: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#111827",
    marginTop: 5,
  },
  addressLabel: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  addressValue: {
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 21,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});