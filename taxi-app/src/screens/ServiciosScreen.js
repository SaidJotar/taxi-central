import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from "react-native";
import AppScreen from "../components/ui/AppScreen";
import AppCard from "../components/ui/AppCard";
import AppBadge from "../components/ui/AppBadge";
import SectionHeader from "../components/ui/SectionHeader";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function ServiciosScreen() {
  const { token } = useAuth();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const cargarServicios = useCallback(
    async (silencioso = false) => {
      try {
        if (silencioso) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        if (!token) {
          setData([]);
          return;
        }

        const servicios = await api.getServiciosHistorico(token);
        setData(Array.isArray(servicios) ? servicios : []);
      } catch (e) {
        setError("No se pudieron cargar los servicios realizados.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    cargarServicios();
  }, [cargarServicios]);

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => cargarServicios(true)}
          />
        }
      >
        <SectionHeader
          title="Servicios"
          subtitle="Historial de servicios realizados"
        />

        <AppCard style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total de servicios</Text>
          <Text style={styles.summaryValue}>{data.length}</Text>
        </AppCard>

        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.infoText}>Cargando servicios...</Text>
          </View>
        )}

        {!!error && !loading && (
          <View style={styles.centerBlock}>
            <AppBadge label="Error" variant="danger" />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        {!loading && !error && data.length === 0 && (
          <AppCard>
            <Text style={styles.empty}>Todavía no hay servicios realizados.</Text>
          </AppCard>
        )}

        {!loading &&
          !error &&
          data.map((item) => (
            <AppCard key={item.id} style={styles.serviceCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>
                  {item.recogida || "Servicio"}
                </Text>
                <AppBadge
                  label={item.estado || "Sin estado"}
                  variant={getEstadoVariant(item.estado)}
                />
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Fecha</Text>
                <Text style={styles.metaValue}>
                  {formatearFecha(item.fecha)}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Cliente</Text>
                <Text style={styles.metaValue}>
                  {item.cliente || "No disponible"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Taxista</Text>
                <Text style={styles.metaValue}>
                  {item.taxista || "No disponible"}
                </Text>
              </View>
            </AppCard>
          ))}
      </ScrollView>
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

  if (
    valor.includes("complet") ||
    valor.includes("final") ||
    valor.includes("realizado")
  ) {
    return "success";
  }

  if (valor.includes("cancel")) {
    return "danger";
  }

  if (valor.includes("pend")) {
    return "warning";
  }

  return "neutral";
}

const styles = StyleSheet.create({
  summaryCard: {
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
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
  serviceCard: {
    marginBottom: 12,
  },
  cardTop: {
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
  error: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 15,
    textAlign: "center",
  },
  empty: {
    color: "#6b7280",
    fontSize: 15,
  },
});