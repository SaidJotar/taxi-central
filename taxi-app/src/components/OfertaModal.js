import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function OfertaModal({ oferta, visible, onAceptar, onRechazar }) {
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const timeoutRef = useRef(false);

  const expiresAtMs = useMemo(() => {
    if (!oferta?.expiresAt) return null;
    return new Date(oferta.expiresAt).getTime();
  }, [oferta?.expiresAt]);

  useEffect(() => {
    timeoutRef.current = false;

    if (!visible || !oferta || !expiresAtMs) {
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

    const interval = setInterval(actualizar, 250);
    return () => clearInterval(interval);
  }, [visible, oferta, expiresAtMs, onRechazar]);

  if (!oferta) return null;

  const recogida =
    oferta?.solicitud?.direccionBase ||
    oferta?.solicitud?.direccionRecogida ||
    "-";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Ionicons name="flash-outline" size={16} color="#1d4ed8" />
              <Text style={styles.badgeText}>Nueva oferta</Text>
            </View>

            <View
              style={[
                styles.timerBox,
                segundosRestantes <= 3 && styles.timerBoxUrgent,
              ]}
            >
              <Text
                style={[
                  styles.timerText,
                  segundosRestantes <= 3 && styles.timerTextUrgent,
                ]}
              >
                {segundosRestantes}s
              </Text>
            </View>
          </View>

          <Text style={styles.title}>Servicio disponible</Text>
          <Text style={styles.subtitle}>
            Revisa los datos y acepta solo si puedes recoger al cliente.
          </Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoBox}>
              <Text style={styles.label}>Cliente</Text>
              <Text style={styles.value}>
                {oferta?.solicitud?.nombreCliente || "-"}
              </Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.label}>Teléfono</Text>
              <Text style={styles.value}>
                {oferta?.solicitud?.telefonoCliente || "-"}
              </Text>
            </View>

            <View style={[styles.infoBox, styles.infoBoxFull]}>
              <Text style={styles.label}>Recogida</Text>
              <Text style={styles.value}>{recogida}</Text>
            </View>

            {!!oferta?.solicitud?.referenciaRecogida && (
              <View style={[styles.infoBox, styles.infoBoxFull]}>
                <Text style={styles.label}>Referencia</Text>
                <Text style={styles.value}>
                  {oferta?.solicitud?.referenciaRecogida}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => onRechazar(oferta.ofertaId)}
              activeOpacity={0.85}
            >
              <Ionicons name="close-outline" size={20} color="#fff" />
              <Text style={styles.actionText}>Rechazar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => onAceptar(oferta.ofertaId)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark-outline" size={20} color="#fff" />
              <Text style={styles.actionText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 470,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 28,
    elevation: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#dbeafe",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "800",
  },
  timerBox: {
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
  },
  timerBoxUrgent: {
    backgroundColor: "#fee2e2",
  },
  timerText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
  },
  timerTextUrgent: {
    color: "#dc2626",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#64748b",
    marginBottom: 18,
    lineHeight: 21,
  },
  infoGrid: {
    gap: 10,
  },
  infoBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#edf2f7",
    borderRadius: 16,
    padding: 14,
  },
  infoBoxFull: {},
  label: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#64748b",
    marginBottom: 5,
  },
  value: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 23,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  actionButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#16a34a",
  },
  rejectButton: {
    backgroundColor: "#dc2626",
  },
  actionText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
});