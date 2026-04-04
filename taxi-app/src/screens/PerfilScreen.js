import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function PerfilScreen() {
  const router = useRouter();
  const { token, taxista, updateTaxista } = useAuth();

  const [form, setForm] = useState({
    nombreCompleto: "",
    numeroTaxi: "",
    matricula: "",
    marca: "",
    modelo: "",
  });

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!taxista) return;

    setForm({
      nombreCompleto: taxista.nombreCompleto || "",
      numeroTaxi: taxista.vehiculo?.numeroTaxi || "",
      matricula: taxista.vehiculo?.matricula || "",
      marca: taxista.vehiculo?.marca || "",
      modelo: taxista.vehiculo?.modelo || "",
    });
  }, [taxista]);

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const guardar = async () => {
    try {
      setGuardando(true);

      const res = await api.actualizarPerfil(token, form);

      if (res?.taxista) {
        await updateTaxista(res.taxista);
      }

      Alert.alert("Perfil actualizado", "Tus datos se han guardado correctamente.", [
        {
          text: "OK",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message || "No se pudo guardar el perfil");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Mi perfil</Text>

        <TextInput
          style={styles.input}
          placeholder="Nombre completo"
          value={form.nombreCompleto}
          onChangeText={(text) => updateField("nombreCompleto", text)}
        />

        <TextInput
          style={styles.input}
          placeholder="Número de taxi"
          value={form.numeroTaxi}
          onChangeText={(text) => updateField("numeroTaxi", text)}
        />

        <TextInput
          style={styles.input}
          placeholder="Matrícula"
          value={form.matricula}
          onChangeText={(text) => updateField("matricula", text)}
          autoCapitalize="characters"
        />

        <TextInput
          style={styles.input}
          placeholder="Marca"
          value={form.marca}
          onChangeText={(text) => updateField("marca", text)}
        />

        <TextInput
          style={styles.input}
          placeholder="Modelo"
          value={form.modelo}
          onChangeText={(text) => updateField("modelo", text)}
        />

        <TouchableOpacity
          style={styles.mainButton}
          onPress={guardar}
          disabled={guardando}
        >
          <Text style={styles.mainButtonText}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 18,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dbe1ea",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  mainButton: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  mainButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
  },
});