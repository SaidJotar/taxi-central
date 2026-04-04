import React from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { ServicioActivo } from "../types";

type Props = {
  servicio: ServicioActivo | null;
  onTerminar: () => void;
};

export default function ServicioActivoCard({ servicio, onTerminar }: Props) {
  if (!servicio) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Servicio activo</Text>
      <Text>Cliente: {servicio.nombreCliente || "No disponible"}</Text>
      <Text>Teléfono: {servicio.telefonoCliente || "No disponible"}</Text>
      <Text>
        Recogida: {servicio.direccionBase || servicio.direccionRecogida || "No disponible"}
      </Text>
      {!!servicio.referenciaRecogida && (
        <Text>Referencia: {servicio.referenciaRecogida}</Text>
      )}
      <Button title="Terminar servicio" onPress={onTerminar} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
});