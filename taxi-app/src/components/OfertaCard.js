import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function OfertaCard({ oferta, onAceptar, onRechazar }) {
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const timeoutRef = useRef(false);

  const expiresAtMs = useMemo(() => {
    if (!oferta?.expiresAt) return null;
    return new Date(oferta.expiresAt).getTime();
  }, [oferta?.expiresAt]);

  useEffect(() => {
    timeoutRef.current = false;

    if (!oferta || !expiresAtMs) {
      setSegundosRestantes(0);
      return;
    }

    const actualizar = () => {
      const diff = expiresAtMs - Date.now();
      const segundos = Math.max(0, Math.ceil(diff / 1000));
      setSegundosRestantes(segundos);

      if (diff <= 0 && !timeoutRef.current) {
        timeoutRef.current = true;
        onRechazar(oferta.ofertaId);
      }
    };

    actualizar();

    const interval = setInterval(actualizar, 200);

    return () => clearInterval(interval);
  }, [oferta, expiresAtMs, onRechazar]);

  if (!oferta) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Nueva oferta</Text>
        </View>

        <View style={styles.timerBox}>
          <Text
            style={[
              styles.timerText,
              segundosRestantes <= 2 && styles.timerUrgente,
            ]}
          >
            {segundosRestantes}s
          </Text>
        </View>
      </View>

      <Text style={styles.title}>Servicio disponible</Text>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Cliente</Text>
        <Text style={styles.value}>{oferta?.solicitud?.nombreCliente || "-"}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Teléfono</Text>
        <Text style={styles.value}>{oferta?.solicitud?.telefonoCliente || "-"}</Text>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.label}>Recogida</Text>
        <Text style={styles.value}>
          {oferta?.solicitud?.direccionBase ||
            oferta?.solicitud?.direccionRecogida ||
            "-"}
        </Text>
      </View>

      {!!oferta?.solicitud?.referenciaRecogida && (
        <View style={styles.infoBox}>
          <Text style={styles.label}>Referencia</Text>
          <Text style={styles.value}>{oferta.solicitud.referenciaRecogida}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => onAceptar(oferta.ofertaId)}
        >
          <Text style={styles.actionText}>Aceptar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => onRechazar(oferta.ofertaId)}
        >
          <Text style={styles.actionText}>Rechazar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#dbeafe",
  },
  badgeText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
  },
  timerBox: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
  },
  timerText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  timerUrgente: {
    color: "#dc2626",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#edf2f7",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#64748b",
    marginBottom: 4,
  },
  value: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
  },
  actions: {
    marginTop: 10,
    gap: 10,
  },
  actionButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  acceptButton: {
    backgroundColor: "#16a34a",
  },
  rejectButton: {
    backgroundColor: "#dc2626",
  },
  actionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});