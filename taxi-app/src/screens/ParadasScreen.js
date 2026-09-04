import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AppScreen from "../components/ui/AppScreen";
import AppCard from "../components/ui/AppCard";
import AppBadge from "../components/ui/AppBadge";
import { api } from "../api/client";

import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ParadasScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const espacioInferior = tabBarHeight + insets.bottom;
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

      setParadas(
        Array.isArray(data)
          ? data
          : []
      );

    } catch (e) {

      console.log(
        "Error cargando paradas:",
        e.message
      );

      setError(
        "No se pudieron cargar las paradas."
      );

    } finally {

      setLoading(false);
      setRefreshing(false);

    }
  }, []);

  useEffect(() => {
    cargarParadas();

    const interval =
      setInterval(() => {
        cargarParadas(true);
      }, 5000);

    return () =>
      clearInterval(interval);

  }, [cargarParadas]);

  const totalTaxis =
    paradas.reduce(
      (acc, item) =>
        acc +
        (item.totalTaxis || 0),
      0
    );

  const renderRow = ({
    item,
    index,
  }) => {

    const cola =
      Array.isArray(item.cola)
        ? item.cola
        : [];

    const primero =
      cola[0] || null;

    const restoCola =
      cola.slice(1);

    return (
      <View
        style={[
          styles.paradaCard,

          index % 2 === 0
            ? styles.paradaCardEven
            : styles.paradaCardOdd,
        ]}
      >

        <View style={styles.paradaMainRow}>

          <View style={styles.paradaInfo}>

            <View style={styles.paradaIconWrap}>
              <Ionicons
                name="location-outline"
                size={17}
                color="#2563eb"
              />
            </View>

            <View style={styles.paradaTextWrap}>

              <Text
                style={styles.paradaNombre}
                numberOfLines={2}
              >
                {item.nombre}
              </Text>

              <Text style={styles.paradaSubtitle}>
                {item.totalTaxis || 0}
                {" "}
                {(item.totalTaxis || 0) === 1
                  ? "taxi disponible"
                  : "taxis disponibles"}
              </Text>

            </View>

          </View>


          {primero ? (

            <View style={styles.primeroWrap}>

              <Text style={styles.primeroLabel}>
                PRIMERO
              </Text>

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

            <View style={styles.sinTaxisPill}>

              <Text style={styles.sinTaxisText}>
                Sin taxis
              </Text>

            </View>

          )}

        </View>


        {restoCola.length > 0 && (

          <View style={styles.queueBlock}>

            <Text style={styles.queueLabel}>
              COLA
            </Text>

            <View style={styles.queueRow}>

              {restoCola.map(
                (taxi, posicion) => (

                  <View
                    key={
                      taxi.taxistaId ||
                      taxi.id ||
                      `${item.paradaId}-${taxi.numeroTaxi}-${posicion}`
                    }
                    style={styles.queueItem}
                  >

                    <Text style={styles.queuePosition}>
                      {posicion + 2}º
                    </Text>

                    <Text style={styles.queueTaxi}>
                      T{taxi.numeroTaxi}
                    </Text>

                  </View>

                )
              )}

            </View>

          </View>

        )}

      </View>
    );
  };


  return (
    <AppScreen>

      <View style={styles.headerBlock}>

        <Text style={styles.eyebrow}>
          ESTADO ACTUAL
        </Text>

        <Text style={styles.screenTitle}>
          Paradas
        </Text>

        <Text style={styles.screenSubtitle}>
          Consulta la ocupación y el orden de los taxis.
        </Text>

      </View>


      <View style={styles.summaryRow}>

        <AppCard style={styles.summaryCard}>

          <View style={styles.summaryIcon}>
            <Ionicons
              name="location-outline"
              size={18}
              color="#2563eb"
            />
          </View>

          <Text style={styles.summaryLabel}>
            PARADAS
          </Text>

          <Text style={styles.summaryValue}>
            {paradas.length}
          </Text>

        </AppCard>


        <AppCard style={styles.summaryCard}>

          <View style={styles.summaryIcon}>
            <Ionicons
              name="car-outline"
              size={18}
              color="#2563eb"
            />
          </View>

          <Text style={styles.summaryLabel}>
            TAXIS TOTALES
          </Text>

          <Text style={styles.summaryValue}>
            {totalTaxis}
          </Text>

        </AppCard>

      </View>


      {loading ? (

        <View style={styles.centerBlock}>

          <ActivityIndicator
            size="large"
            color="#2563eb"
          />

          <Text style={styles.infoText}>
            Cargando paradas...
          </Text>

        </View>

      ) : error ? (

        <View style={styles.centerBlock}>

          <AppBadge
            label="Error"
            variant="danger"
          />

          <Text style={styles.errorText}>
            {error}
          </Text>

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
          bounces
        />

      )}

    </AppScreen>
  );
}


const styles = StyleSheet.create({

  headerBlock: {
    marginBottom: 14,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 1,
  },

  screenTitle: {
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    color: "#0f172a",
  },

  screenSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748b",
  },


  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  summaryCard: {
    flex: 1,
    minHeight: 94,
    padding: 12,
  },

  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 2,
  },

  summaryValue: {
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    color: "#0f172a",
  },


  paradaCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,
    overflow: "hidden",

    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowRadius: 8,
    elevation: 2,
  },

  paradaCardEven: {
    backgroundColor: "#ffffff",
  },

  paradaCardOdd: {
    backgroundColor: "#ffffff",
  },

  paradaMainRow: {
    minHeight: 70,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  paradaInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },

  paradaIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  paradaTextWrap: {
    flex: 1,
  },

  paradaNombre: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
    color: "#0f172a",
  },

  paradaSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },


  primeroWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  primeroLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 4,
  },

  firstTaxiBadge: {
    minWidth: 46,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignItems: "center",
    justifyContent: "center",
  },

  firstTaxiText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#2563eb",
  },

  sinTaxisPill: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },

  sinTaxisText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
  },


  queueBlock: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  queueLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 6,
  },

  queueRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },

  queuePosition: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginRight: 3,
  },

  queueTaxi: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0f172a",
  },


  centerBlock: {
    paddingVertical: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  infoText: {
    color: "#64748b",
    fontSize: 12,
  },

  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  listContent: {
    paddingBottom: 0,
  },

});