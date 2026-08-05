import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api/client";
import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";

export default function ChatTaxistaScreen({
    solicitudId,
    onClose,
    clienteNombre = "Cliente",
}) {
    const { token } = useAuth();

    const socket = useMemo(() => getSocket(token), [token]);

    const [mensajes, setMensajes] = useState([]);
    const [texto, setTexto] = useState("");
    const [loading, setLoading] = useState(true);
    const [enviando, setEnviando] = useState(false);

    const cargarMensajes = useCallback(async () => {
        try {
            if (!solicitudId) return;

            const res = await api.getMensajes(solicitudId);
            setMensajes(Array.isArray(res?.mensajes) ? res.mensajes : []);
        } catch (error) {
            console.log("Error cargando mensajes taxista:", error.message);
        } finally {
            setLoading(false);
        }
    }, [solicitudId]);

    useEffect(() => {
        cargarMensajes();

        const interval = setInterval(() => {
            cargarMensajes();
        }, 3000);

        return () => clearInterval(interval);
    }, [cargarMensajes]);

    useEffect(() => {
        if (!socket || !solicitudId) return;

        const onNuevoMensaje = (data) => {
            if (data?.solicitudId !== solicitudId) return;

            setMensajes((actual) => {
                const yaExiste = actual.some((m) => m.id === data?.mensaje?.id);
                if (yaExiste) return actual;
                return [...actual, data.mensaje];
            });
        };

        const onMensajeEnviadoOk = (data) => {
            if (data?.solicitudId !== solicitudId) return;

            setMensajes((actual) => {
                const yaExiste = actual.some((m) => m.id === data?.mensaje?.id);
                if (yaExiste) return actual;
                return [...actual, data.mensaje];
            });

            setTexto("");
            setEnviando(false);
        };

        socket.on("chat:nuevo_mensaje", onNuevoMensaje);
        socket.on("chat:mensaje_enviado_ok", onMensajeEnviadoOk);

        return () => {
            socket.off("chat:nuevo_mensaje", onNuevoMensaje);
            socket.off("chat:mensaje_enviado_ok", onMensajeEnviadoOk);
        };
    }, [socket, solicitudId]);

    const enviar = () => {
        if (!texto.trim() || !solicitudId) return;

        setEnviando(true);

        socket.emit("chat:enviar", {
            solicitudId,
            texto: texto.trim(),
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={90}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose}>
                        <Ionicons name="chevron-back" size={24} color="#111827" />
                    </TouchableOpacity>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.headerTitle}>Chat del servicio</Text>
                        <Text style={styles.headerSubtitle}>{clienteNombre}</Text>
                    </View>
                </View>

                {loading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#111827" />
                        <Text style={styles.loadingText}>Cargando mensajes…</Text>
                    </View>
                ) : (
                    <FlatList
                        data={mensajes}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => {
                            const esTaxista = item.emisorTipo === "taxista";

                            return (
                                <View
                                    style={[
                                        styles.messageBubble,
                                        esTaxista ? styles.messageTaxista : styles.messageCliente,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.messageText,
                                            esTaxista && styles.messageTextTaxista,
                                        ]}
                                    >
                                        {item.texto}
                                    </Text>
                                </View>
                            );
                        }}
                    />
                )}

                <View style={styles.inputBar}>
                    <TextInput
                        style={styles.input}
                        placeholder="Escribe un mensaje"
                        value={texto}
                        onChangeText={setTexto}
                        editable={!enviando}
                    />

                    <TouchableOpacity
                        style={[styles.sendButton, enviando && { opacity: 0.7 }]}
                        onPress={enviar}
                        disabled={enviando}
                    >
                        <Ionicons name="send" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#ffffff",
    },
    header: {
        height: 64,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: "#e2e8f0",
        backgroundColor: "#ffffff",
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: "#111827",
    },
    headerSubtitle: {
        marginTop: 2,
        fontSize: 13,
        color: "#64748b",
    },
    centered: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        color: "#64748b",
        fontSize: 14,
    },
    listContent: {
        padding: 16,
        gap: 10,
    },
    messageBubble: {
        maxWidth: "78%",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
    },
    messageCliente: {
        alignSelf: "flex-start",
        backgroundColor: "#f1f5f9",
    },
    messageTaxista: {
        alignSelf: "flex-end",
        backgroundColor: "#111827",
    },
    messageText: {
        fontSize: 15,
        color: "#111827",
        lineHeight: 20,
    },
    messageTextTaxista: {
        color: "#ffffff",
    },
    inputBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: Platform.OS === "ios" ? 22 : 12,
        borderTopWidth: 1,
        borderTopColor: "#e2e8f0",
        backgroundColor: "#ffffff",
    },
    input: {
        flex: 1,
        minHeight: 48,
        borderRadius: 16,
        backgroundColor: "#f8fafc",
        paddingHorizontal: 14,
        fontSize: 15,
        color: "#111827",
    },
    sendButton: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: "#111827",
        alignItems: "center",
        justifyContent: "center",
    },
});