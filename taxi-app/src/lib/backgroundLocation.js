import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKGROUND_LOCATION_TASK =
  "taxi-background-location-task";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://api.sjaceuta.es"
).replace(/\/$/, "");

TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      console.log(
        "❌ Task background location error:",
        error.message
      );
      return;
    }

    try {
      const locations = data?.locations;

      if (!locations?.length) {
        return;
      }

      const last =
        locations[locations.length - 1];

      const lat =
        last?.coords?.latitude;

      const lng =
        last?.coords?.longitude;

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      ) {
        return;
      }

      const token =
        await AsyncStorage.getItem("token");

      if (!token) {
        console.log(
          "⚠️ GPS background sin token"
        );
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/mobile/ubicacion-background`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            lat,
            lng,
          }),
        }
      );

      if (!response.ok) {
        const texto =
          await response
            .text()
            .catch(() => "");

        console.log(
          "❌ Error enviando GPS background:",
          response.status,
          texto
        );

        return;
      }

      console.log(
        "📍 GPS background enviado:",
        lat,
        lng
      );

    } catch (e) {
      console.log(
        "❌ Error task background location:",
        e?.message || e
      );
    }
  }
);

export async function startBackgroundLocationUpdates() {
  try {
    const foreground =
      await Location.getForegroundPermissionsAsync();

    if (
      foreground.status !==
      "granted"
    ) {
      console.log(
        "❌ No hay permiso de ubicación foreground"
      );

      return false;
    }

    const background =
      await Location.getBackgroundPermissionsAsync();

    if (
      background.status !==
      "granted"
    ) {
      console.log(
        "❌ No hay permiso de ubicación background"
      );

      return false;
    }

    const started =
      await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      );

    if (started) {
      return true;
    }

    await Location.startLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK,
      {
        accuracy:
          Location.Accuracy.High,

        timeInterval:
          10000,

        distanceInterval:
          10,

        showsBackgroundLocationIndicator:
          true,

        foregroundService: {
          notificationTitle:
            "Taxi activo",

          notificationBody:
            "Compartiendo ubicación mientras estás disponible",

          notificationColor:
            "#2563eb",
        },
      }
    );

    console.log(
      "✅ Ubicación background iniciada"
    );

    return true;

  } catch (error) {
    console.log(
      "❌ Error iniciando ubicación background:",
      error?.message || error
    );

    return false;
  }
}

export async function stopBackgroundLocationUpdates() {
  try {
    const started =
      await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      );

    if (!started) {
      return;
    }

    await Location.stopLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    );

    console.log(
      "🛑 Ubicación background detenida"
    );

  } catch (error) {
    console.log(
      "❌ Error deteniendo ubicación background:",
      error?.message || error
    );
  }
}