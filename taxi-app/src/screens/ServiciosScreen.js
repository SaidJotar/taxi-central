import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";

import AppScreen from "../components/ui/AppScreen";
import AppCard from "../components/ui/AppCard";
import AppBadge from "../components/ui/AppBadge";
import SectionHeader from "../components/ui/SectionHeader";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function ServiciosScreen() {
  const { token } = useAuth();

  // Todos los servicios recibidos del backend.
  const [data, setData] = useState([]);

  // Fechas escritas por el taxista.
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Fechas realmente aplicadas al filtro.
  const [filtroDesde, setFiltroDesde] = useState(null);
  const [filtroHasta, setFiltroHasta] = useState(null);

  const [errorFiltro, setErrorFiltro] = useState("");
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
        console.error("Error cargando servicios:", e);
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

  /*
   * Se vuelve a calcular automáticamente cuando cambian:
   * - Los servicios.
   * - La fecha inicial.
   * - La fecha final.
   */
  const serviciosFiltrados = useMemo(() => {
    if (!filtroDesde && !filtroHasta) {
      return data;
    }

    return data.filter((item) => {
      if (!item.fecha) {
        return false;
      }

      const fechaServicio = new Date(item.fecha);

      if (Number.isNaN(fechaServicio.getTime())) {
        return false;
      }

      // Comparamos únicamente el día, ignorando la hora.
      fechaServicio.setHours(0, 0, 0, 0);

      if (filtroDesde && fechaServicio < filtroDesde) {
        return false;
      }

      if (filtroHasta && fechaServicio > filtroHasta) {
        return false;
      }

      return true;
    });
  }, [data, filtroDesde, filtroHasta]);

  const totalImporte = useMemo(() => {
    return serviciosFiltrados.reduce(
      (acc, item) => acc + (Number(item.importe) || 0),
      0
    );
  }, [serviciosFiltrados]);

  const aplicarFiltro = () => {
    setErrorFiltro("");

    const desde = fechaDesde.trim()
      ? convertirFechaTexto(fechaDesde)
      : null;

    const hasta = fechaHasta.trim()
      ? convertirFechaTexto(fechaHasta)
      : null;

    if (fechaDesde.trim() && !desde) {
      setErrorFiltro(
        "La fecha inicial no es válida. Utiliza el formato DD/MM/AAAA."
      );
      return;
    }

    if (fechaHasta.trim() && !hasta) {
      setErrorFiltro(
        "La fecha final no es válida. Utiliza el formato DD/MM/AAAA."
      );
      return;
    }

    if (!desde && !hasta) {
      setErrorFiltro("Introduce al menos una fecha.");
      return;
    }

    if (desde && hasta && desde > hasta) {
      setErrorFiltro(
        "La fecha inicial no puede ser posterior a la fecha final."
      );
      return;
    }

    /*
     * Desde comienza a las 00:00.
     * Hasta termina a las 23:59:59 para incluir todo el último día.
     */
    if (desde) {
      desde.setHours(0, 0, 0, 0);
    }

    if (hasta) {
      hasta.setHours(23, 59, 59, 999);
    }

    setFiltroDesde(desde);
    setFiltroHasta(hasta);
  };

  const limpiarFiltro = () => {
    setFechaDesde("");
    setFechaHasta("");
    setFiltroDesde(null);
    setFiltroHasta(null);
    setErrorFiltro("");
  };

  const filtroActivo = Boolean(filtroDesde || filtroHasta);

  return (
    <AppScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

        {/* FILTRO POR FECHAS */}
        <AppCard style={styles.filterCard}>
          <Text style={styles.filterTitle}>Filtrar por fechas</Text>

          <Text style={styles.filterDescription}>
            Introduce las fechas en formato DD/MM/AAAA
          </Text>

          <View style={styles.filterInputs}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Desde</Text>

              <TextInput
                style={styles.dateInput}
                value={fechaDesde}
                onChangeText={(valor) =>
                  setFechaDesde(formatearEntradaFecha(valor))
                }
                placeholder="01/07/2026"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Hasta</Text>

              <TextInput
                style={styles.dateInput}
                value={fechaHasta}
                onChangeText={(valor) =>
                  setFechaHasta(formatearEntradaFecha(valor))
                }
                placeholder="31/07/2026"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>
          </View>

          {!!errorFiltro && (
            <Text style={styles.filterError}>{errorFiltro}</Text>
          )}

          <View style={styles.filterButtons}>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={aplicarFiltro}
              activeOpacity={0.85}
            >
              <Text style={styles.applyButtonText}>Aplicar filtro</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.clearButton}
              onPress={limpiarFiltro}
              activeOpacity={0.85}
            >
              <Text style={styles.clearButtonText}>Limpiar</Text>
            </TouchableOpacity>
          </View>

          {filtroActivo && (
            <Text style={styles.activeFilterText}>
              Mostrando servicios
              {filtroDesde
                ? ` desde ${formatearFechaCorta(filtroDesde)}`
                : ""}
              {filtroHasta
                ? ` hasta ${formatearFechaCorta(filtroHasta)}`
                : ""}
            </Text>
          )}
        </AppCard>

        {/* RESUMEN DEL RESULTADO FILTRADO */}
        <View style={styles.summaryRow}>
          <AppCard style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total servicios</Text>

            <Text style={styles.summaryValue}>
              {serviciosFiltrados.length}
            </Text>
          </AppCard>

          <AppCard style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Importe total</Text>

            <Text style={styles.summaryValue}>
              {totalImporte.toFixed(2)} €
            </Text>
          </AppCard>
        </View>

        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563eb" />

            <Text style={styles.infoText}>
              Cargando servicios...
            </Text>
          </View>
        )}

        {!!error && !loading && (
          <View style={styles.centerBlock}>
            <AppBadge label="Error" variant="danger" />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}

        {!loading &&
          !error &&
          serviciosFiltrados.length === 0 && (
            <AppCard>
              <Text style={styles.empty}>
                {filtroActivo
                  ? "No hay servicios realizados en el rango de fechas seleccionado."
                  : "Todavía no hay servicios realizados."}
              </Text>
            </AppCard>
          )}

        {!loading &&
          !error &&
          serviciosFiltrados.map((item) => (
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
                <Text style={styles.metaLabel}>Teléfono</Text>

                <Text style={styles.metaValue}>
                  {item.telefono || "No disponible"}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Importe</Text>

                <Text style={styles.metaValue}>
                  {item.importe != null
                    ? `${Number(item.importe).toFixed(2)} €`
                    : "No disponible"}
                </Text>
              </View>

              <View style={styles.ratingSection}>

                <Text style={styles.ratingLabel}>
                  Valoración del cliente
                </Text>


                {item.rating != null ? (

                  <>

                    <View style={styles.ratingStarsRow}>

                      {[1, 2, 3, 4, 5].map(
                        (estrella) => (

                          <Ionicons
                            key={estrella}
                            name={
                              estrella <= Number(item.rating)
                                ? "star"
                                : "star-outline"
                            }
                            size={18}
                            color="#f59e0b"
                          />

                        )
                      )}


                      <Text style={styles.ratingNumber}>
                        {Number(item.rating).toFixed(0)}/5
                      </Text>

                    </View>


                    {!!item.comentarioRating && (

                      <View style={styles.ratingCommentBox}>

                        <Ionicons
                          name="chatbubble-outline"
                          size={15}
                          color="#64748b"
                        />


                        <Text style={styles.ratingComment}>
                          {item.comentarioRating}
                        </Text>

                      </View>

                    )}

                  </>

                ) : (

                  <View style={styles.noRatingRow}>

                    <Ionicons
                      name="star-outline"
                      size={16}
                      color="#94a3b8"
                    />

                    <Text style={styles.noRatingText}>
                      Sin valorar
                    </Text>

                  </View>

                )}

              </View>
            </AppCard>
          ))}
      </ScrollView>
    </AppScreen>
  );
}

/**
 * Convierte DD/MM/AAAA en un objeto Date.
 * Devuelve null cuando la fecha no existe o no es válida.
 */
function convertirFechaTexto(valor) {
  const partes = valor.split("/");

  if (partes.length !== 3) {
    return null;
  }

  const dia = Number(partes[0]);
  const mes = Number(partes[1]);
  const anio = Number(partes[2]);

  if (
    !Number.isInteger(dia) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(anio) ||
    anio < 2000 ||
    mes < 1 ||
    mes > 12 ||
    dia < 1 ||
    dia > 31
  ) {
    return null;
  }

  const fecha = new Date(anio, mes - 1, dia);

  /*
   * Evita aceptar fechas imposibles como:
   * 31/02/2026
   */
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }

  return fecha;
}

/**
 * Inserta automáticamente las barras mientras se escribe.
 * Ejemplo: 01072026 -> 01/07/2026
 */
function formatearEntradaFecha(valor) {
  const numeros = valor.replace(/\D/g, "").slice(0, 8);

  if (numeros.length <= 2) {
    return numeros;
  }

  if (numeros.length <= 4) {
    return `${numeros.slice(0, 2)}/${numeros.slice(2)}`;
  }

  return `${numeros.slice(0, 2)}/${numeros.slice(
    2,
    4
  )}/${numeros.slice(4)}`;
}

function formatearFecha(fecha) {
  if (!fecha) {
    return "No disponible";
  }

  const d = new Date(fecha);

  if (Number.isNaN(d.getTime())) {
    return fecha;
  }

  return d.toLocaleString("es-ES");
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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
  filterCard: {
    marginBottom: 16,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },
  filterDescription: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 16,
  },
  filterInputs: {
    flexDirection: "row",
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  dateInput: {
    height: 48,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  filterButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  applyButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  applyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  clearButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
  },
  clearButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "800",
  },
  filterError: {
    marginTop: 10,
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterText: {
    marginTop: 12,
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 27,
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
  ratingSection: {
    marginTop: 4,

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor: "#e2e8f0",
  },

  ratingLabel: {
    fontSize: 12,

    fontWeight: "700",

    color: "#64748b",

    textTransform: "uppercase",

    marginBottom: 6,
  },

  ratingStarsRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 2,
  },

  ratingNumber: {
    marginLeft: 6,

    fontSize: 14,

    fontWeight: "800",

    color: "#0f172a",
  },

  ratingCommentBox: {
    marginTop: 9,

    paddingVertical: 9,

    paddingHorizontal: 10,

    borderRadius: 10,

    backgroundColor: "#f8fafc",

    flexDirection: "row",

    alignItems: "flex-start",

    gap: 7,
  },

  ratingComment: {
    flex: 1,

    fontSize: 13,

    lineHeight: 18,

    color: "#475569",

    fontStyle: "italic",
  },

  noRatingRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 6,
  },

  noRatingText: {
    fontSize: 13,

    color: "#94a3b8",

    fontWeight: "600",
  },
});