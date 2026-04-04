import React, { useEffect, useRef } from "react";
import { Tabs, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, View, TouchableOpacity } from "react-native";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { OfertaProvider, useOferta } from "../src/context/OfertaContext";
import LoginScreen from "../src/screens/LoginScreen";
import GlobalOfertaLayer from "../src/components/GlobalOfertaLayer";
import { api } from "../src/api/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#0f172a",
  textSoft: "#64748b",
  primary: "#2563eb",
  border: "#e2e8f0",
};

function HeaderRightActions() {
  const router = useRouter();
  const { logout } = useAuth();
  const { servicioActivo } = useOferta();

  const cerrarSesion = () => {
    if (servicioActivo) {
      Alert.alert(
        "Servicio activo",
        "No puedes cerrar sesión mientras tienes un servicio en curso."
      );
      return;
    }

    logout();
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: 8 }}>
      <TouchableOpacity
        onPress={() => router.push("/perfil")}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "#eff6ff",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="person-outline" size={20} color={COLORS.primary} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={cerrarSesion}
        disabled={!!servicioActivo}
        style={{ marginRight: 14, opacity: servicioActivo ? 0.4 : 1 }}
      >
        <Ionicons name="log-out-outline" size={24} color="#0f172a" />
      </TouchableOpacity>
    </View>
  );
}

function AppContent() {
  const { token, loadingSession } = useAuth();
  const { setOferta } = useOferta();

  const notificationListener = useRef(null);
  const responseListener = useRef(null);
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("🔔 Notificación recibida:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener(async (response) => {
        try {
          const data = response?.notification?.request?.content?.data;
          console.log("👉 Notificación pulsada:", data);

          if (!token) return;

          const ofertaPendiente = await api.getOfertaPendiente(token);
          console.log("📦 oferta pendiente desde notificación:", ofertaPendiente);

          if (ofertaPendiente) {
            setOferta(ofertaPendiente);
          }
        } catch (e) {
          console.log("Error procesando notificación:", e.message);
        }
      });

    return () => {
      notificationListener.current?.remove?.();
      responseListener.current?.remove?.();
    };
  }, [token, setOferta]);

  if (loadingSession) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const esRutaPublica = segments[0] === "objetos-perdidos";

  if (!token && !esRutaPublica) {
    return <LoginScreen />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerTitleAlign: "center",
          headerStyle: {
            backgroundColor: COLORS.card,
          },
          headerShadowVisible: false,
          headerTintColor: COLORS.text,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "800",
            color: COLORS.text,
          },
          sceneStyle: {
            backgroundColor: COLORS.bg,
          },
          tabBarStyle: {
            height: 60 + insets.bottom,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 8),
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            backgroundColor: COLORS.card,
          },
          tabBarItemStyle: {
            paddingVertical: 4,
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textSoft,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "700",
            marginBottom: 2,
          },
          headerRight: () => <HeaderRightActions />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Inicio",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="paradas"
          options={{
            title: "Paradas",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="location-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="servicios"
          options={{
            title: "Servicios",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="car-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="objetos"
          options={{
            title: "Objetos",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cube-outline" size={size} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="perfil"
          options={{
            href: null,
            title: "Mi perfil",
          }}
        />

        <Tabs.Screen name="objetos-perdidos" options={{ href: null, headerShown: false }} />
      </Tabs>

      <GlobalOfertaLayer />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OfertaProvider>
        <AppContent />
      </OfertaProvider>
    </AuthProvider>
  );
}