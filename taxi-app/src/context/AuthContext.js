import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { disconnectSocket } from "../api/socket";
import { stopBackgroundLocationUpdates } from "../lib/backgroundLocation";
import { api } from "../api/client";
import { registerForPushNotificationsAsync } from "../lib/pushNotifications";

const AuthContext = createContext(null);

const STORAGE_TOKEN_KEY = "token";
const STORAGE_TAXISTA_KEY = "taxista";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [taxista, setTaxista] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    const cargarSesion = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(STORAGE_TOKEN_KEY);
        const savedTaxista = await AsyncStorage.getItem(STORAGE_TAXISTA_KEY);

        if (savedToken) {
          setToken(savedToken);
        }

        if (savedTaxista) {
          setTaxista(JSON.parse(savedTaxista));
        }
      } catch (error) {
        console.log("Error cargando sesión:", error.message);
      } finally {
        setLoadingSession(false);
      }
    };

    cargarSesion();
  }, []);

  useEffect(() => {
  const sincronizarPushToken = async () => {
    try {
      if (!token) return;

      const expoPushToken = await registerForPushNotificationsAsync();
      console.log("📲 Token Expo sincronizado al arrancar:", expoPushToken);

      if (!expoPushToken) return;

      await api.guardarPushToken(token, expoPushToken);
      console.log("✅ Push token sincronizado con backend");
    } catch (error) {
      console.log("❌ Error sincronizando push token:", error?.message);
    }
  };

  sincronizarPushToken();
}, [token]);

  const value = useMemo(
    () => ({
      token,
      taxista,
      loadingSession,

      setSession: async (newToken, newTaxista) => {
        setToken(newToken);
        setTaxista(newTaxista);

        await AsyncStorage.setItem(STORAGE_TOKEN_KEY, newToken);
        await AsyncStorage.setItem(STORAGE_TAXISTA_KEY, JSON.stringify(newTaxista));
      },

      updateTaxista: async (newTaxista) => {
        setTaxista(newTaxista);
        await AsyncStorage.setItem(STORAGE_TAXISTA_KEY, JSON.stringify(newTaxista));
      },

logout: async () => {
  try {
    if (token) {
      await api.logout(token);
    }
  } catch (error) {
    console.log("Error logout backend:", error?.message);
  } finally {
    disconnectSocket();
    await stopBackgroundLocationUpdates();

    setToken(null);
    setTaxista(null);

    await AsyncStorage.removeItem(STORAGE_TOKEN_KEY);
    await AsyncStorage.removeItem(STORAGE_TAXISTA_KEY);
  }
},
    }),
    [token, taxista, loadingSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }

  return ctx;
}