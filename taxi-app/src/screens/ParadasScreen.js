import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import AppScreen from "../components/ui/AppScreen";
import AppCard from "../components/ui/AppCard";
import AppBadge from "../components/ui/AppBadge";
import SectionHeader from "../components/ui/SectionHeader";
import { api } from "../api/client";

export default function ParadasScreen() {
  const [paradas, setParadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const cargarParadas = useCallback(async (silencioso = false) => {
    try {
      if (silencioso) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const data = await api.getParadasResumen();
      setParadas(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log("Error cargando paradas:", e.message);
      setError("No se pudieron cargar las paradas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargarParadas();

    const interval = setInterval(() => {
      cargarParadas(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [cargarParadas]);

  const totalTaxis = paradas.reduce(
    (acc, item) => acc + (item.totalTaxis || 0),
    0
  );

const renderRow = ({ item, index }) => {
  const cola = Array.isArray(item.cola) ? item.cola : [];
  const primero = cola[0] || null;
  const restoCola = cola.slice(1);

  return (
    <View
      style={[
        styles.rowContainer,
        index % 2 === 0 ? styles.rowEven : styles.rowOdd,
      ]}
    >
      <View style={styles.rowMain}>
        <View style={styles.colParada}>
          <Text style={styles.paradaNombre} numberOfLines={2}>
            {item.nombre}
          </Text>
        </View>

        <View style={[styles.colTaxis, styles.centerCell]}>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>
              {item.totalTaxis || 0}
            </Text>
          </View>
        </View>

        <View style={styles.colOrden}>
          {primero ? (
            <View style={styles.firstTaxiContainer}>

              <View style={styles.firstTaxiBadge}>
                <Text
                  style={styles.firstTaxiText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  T{primero.numeroTaxi}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyCell}>Sin taxis</Text>
          )}
        </View>
      </View>

      {restoCola.length > 0 && (
        <View style={styles.queueRow}>
          {restoCola.map((taxi, posicion) => (
            <View
              key={
                taxi.taxistaId ||
                taxi.id ||
                `${item.paradaId}-${taxi.numeroTaxi}-${posicion + 1}`
              }
              style={styles.queueItem}
            >
              <Text style={styles.queuePosition}>
                {posicion + 2}º:
              </Text>

              <Text style={styles.queueTaxi}>
                T{taxi.numeroTaxi}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

  return (
    <AppScreen>
      <SectionHeader
        title="Paradas"
        subtitle="Taxistas en paradas en tiempo real"
      />

      <View style={styles.summaryRow}>
        <AppCard style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Paradas</Text>
          <Text style={styles.summaryValue}>{paradas.length}</Text>
        </AppCard>

        <AppCard style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Taxis totales</Text>
          <Text style={styles.summaryValue}>{totalTaxis}</Text>
        </AppCard>
      </View>

      <AppCard style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colParada]}>Parada</Text>
          <Text style={[styles.th, styles.colTaxis]}>Taxis</Text>
          <Text style={[styles.th, styles.colOrden]}>Primero</Text>
        </View>

        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.infoText}>Cargando paradas...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBlock}>
            <AppBadge label="Error" variant="danger" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={paradas}
            keyExtractor={(item) => String(item.paradaId)}
            renderItem={renderRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={() => cargarParadas(true)}
          />
        )}
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },

  summaryCard: {
    flex: 1,
  },

  summaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  summaryValue: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
  },

  tableCard: {
    flex: 1,
    padding: 0,
    overflow: "hidden",
  },

  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  th: {
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },

  rowContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 68,
  },

  rowEven: {
    backgroundColor: "#ffffff",
  },

  rowOdd: {
    backgroundColor: "#fcfdff",
  },

  colParada: {
    flex: 2.1,
    paddingRight: 10,
  },

  colTaxis: {
    width: 64,
  },

  colOrden: {
    flex: 2,
    paddingLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  centerCell: {
    alignItems: "center",
    justifyContent: "center",
  },

  paradaNombre: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },

  countPill: {
    minWidth: 38,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },

  countPillText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "800",
  },

  firstTaxiContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  firstTaxiLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },

  firstTaxiBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dbeafe",
    borderWidth: 2,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },

  firstTaxiText: {
    width: "100%",
    paddingHorizontal: 4,
    fontSize: 16,
    fontWeight: "900",
    color: "#1d4ed8",
    textAlign: "center",
    includeFontPadding: false,
  },

  queueRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 10,
  },

  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },

  queuePosition: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginRight: 3,
  },

  queueTaxi: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  emptyCell: {
    fontSize: 14,
    color: "#94a3b8",
    paddingVertical: 4,
  },

  centerBlock: {
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  infoText: {
    color: "#64748b",
    fontSize: 15,
    textAlign: "center",
  },

  errorText: {
    color: "#dc2626",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },

  listContent: {
    paddingBottom: 8,
  },
});