import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function PerfilScreen() {

  const router = useRouter();

  const {
    token,
    taxista,
    updateTaxista,
  } = useAuth();


  const [form, setForm] = useState({
    nombreCompleto: "",
    numeroTaxi: "",
    matricula: "",
    marca: "",
    modelo: "",
  });


  const [
    guardando,
    setGuardando,
  ] = useState(false);


  useEffect(() => {

    if (!taxista) {
      return;
    }


    setForm({

      nombreCompleto:
        taxista.nombreCompleto ||
        "",

      numeroTaxi:
        taxista.vehiculo
          ?.numeroTaxi ||
        "",

      matricula:
        taxista.vehiculo
          ?.matricula ||
        "",

      marca:
        taxista.vehiculo
          ?.marca ||
        "",

      modelo:
        taxista.vehiculo
          ?.modelo ||
        "",

    });

  }, [taxista]);


  const updateField = (
    field,
    value
  ) => {

    setForm(
      (prev) => ({
        ...prev,
        [field]: value,
      })
    );

  };


  const guardar = async () => {

    try {

      setGuardando(true);


      const res =
        await api.actualizarPerfil(
          token,
          form
        );


      if (res?.taxista) {

        await updateTaxista(
          res.taxista
        );

      }


      Alert.alert(
        "Perfil actualizado",
        "Tus datos se han guardado correctamente.",
        [
          {
            text: "OK",

            onPress: () =>
              router.replace("/"),
          },
        ]
      );


    } catch (e) {

      Alert.alert(
        "Error",
        e.message ||
        "No se pudo guardar el perfil"
      );


    } finally {

      setGuardando(false);

    }

  };


  return (

    <SafeAreaView style={styles.container}>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            styles.scrollContent
          }
        >

          <View style={styles.headerBlock}>

            <Text style={styles.eyebrow}>
              CUENTA
            </Text>

            <Text style={styles.title}>
              Mi perfil
            </Text>

            <Text style={styles.subtitle}>
              Gestiona tus datos y los de tu vehículo.
            </Text>

          </View>


          <View style={styles.profileCard}>

            <View style={styles.sectionHeader}>

              <View style={styles.sectionIcon}>

                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#2563eb"
                />

              </View>

              <View style={styles.sectionText}>

                <Text style={styles.sectionTitle}>
                  Datos del taxista
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Información personal
                </Text>

              </View>

            </View>


            <Text style={styles.inputLabel}>
              NOMBRE COMPLETO
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Nombre completo"
              placeholderTextColor="#94a3b8"
              value={
                form.nombreCompleto
              }
              onChangeText={(text) =>
                updateField(
                  "nombreCompleto",
                  text
                )
              }
            />

          </View>


          <View style={styles.profileCard}>

            <View style={styles.sectionHeader}>

              <View style={styles.sectionIcon}>

                <Ionicons
                  name="car-outline"
                  size={18}
                  color="#2563eb"
                />

              </View>

              <View style={styles.sectionText}>

                <Text style={styles.sectionTitle}>
                  Vehículo
                </Text>

                <Text style={styles.sectionSubtitle}>
                  Datos asociados a tu taxi
                </Text>

              </View>

            </View>


            <Text style={styles.inputLabel}>
              NÚMERO DE TAXI
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Número de taxi"
              placeholderTextColor="#94a3b8"
              value={form.numeroTaxi}
              onChangeText={(text) =>
                updateField(
                  "numeroTaxi",
                  text
                )
              }
            />


            <Text style={styles.inputLabel}>
              MATRÍCULA
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Matrícula"
              placeholderTextColor="#94a3b8"
              value={form.matricula}
              onChangeText={(text) =>
                updateField(
                  "matricula",
                  text
                )
              }
              autoCapitalize="characters"
            />


            <View style={styles.doubleInputRow}>

              <View style={styles.inputHalf}>

                <Text style={styles.inputLabel}>
                  MARCA
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Marca"
                  placeholderTextColor="#94a3b8"
                  value={form.marca}
                  onChangeText={(text) =>
                    updateField(
                      "marca",
                      text
                    )
                  }
                />

              </View>


              <View style={styles.inputHalf}>

                <Text style={styles.inputLabel}>
                  MODELO
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Modelo"
                  placeholderTextColor="#94a3b8"
                  value={form.modelo}
                  onChangeText={(text) =>
                    updateField(
                      "modelo",
                      text
                    )
                  }
                />

              </View>

            </View>

          </View>


          <TouchableOpacity
            style={[
              styles.mainButton,
              guardando &&
              styles.buttonDisabled,
            ]}
            onPress={guardar}
            disabled={guardando}
            activeOpacity={0.85}
          >

            <Ionicons
              name="save-outline"
              size={18}
              color="#ffffff"
            />

            <Text style={styles.mainButtonText}>

              {guardando
                ? "Guardando..."
                : "Guardar cambios"}

            </Text>

          </TouchableOpacity>


          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              router.replace("/")
            }
            activeOpacity={0.85}
          >

            <Text style={styles.secondaryButtonText}>
              Cancelar
            </Text>

          </TouchableOpacity>

        </ScrollView>

      </KeyboardAvoidingView>

    </SafeAreaView>

  );
}


const styles = StyleSheet.create({

  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  scrollContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 24,
  },


  headerBlock: {
    marginBottom: 14,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 1,
    textTransform: "uppercase",
  },

  title: {
    fontSize: 23,
    lineHeight: 26,
    fontWeight: "900",
    color: "#0f172a",
  },

  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748b",
  },


  profileCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 8,

    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 12,
    elevation: 3,
  },


  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 13,
  },

  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionText: {
    flex: 1,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },

  sectionSubtitle: {
    marginTop: 1,
    fontSize: 10,
    color: "#64748b",
  },


  inputLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 5,
  },

  input: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,

    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",

    marginBottom: 11,
  },


  doubleInputRow: {
    flexDirection: "row",
    gap: 8,
  },

  inputHalf: {
    flex: 1,
  },


  mainButton: {
    width: "100%",
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 2,
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  mainButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },


  secondaryButton: {
    width: "100%",
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },

});