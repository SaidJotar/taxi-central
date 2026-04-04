import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotificationsAsync } from "../lib/pushNotifications";



export default function LoginScreen() {
  const { setSession } = useAuth();

  const [modo, setModo] = useState("login"); // 'login', 'register', 'verify', 'forgot', 'reset'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");

  const [form, setForm] = useState({
    nombreCompleto: "",
    telefono: "",
    password: "",
    numeroTaxi: "",
    matricula: "",
    marca: "",
    modelo: "",
  });

  const [codigo, setCodigo] = useState("");
  const [telefonoPendiente, setTelefonoPendiente] = useState("");

  const updateForm = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const completarSesion = async (token, taxista) => {
    await setSession(token, taxista);

    const expoPushToken = await registerForPushNotificationsAsync();
    console.log("expoPushToken NUEVO:", expoPushToken);

    if (expoPushToken) {
      try {
        const res = await api.guardarPushToken(token, expoPushToken);
        console.log("✅ Push token guardado:", res);
      } catch (e) {
        console.log("❌ Error guardando push token:", e.message);
      }
    } else {
      console.log("❌ No se obtuvo expoPushToken");
    }
  };

  const handleLogin = async () => {
    const data = await api.login(form.telefono.trim(), form.password);

    if (data?.requiresVerification) {
      setTelefonoPendiente(data.telefono || form.telefono.trim());
      setModo("verify");
      setCodigo("");
      setError("");
      setSuccess(
        "Debes verificar tu teléfono. Te enviamos un nuevo código si lo necesitas."
      );
      return;
    }

    if (!data?.ok || !data?.token || !data?.taxista) {
      throw new Error(data?.error || "Respuesta de login no válida");
    }

    await completarSesion(data.token, data.taxista);
  };

  const handleRegister = async () => {
    const data = await api.register({
      ...form,
      telefono: form.telefono.trim(),
    });

    if (!data?.ok) {
      throw new Error(data?.error || "Error en el registro");
    }

    setTelefonoPendiente(form.telefono.trim());
    setModo("verify");
    setSuccess(data.message || "Te hemos enviado un código por SMS");
    setError("");
  };

  const handleVerify = async () => {
    const data = await api.verifyPhone(telefonoPendiente, codigo);

    if (!data?.ok || !data?.token || !data?.taxista) {
      throw new Error(data?.error || "Código incorrecto");
    }

    await completarSesion(data.token, data.taxista);
  };

  const handleResendCode = async () => {
    const data = await api.resendCode(telefonoPendiente);

    if (!data?.ok) {
      throw new Error(data?.error || "No se pudo reenviar el código");
    }

    setSuccess(data.message || "Código reenviado");
    setError("");
  };

  const handleForgotPassword = async () => {
    const telefono = form.telefono.trim();

    if (!telefono) {
      throw new Error("Debes introducir tu teléfono");
    }

    const data = await api.forgotPassword(telefono);

    if (!data?.ok) {
      throw new Error(data?.error || "No se pudo enviar el código");
    }

    setTelefonoPendiente(telefono);
    setModo("reset");
    setSuccess(data.message || "Te hemos enviado un código por SMS");
    setError("");
  };

  const handleResetPassword = async () => {
    const data = await api.resetPassword(
      telefonoPendiente,
      codigo,
      nuevaPassword
    );

    if (!data?.ok) {
      throw new Error(data?.error || "No se pudo cambiar la contraseña");
    }

    setSuccess(data.message || "Contraseña cambiada correctamente");
    setError("");
    setCodigo("");
    setNuevaPassword("");

    setModo("login");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (modo === "login") {
        await handleLogin();
      } else if (modo === "register") {
        await handleRegister();
      } else if (modo === "verify") {
        await handleVerify();
      } else if (modo === "forgot") {
        await handleForgotPassword();
      } else if (modo === "reset") {
        await handleResetPassword();
      }
    } catch (e) {
      console.log(`❌ Error en ${modo}:`, e.message);
      setError(e.message || "Ha ocurrido un error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.appShell}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.appCard}>
            <View style={styles.appHeader}>
              <Text style={styles.appTitle}>
                {modo === "verify"
                  ? "Verifica tu teléfono"
                  : modo === "login"
                    ? "App Taxista"
                    : "Registro de taxista"}
              </Text>

              <Text style={styles.appSubtitle}>
                {modo === "login" &&
                  "Inicia sesión con tu teléfono y contraseña"}
                {modo === "register" && "Crea tu cuenta y tu vehículo"}
                {modo === "verify" &&
                  `Hemos enviado un código SMS al número ${telefonoPendiente}`}
              </Text>
            </View>

            <View style={styles.loginForm}>
              {modo === "verify" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Introduce el código"
                    value={codigo}
                    onChangeText={setCodigo}
                    keyboardType="number-pad"
                  />

                  {!!error && <Text style={styles.formError}>{error}</Text>}
                  {!!success && <Text style={styles.formSuccess}>{success}</Text>}

                  <TouchableOpacity
                    style={[styles.mainButton, loading && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.mainButtonText}>Verificar teléfono</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleResendCode}
                    disabled={loading}
                  >
                    <Text style={styles.secondaryButtonText}>Reenviar código</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      setModo("register");
                      setCodigo("");
                      setError("");
                      setSuccess("");
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.linkButtonText}>Volver al registro</Text>
                  </TouchableOpacity>
                </>
              ) : modo === "forgot" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Teléfono"
                    value={form.telefono}
                    onChangeText={(text) => updateForm("telefono", text)}
                    keyboardType="phone-pad"
                  />

                  {!!error && <Text style={styles.formError}>{error}</Text>}
                  {!!success && <Text style={styles.formSuccess}>{success}</Text>}

                  <TouchableOpacity
                    style={[styles.mainButton, loading && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.mainButtonText}>Enviar código</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      setModo("login");
                      setError("");
                      setSuccess("");
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.linkButtonText}>Volver al inicio de sesión</Text>
                  </TouchableOpacity>
                </>
              ) : modo === "reset" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Código SMS"
                    value={codigo}
                    onChangeText={setCodigo}
                    keyboardType="number-pad"
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Nueva contraseña"
                    value={nuevaPassword}
                    onChangeText={setNuevaPassword}
                    secureTextEntry
                  />

                  {!!error && <Text style={styles.formError}>{error}</Text>}
                  {!!success && <Text style={styles.formSuccess}>{success}</Text>}

                  <TouchableOpacity
                    style={[styles.mainButton, loading && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.mainButtonText}>Cambiar contraseña</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      setModo("login");
                      setCodigo("");
                      setNuevaPassword("");
                      setError("");
                      setSuccess("");
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.linkButtonText}>Volver al inicio de sesión</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {modo === "register" && (
                    <TextInput
                      style={styles.input}
                      placeholder="Nombre completo"
                      value={form.nombreCompleto}
                      onChangeText={(text) => updateForm("nombreCompleto", text)}
                    />
                  )}

                  <TextInput
                    style={styles.input}
                    placeholder="Teléfono"
                    value={form.telefono}
                    onChangeText={(text) => updateForm("telefono", text)}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Contraseña"
                    value={form.password}
                    onChangeText={(text) => updateForm("password", text)}
                    secureTextEntry
                    autoCapitalize="none"
                  />

                  {modo === "register" && (
                    <>
                      <TextInput
                        style={styles.input}
                        placeholder="Número de taxi"
                        value={form.numeroTaxi}
                        onChangeText={(text) => updateForm("numeroTaxi", text)}
                      />

                      <TextInput
                        style={styles.input}
                        placeholder="Matrícula"
                        value={form.matricula}
                        onChangeText={(text) => updateForm("matricula", text)}
                        autoCapitalize="characters"
                      />

                      <TextInput
                        style={styles.input}
                        placeholder="Modelo"
                        value={form.modelo}
                        onChangeText={(text) => updateForm("modelo", text)}
                      />

                      <TextInput
                        style={styles.input}
                        placeholder="Color"
                        value={form.color}
                        onChangeText={(text) => updateForm("color", text)}
                      />
                    </>
                  )}

                  {!!error && <Text style={styles.formError}>{error}</Text>}
                  {!!success && <Text style={styles.formSuccess}>{success}</Text>}

                  <TouchableOpacity
                    style={[styles.mainButton, loading && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.mainButtonText}>
                        {modo === "login" ? "Entrar" : "Registrarme"}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {modo === "login" && (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => {
                        setModo("forgot");
                        setError("");
                        setSuccess("");
                      }}
                      disabled={loading}
                    >
                      <Text style={styles.linkButtonText}>He olvidado mi contraseña</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.linkButton}
                    onPress={() => {
                      setModo((prev) => (prev === "login" ? "register" : "login"));
                      setError("");
                      setSuccess("");
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.linkButtonText}>
                      {modo === "login"
                        ? "No tengo cuenta"
                        : "Ya tengo cuenta, iniciar sesión"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  appCard: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 25,
    elevation: 6,
  },
  appHeader: {
    marginBottom: 24,
    alignItems: "center",
  },
  appTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  appSubtitle: {
    marginTop: 12,
    color: "#475569",
    fontSize: 16,
    textAlign: "center",
  },
  loginForm: {
    gap: 12,
    marginTop: 20,
  },
  input: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe1ea",
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  formError: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 15,
  },
  formSuccess: {
    color: "#16a34a",
    fontWeight: "600",
    fontSize: 15,
  },
  mainButton: {
    backgroundColor: "#1f2937",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  mainButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkButtonText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },
});