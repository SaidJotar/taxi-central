import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import AppScreen from "../components/ui/AppScreen";
import AppCard from "../components/ui/AppCard";
import AppButton from "../components/ui/AppButton";
import AppBadge from "../components/ui/AppBadge";
import SectionHeader from "../components/ui/SectionHeader";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function ObjetosScreen() {
  const { token } = useAuth();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const cargarObjetos = useCallback(
    async (silencioso = false) => {
      try {
        if (silencioso) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        const objetos = await api.getObjetosPerdidos(token);
        setData(Array.isArray(objetos) ? objetos : []);
      } catch (e) {
        setError("No se pudieron cargar los objetos perdidos.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    cargarObjetos();
  }, [cargarObjetos]);

  const guardarObjeto = async () => {
    try {
      if (!descripcion.trim()) {
        setError("Debes escribir una descripción del objeto.");
        return;
      }

      if (!token) {
        setError("No hay sesión activa.");
        return;
      }

      setGuardando(true);
      setError("");

      await api.crearObjetoPerdido(token, {
        descripcion,
        observaciones,
      });

      setDescripcion("");
      setObservaciones("");
      await cargarObjetos(true);
    } catch (e) {
      setError("No se pudo registrar el objeto perdido.");
    } finally {
      setGuardando(false);
    }
  };

  const marcarEntregado = async (id) => {
    try {
      if (!token) {
        setError("No hay sesión activa.");
        return;
      }

      setError("");
      await api.marcarObjetoEntregado(token, id);
      await cargarObjetos(true);
    } catch (e) {
      setError("No se pudo marcar el objeto como entregado.");
    }
  };

  const eliminarObjeto = async (id) => {
    Alert.alert(
      "Eliminar objeto",
      "¿Seguro que quieres eliminar este objeto perdido?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            try {
              if (!token) {
                setError("No hay sesión activa.");
                return;
              }

              setError("");
              await api.eliminarObjetoPerdido(token, id);
              await cargarObjetos(true);
            } catch (e) {
              setError(`No se pudo eliminar el objeto perdido: ${e.message}`);
            }
          },
        },
      ]
    );
  };

  return (
    <AppScreen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => cargarObjetos(true)}
            />
          }
        >
          <SectionHeader
            title="Objetos perdidos"
            subtitle="Registra y gestiona los objetos encontrados en el taxi"
          />

          <AppCard style={styles.formCard}>
            <Text style={styles.formTitle}>Registrar nuevo objeto</Text>

            <TextInput
              style={styles.input}
              placeholder="Descripción del objeto"
              value={descripcion}
              onChangeText={setDescripcion}
              returnKeyType="done"
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Observaciones (opcional)"
              value={observaciones}
              onChangeText={setObservaciones}
              multiline
            />

            <AppButton
              title={guardando ? "Guardando..." : "Guardar objeto"}
              onPress={guardarObjeto}
              variant="dark"
              disabled={guardando}
            />
          </AppCard>

          {!!error && (
            <View style={styles.messageWrap}>
              <AppBadge label="Error" variant="danger" />
              <Text style={styles.error}>{error}</Text>
            </View>
          )}

          {loading && (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.infoText}>Cargando objetos...</Text>
            </View>
          )}

          {!loading && data.length === 0 && !error && (
            <AppCard>
              <Text style={styles.empty}>No hay objetos perdidos registrados.</Text>
            </AppCard>
          )}

          {!loading &&
            data.map((item) => (
              <AppCard key={item.id} style={styles.itemCard}>
                <View style={styles.itemTop}>
                  <Text style={styles.cardTitle}>{item.descripcion}</Text>
                  <AppBadge
                    label={item.estado || "Sin estado"}
                    variant={getEstadoVariant(item.estado)}
                  />
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Fecha</Text>
                  <Text style={styles.metaValue}>{formatearFecha(item.fecha)}</Text>
                </View>

                {!!item.observaciones && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Observaciones</Text>
                    <Text style={styles.metaValue}>{item.observaciones}</Text>
                  </View>
                )}

                <View style={styles.actionsRow}>
                  {item.estado !== "entregado" && (
                    <View style={styles.actionHalf}>
                      <AppButton
                        title="Entregado"
                        onPress={() => marcarEntregado(item.id)}
                        variant="success"
                      />
                    </View>
                  )}

                  <View style={styles.actionHalf}>
                    <AppButton
                      title="Eliminar"
                      onPress={() => eliminarObjeto(item.id)}
                      variant="danger"
                    />
                  </View>
                </View>
              </AppCard>
            ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function formatearFecha(fecha) {
  if (!fecha) return "No disponible";

  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;

  return d.toLocaleString("es-ES");
}

function getEstadoVariant(estado) {
  const valor = (estado || "").toLowerCase();

  if (valor.includes("entregado")) return "success";
  if (valor.includes("perdido") || valor.includes("pend")) return "warning";
  return "neutral";
}

const styles = StyleSheet.create({
  formCard: {
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
  },
  input: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    fontSize: 16,
    backgroundColor: "#ffffff",
    marginBottom: 12,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  messageWrap: {
    marginBottom: 12,
    gap: 8,
  },
  centerBlock: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  infoText: {
    color: "#64748b",
    fontSize: 15,
  },
  itemCard: {
    marginBottom: 12,
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  metaRow: {
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
  },
  actionHalf: {
    flex: 1,
    minWidth: 140,
  },
  error: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 15,
  },
  empty: {
    color: "#6b7280",
    fontSize: 15,
  },
});