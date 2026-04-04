import React, { useEffect, useState, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../src/api/client";

export default function ObjetosPerdidosPublicosScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");

  const cargarObjetos = useCallback(async (texto = "") => {
    try {
      setLoading(true);
      setError("");

      const objetos = await api.getObjetosPerdidosPublicos(texto);
      setData(Array.isArray(objetos) ? objetos : []);
    } catch (e) {
      console.log("Error cargando objetos públicos:", e.message);
      setError("No se pudieron cargar los objetos perdidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarObjetos();
  }, [cargarObjetos]);

  const buscar = () => {
    cargarObjetos(busqueda);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Objetos perdidos</Text>
        <Text style={styles.subtitle}>
          Busca si tu objeto ha sido encontrado en un taxi.
        </Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="Buscar: mochila, móvil, gafas..."
            value={busqueda}
            onChangeText={setBusqueda}
          />
          <TouchableOpacity style={styles.searchButton} onPress={buscar}>
            <Text style={styles.searchButtonText}>Buscar</Text>
          </TouchableOpacity>
        </View>

        {loading && <ActivityIndicator size="large" />}

        {!!error && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && data.length === 0 && (
          <Text style={styles.empty}>
            No se han encontrado objetos con esa búsqueda.
          </Text>
        )}

        {!loading &&
          !error &&
          data.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.descripcion}</Text>
              <Text>Fecha: {formatearFecha(item.fecha)}</Text>
              <Text>Taxi: {item.numeroTaxi || "-"}</Text>
              <Text>Estado: {item.estado}</Text>
              {!!item.observaciones && (
                <Text>Observaciones: {item.observaciones}</Text>
              )}
            </View>
          ))}

        <View style={styles.footerBox}>
          <Text style={styles.footerText}>
            Si crees que uno de estos objetos es tuyo, llama a la central para
            verificarlo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatearFecha(fecha) {
  if (!fecha) return "No disponible";

  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;

  return d.toLocaleString("es-ES");
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#475569",
    marginBottom: 20,
  },
  searchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1ea",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  error: {
    color: "#dc2626",
    fontWeight: "600",
  },
  empty: {
    color: "#64748b",
    fontSize: 15,
  },
  footerBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#eef6ff",
  },
  footerText: {
    color: "#1e3a8a",
    fontSize: 15,
  },
});