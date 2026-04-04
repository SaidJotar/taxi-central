import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import useTaxiLocation from "../hooks/useTaxiLocation";
import { useOferta } from "../context/OfertaContext";
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "../lib/backgroundLocation";

export default function InicioScreen() {
  const { token, taxista, updateTaxista } = useAuth();

  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const espacioInferior = tabBarHeight + insets.bottom;

  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState(taxista?.estado || "desconectado");
  const { servicioActivo, setServicioActivo } = useOferta();

  const socket = useMemo(() => getSocket(token), [token]);

  const [paradaEntrando, setParadaEntrando] = useState(null);
  const [paradaSaliendo, setParadaSaliendo] = useState(null);
  const [segundosEntradaParada, setSegundosEntradaParada] = useState(0);

  const [paradaActual, setParadaActual] = useState(taxista?.parada || null);
  const [colaParada, setColaParada] = useState([]);
  const [posicionEnParada, setPosicionEnParada] = useState(null);

  const [accionPendiente, setAccionPendiente] = useState("");
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [taxisDisponibles, setTaxisDisponibles] = useState(null);

  const gpsDebeEstarActivo = estado !== "desconectado";

  const handleGpsPerdido = useCallback(() => {
    socket.emit("taxista:cambiar_estado", { estado: "desconectado" });
    setEstado("desconectado");
  }, [socket]);

  const {
    gpsActivo,
    gpsError,
    gpsInicializando,
    ultimaUbicacion,
    refrescarUbicacion,
  } = useTaxiLocation({
    socket,
    activo: gpsDebeEstarActivo,
    onGpsPerdido: handleGpsPerdido,
  });

  const tieneGpsBackendReciente = (() => {
    if (!taxista?.ubicacionActualizadaEn) return false;
    if (typeof taxista?.lat !== "number" || typeof taxista?.lng !== "number") {
      return false;
    }

    const haceMs =
      Date.now() - new Date(taxista.ubicacionActualizadaEn).getTime();

    return haceMs <= 60000;
  })();

  const cargarTaxisDisponibles = useCallback(() => {
    socket.emit("taxista:cuantos_disponibles", null, (respuesta) => {
      if (respuesta?.disponibles != null) {
        setTaxisDisponibles(respuesta.disponibles);
      } else {
        setTaxisDisponibles("error");
      }
    });
  }, [socket]);

  useEffect(() => {
    cargarTaxisDisponibles();
    const intervalo = setInterval(cargarTaxisDisponibles, 10000);

    return () => clearInterval(intervalo);
  }, [cargarTaxisDisponibles]);

  useEffect(() => {
    setConectado(!!socket?.connected);
  }, [socket]);

  useEffect(() => {
    if (!paradaActual) {
      setColaParada([]);
      setPosicionEnParada(null);
    }
  }, [paradaActual]);

  useEffect(() => {
    if (!token) return;

    socket.auth = { token };

    if (!socket.connected) {
      socket.connect();
    } else {
      setConectado(true);
    }

    socket.on("connect", () => {
      console.log("🟢 socket conectado", socket.id);
      setConectado(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔴 socket desconectado:", reason);
      setConectado(false);
    });

    socket.on("connect_error", (err) => {
      console.log("🔴 connect_error:", err.message);
      setConectado(false);
      setCambiandoEstado(false);
    });

    socket.on("taxista:conectado", async (data) => {
      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "desconectado");
        setParadaActual(data.taxista.parada || null);
        setCambiandoEstado(false);
        setAccionPendiente("");

        if (
          typeof data.taxista.lat === "number" &&
          typeof data.taxista.lng === "number" &&
          data.taxista.ubicacionActualizadaEn
        ) {
          const haceMs =
            Date.now() - new Date(data.taxista.ubicacionActualizadaEn).getTime();

          if (haceMs <= 60000) {
            socket.emit("taxista:ubicacion", {
              lat: data.taxista.lat,
              lng: data.taxista.lng,
            });
          }
        }
      }
    });

    socket.on("taxista:estado_actualizado", async (data) => {
      console.log("📥 taxista:estado_actualizado", data);

      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "desconectado");
        setParadaActual(data.taxista.parada || null);
        setCambiandoEstado(false);
        setAccionPendiente("");

        if (data.taxista.estado === "desconectado") {
          await stopBackgroundLocationUpdates();
        }

        if (data.taxista.estado === "disponible") {
          await startBackgroundLocationUpdates();
        }
      }
    });

    socket.on("servicio:terminado_ok", async (data) => {
      setServicioActivo(null);

      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "disponible");
      } else {
        setEstado("disponible");
      }
    });

    socket.on("taxista:parada_sugerida", (data) => {
      console.log("📥 taxista:parada_sugerida", data);
      setParadaSaliendo(null);
      setParadaEntrando(data);
    });

    socket.on("taxista:parada_sugerida_cancelada", () => {
      console.log("📥 taxista:parada_sugerida_cancelada");
      setParadaEntrando(null);
      setSegundosEntradaParada(0);
    });

    socket.on("taxista:parada_confirmada", async (data) => {
      console.log("📥 taxista:parada_confirmada", data);
      setParadaEntrando(null);
      setSegundosEntradaParada(0);

      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "disponible");
        setParadaActual(data.taxista.parada || null);
      }
    });

    socket.on("parada:cola_actualizada", (data) => {
      console.log("📥 parada:cola_actualizada", data);

      if (!data?.paradaId) return;

      setColaParada(data.cola || []);

      const mia = (data.cola || []).find(
        (item) => item.taxistaId === taxista?.id
      );
      setPosicionEnParada(mia?.posicion || null);
    });

    socket.on("taxista:salio_parada", async (data) => {
      console.log("📥 taxista:salio_parada", data);

      setParadaEntrando(null);
      setSegundosEntradaParada(0);

      setParadaSaliendo({
        texto: "Saliendo de la parada",
        at: Date.now(),
      });

      setTimeout(() => {
        setParadaSaliendo(null);
      }, 4000);

      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "disponible");
        setParadaActual(null);
        setPosicionEnParada(null);
        setColaParada([]);
      }
    });

    socket.on("error:general", (data) => {
      console.log("❌ error:general", data);
      setCambiandoEstado(false);
    });

    socket.on("taxista:gps_requerido", (data) => {
      console.log("📍 gps requerido", data);
      setEstado("desconectado");
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("taxista:conectado");
      socket.off("taxista:estado_actualizado");
      socket.off("parada:cola_actualizada");
      socket.off("servicio:terminado_ok");
      socket.off("taxista:parada_sugerida");
      socket.off("taxista:parada_sugerida_cancelada");
      socket.off("taxista:parada_confirmada");
      socket.off("taxista:parada_rechazada_ok");
      socket.off("taxista:salio_parada");
      socket.off("error:general");
      socket.off("taxista:gps_requerido");
    };
  }, [socket, token, updateTaxista, taxista?.id, setServicioActivo]);

  useEffect(() => {
    if (!paradaEntrando?.expiresAt) {
      setSegundosEntradaParada(0);
      return;
    }

    const actualizar = () => {
      const diff = new Date(paradaEntrando.expiresAt).getTime() - Date.now();
      const seg = Math.max(0, Math.ceil(diff / 1000));
      setSegundosEntradaParada(seg);

      if (seg <= 0) {
        setSegundosEntradaParada(0);
      }
    };

    actualizar();
    const interval = setInterval(actualizar, 250);

    return () => clearInterval(interval);
  }, [paradaEntrando]);

  const cambiarEstado = async (nuevoEstado) => {
    console.log("🟦 cambiarEstado llamado con:", nuevoEstado);

    if (servicioActivo) {
      console.log("⚠️ No puedes cambiar de estado mientras estás en servicio");
      return;
    }

    try {
      setCambiandoEstado(true);
      setAccionPendiente("");

      if (nuevoEstado === "disponible") {
        let tieneGpsValido =
          gpsActivo || !!ultimaUbicacion || tieneGpsBackendReciente;

        console.log("📍 gpsActivo:", gpsActivo);
        console.log("📍 ultimaUbicacion:", ultimaUbicacion);
        console.log("📍 tieneGpsBackendReciente:", tieneGpsBackendReciente);

        if (!tieneGpsValido) {
          console.log("📍 Intentando refrescar GPS antes de ponerse disponible...");
          setAccionPendiente("Comprobando GPS antes de ponerse disponible...");

          const ubicacion = await refrescarUbicacion();
          console.log("📍 refrescarUbicacion devolvió:", ubicacion);

          if (ubicacion) {
            tieneGpsValido = true;
          }
        }

        if (!tieneGpsValido) {
          console.log("⚠️ No hay GPS válido, no se emite cambio");
          setAccionPendiente("No se pudo obtener GPS.");
          return;
        }
      }

      console.log("📤 EMITIENDO taxista:cambiar_estado:", nuevoEstado);
      socket.emit("taxista:cambiar_estado", { estado: nuevoEstado });
    } finally {
      setTimeout(() => {
        setCambiandoEstado(false);
        setAccionPendiente("");
      }, 1200);
    }
  };

  const terminarServicio = () => {
    if (!servicioActivo?.solicitudId) return;

    socket.emit("servicio:terminar", {
      solicitudId: servicioActivo.solicitudId,
    });
  };

  const numeroTaxi = taxista?.vehiculo?.numeroTaxi || null;

  return (
    <SafeAreaView style={styles.appShell} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(espacioInferior, 28) },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!servicioActivo}
        bounces={!servicioActivo}
      >
        <View style={styles.appCard}>
          <View style={styles.topRow}>
            <View style={styles.headerMain}>
              <Text style={styles.eyebrow}>Panel del taxista</Text>
              <Text style={styles.appTitle}>
                {numeroTaxi ? `Taxi ${numeroTaxi}` : "App Taxista"}
              </Text>
            </View>

            <View style={styles.onlineBadge}>
              <Text style={styles.onlineLabel}>Taxis en línea</Text>
              <Text style={styles.onlineValue}>
                {taxisDisponibles !== null ? taxisDisponibles : "..."}
              </Text>
            </View>
          </View>

          <Text style={styles.headerHelper}>
            {servicioActivo
              ? "Tienes un servicio en curso"
              : paradaActual
                ? `En parada ${paradaActual.nombre}`
                : estado === "disponible"
                  ? "Listo para recibir servicios"
                  : "Actualmente fuera de servicio"}
          </Text>

          <View style={styles.infoOperativa}>
            {servicioActivo ? (
              <View style={[styles.infoPill, styles.infoServicio]}>
                <Text style={styles.infoPillText}>🚕 En servicio</Text>
              </View>
            ) : paradaActual ? (
              <>
                <View style={[styles.infoPill, styles.infoParada]}>
                  <Text style={styles.infoPillText}>
                    🚖 En parada: {paradaActual.nombre}
                  </Text>
                </View>

                <Text style={styles.infoExtra}>
                  {posicionEnParada
                    ? `Posición en cola: ${posicionEnParada}`
                    : "Calculando posición en cola..."}
                </Text>
              </>
            ) : estado === "disponible" ? (
              <View style={[styles.infoPill, styles.infoDisponible]}>
                <Text style={styles.infoPillText}>✅ Disponible</Text>
              </View>
            ) : (
              <View style={[styles.infoPill, styles.infoDesconectado]}>
                <Text style={styles.infoPillText}>⚪ Desconectado</Text>
              </View>
            )}
          </View>

          {!!accionPendiente && (
            <Text style={styles.infoExtra}>{accionPendiente}</Text>
          )}

          {paradaEntrando?.parada && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Entrando en parada</Text>
              <Text style={styles.noticeText}>
                {paradaEntrando.parada.nombre}
              </Text>
              <Text style={styles.noticeSubtext}>
                Te posicionarás automáticamente en {segundosEntradaParada}s
              </Text>
            </View>
          )}

          {paradaSaliendo && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Movimiento detectado</Text>
              <Text style={styles.noticeText}>Saliendo de la parada</Text>
            </View>
          )}

          {!!gpsError && !gpsInicializando && (
            <Text style={styles.errorText}>{gpsError}</Text>
          )}

          {!servicioActivo && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.stateButton,
                  estado === "disponible" && styles.stateButtonActive,
                  cambiandoEstado && styles.stateButtonDisabled,
                ]}
                onPress={() => cambiarEstado("disponible")}
                activeOpacity={0.85}
                disabled={cambiandoEstado}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={24}
                  color={estado === "disponible" ? "#2563eb" : "#0f172a"}
                />
                <Text
                  style={[
                    styles.stateButtonTitle,
                    estado === "disponible" && styles.stateButtonTitleActive,
                  ]}
                >
                  Disponible
                </Text>
                <Text style={styles.stateButtonText}>Recibir servicios</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.stateButton,
                  estado === "desconectado" && styles.stateButtonActive,
                  cambiandoEstado && styles.stateButtonDisabled,
                ]}
                onPress={() => cambiarEstado("desconectado")}
                activeOpacity={0.85}
                disabled={cambiandoEstado}
              >
                <Ionicons
                  name="power-outline"
                  size={24}
                  color={estado === "desconectado" ? "#2563eb" : "#0f172a"}
                />
                <Text
                  style={[
                    styles.stateButtonTitle,
                    estado === "desconectado" && styles.stateButtonTitleActive,
                  ]}
                >
                  Desconectado
                </Text>
                <Text style={styles.stateButtonText}>No recibir servicios</Text>
              </TouchableOpacity>
            </View>
          )}

          {servicioActivo && (
            <View style={styles.tarjetaServicio}>
              <View style={styles.tarjetaServicioHeader}>
                <Text style={styles.tarjetaServicioTitle}>Servicio activo</Text>
                <View style={styles.tarjetaServicioBadge}>
                  <Text style={styles.tarjetaServicioBadgeText}>En curso</Text>
                </View>
              </View>

              <View style={styles.servicioItem}>
                <Text style={styles.servicioLabel}>Cliente</Text>
                <Text style={styles.servicioValue}>
                  {servicioActivo.nombreCliente || "-"}
                </Text>
              </View>

              <View style={styles.servicioItem}>
                <Text style={styles.servicioLabel}>Teléfono</Text>
                <Text style={styles.servicioValue}>
                  {servicioActivo.telefonoCliente || "-"}
                </Text>
              </View>

              <View style={styles.servicioItem}>
                <Text style={styles.servicioLabel}>Recogida</Text>
                <Text style={styles.servicioValue}>
                  {servicioActivo.direccionBase ||
                    servicioActivo.direccionRecogida ||
                    "-"}
                </Text>
              </View>

              {!!servicioActivo.referenciaRecogida && (
                <View style={styles.servicioItem}>
                  <Text style={styles.servicioLabel}>Referencia</Text>
                  <Text style={styles.servicioValue}>
                    {servicioActivo.referenciaRecogida}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.finishButton}
                onPress={terminarServicio}
              >
                <Text style={styles.finishButtonText}>Finalizar servicio</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    padding: 16,
    flexGrow: 1,
  },

  appCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 5,
  },





  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },

  headerMain: {
    flex: 1,
    justifyContent: "center",
  },

  titleWrap: {
    flex: 1,
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 4,
  },

  appTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    color: "#0f172a",
  },

  onlineBadge: {
    minWidth: 110,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    alignItems: "center",
    justifyContent: "center",
  },

  onlineLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 2,
  },

  onlineValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2563eb",
  },

  headerHelper: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
  },

  socketWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  socketDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  socketDotOn: {
    backgroundColor: "#16a34a",
  },

  socketDotOff: {
    backgroundColor: "#dc2626",
  },

  socketText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },

  infoOperativa: {
    marginBottom: 8,
  },

  infoPill: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },

  infoDisponible: {
    backgroundColor: "#ecfdf5",
  },

  infoDesconectado: {
    backgroundColor: "#f1f5f9",
  },

  infoParada: {
    backgroundColor: "#eff6ff",
  },

  infoServicio: {
    backgroundColor: "#fef3c7",
  },

  infoPillText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },

  infoExtra: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
  },

  noticeCard: {
    marginTop: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  noticeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 4,
  },

  noticeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },

  noticeSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
  },

  errorText: {
    marginTop: 10,
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },

  stateButton: {
    flex: 1,
    minHeight: 112,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    justifyContent: "space-between",
  },

  stateButtonActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
  },

  stateButtonDisabled: {
    opacity: 0.5,
  },

  stateButtonTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },

  stateButtonTitleActive: {
    color: "#2563eb",
  },

  stateButtonText: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
  },

  tarjetaServicio: {
    marginTop: 18,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  tarjetaServicioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },

  tarjetaServicioTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },

  tarjetaServicioBadge: {
    backgroundColor: "#dcfce7",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  tarjetaServicioBadgeText: {
    color: "#166534",
    fontWeight: "800",
    fontSize: 12,
  },

  servicioItem: {
    marginBottom: 12,
  },

  servicioLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },

  servicioValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 22,
  },

  finishButton: {
    marginTop: 8,
    backgroundColor: "#16a34a",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },

  finishButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  socketWarning: {
    backgroundColor: "#fee2e2",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  socketWarningText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "700",
  },

});