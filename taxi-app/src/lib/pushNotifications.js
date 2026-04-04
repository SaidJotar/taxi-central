import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      console.log("❌ No es dispositivo físico");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Ofertas",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sound: "default",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;

    if (finalStatus !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      console.log("❌ Permiso notificaciones denegado");
      return null;
    }

    try {
      const nativeToken = await Notifications.getDevicePushTokenAsync();
      console.log("📡 Token nativo del dispositivo:", nativeToken);
    } catch (e) {
      console.log("❌ Error obteniendo token nativo FCM:", e?.message);
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.log("❌ No hay projectId");
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log("📲 Token Expo obtenido:", token.data);

    return token.data;
  } catch (error) {
    console.log("❌ Error obteniendo push token:", error.message);
    return null;
  }
}