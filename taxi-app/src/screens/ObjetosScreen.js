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
import { Ionicons } from "@expo/vector-icons";

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

  const entregarEnCentral = async (id) => {
    Alert.alert(
      "Entregar en central",
      "Confirma que has entregado físicamente este objeto en la central.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Confirmar entrega",
          onPress: async () => {
            try {
              if (!token) {
                setError("No hay sesión activa.");
                return;
              }

              setError("");

              await api.entregarObjetoEnCentral(token, id);

              /*
               * Lo eliminamos inmediatamente de la lista local.
               * El registro continúa existiendo en la base de datos.
               */
              setData((actual) =>
                actual.filter((item) => item.id !== id)
              );
            } catch (e) {
              setError(
                e.message ||
                "No se pudo registrar la entrega en la central."
              );
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

          <AppCard style={styles.formCard}>
            <View style={styles.formHeader}>

              <View style={styles.formIcon}>
                <Ionicons
                  name="bag-handle-outline"
                  size={17}
                  color="#2563eb"
                />
              </View>

              <View style={{ flex: 1 }}>

                <Text style={styles.formTitle}>
                  Registrar objeto
                </Text>

                <Text style={styles.formSubtitle}>
                  Añade un objeto encontrado en el taxi.
                </Text>

              </View>

            </View>
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
              title={guardando ? "Guardando..." : "Registrar objeto"}
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
                  <View style={styles.actionHalf}>
                    <AppButton
                      title="En central"
                      onPress={() => entregarEnCentral(item.id)}
                      variant="success"
                    />
                  </View>

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
    marginBottom: 8,
    padding: 12,
  },

  formTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 11,
  },


  input: {
    width: "100%",
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: 12,

    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",

    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",

    backgroundColor: "#f8fafc",
    marginBottom: 8,
  },

  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },


  messageWrap: {
    marginBottom: 8,
    gap: 6,
  },


  centerBlock: {
    paddingVertical: 26,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  infoText: {
    color: "#64748b",
    fontSize: 12,
  },


  itemCard: {
    marginBottom: 8,
    padding: 12,
  },

  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },

  cardTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: "#0f172a",
  },


  metaRow: {
    marginBottom: 8,
  },

  metaLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 2,
  },

  metaValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: "#0f172a",
  },


  actionsRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 5,
  },

  actionHalf: {
    flex: 1,
  },


  error: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 12,
  },

  empty: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 11,
  },

  formIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  formSubtitle: {
    marginTop: 1,
    fontSize: 10,
    color: "#64748b",
  },
});