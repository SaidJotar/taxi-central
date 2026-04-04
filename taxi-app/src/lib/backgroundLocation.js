import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { getSocket } from "../api/socket";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKGROUND_LOCATION_TASK = "taxi-background-location-task";

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.log("❌ Task background location error:", error.message);
    return;
  }

  try {
    const locations = data?.locations;
    if (!locations?.length) return;

    const last = locations[locations.length - 1];
    const lat = last?.coords?.latitude;
    const lng = last?.coords?.longitude;

    if (typeof lat !== "number" || typeof lng !== "number") return;

    console.log("📡 background location:", { lat, lng });

    const token = await AsyncStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    socket.emit("taxista:ubicacion", { lat, lng });
  } catch (e) {
    console.log("❌ Error task background location:", e.message);
  }
});

export async function startBackgroundLocationUpdates() {
  const started = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );

  if (started) return;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Taxi activo",
      notificationBody: "Compartiendo ubicación mientras estás disponible",
      notificationColor: "#2563eb",
    },
  });
}

export async function stopBackgroundLocationUpdates() {
  const started = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );

  if (!started) return;

  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}