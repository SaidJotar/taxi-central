import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../src/api/client";

export default function ChatScreen() {
  const { solicitudId } = useLocalSearchParams();

  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const cargarMensajes = useCallback(async () => {
    try {
      if (!solicitudId) return;
      const res = await api.getMensajes(String(solicitudId));
      setMensajes(Array.isArray(res?.mensajes) ? res.mensajes : []);
    } catch (error) {
      console.log("Error cargando mensajes:", error.message);
    } finally {
      setLoading(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    cargarMensajes();

    const interval = setInterval(() => {
      cargarMensajes();
    }, 2500);

    return () => clearInterval(interval);
  }, [cargarMensajes]);

  const enviar = async () => {
    try {
      if (!texto.trim()) return;

      setEnviando(true);
      await api.enviarMensaje(String(solicitudId), texto.trim());
      setTexto("");
      await cargarMensajes();
    } catch (error) {
      console.log("Error enviando mensaje:", error.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mensaje al taxista</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#111827" />
          </View>
        ) : (
          <FlatList
            data={mensajes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const esCliente = item.emisorTipo === "cliente";

              return (
                <View
                  style={[
                    styles.messageBubble,
                    esCliente ? styles.messageCliente : styles.messageTaxista,
                  ]}
                >
                  <Text
                    style={[
                      styles.messageText,
                      esCliente && { color: "#fff" },
                    ]}
                  >
                    {item.texto}
                  </Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje"
            value={texto}
            onChangeText={setTexto}
          />

          <TouchableOpacity
            style={[styles.sendButton, enviando && { opacity: 0.7 }]}
            onPress={enviar}
            disabled={enviando}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  messageBubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageCliente: {
    alignSelf: "flex-end",
    backgroundColor: "#111827",
  },
  messageTaxista: {
    alignSelf: "flex-start",
    backgroundColor: "#f1f5f9",
  },
  messageText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#111827",
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
});