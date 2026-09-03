import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setIsAudioActiveAsync,
} from "expo-audio";

import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import useTaxiLocation from "../hooks/useTaxiLocation";
import { useOferta } from "../context/OfertaContext";
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "../lib/backgroundLocation";
import ChatTaxistaScreen from "../screens/ChatTaxistaScreen";

export default function InicioScreen() {
  const { token, taxista, updateTaxista } = useAuth();

  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const espacioInferior = tabBarHeight + insets.bottom;

  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState(taxista?.estado || "desconectado");
  const { servicioActivo, setServicioActivo } = useOferta();

  const llamadaPlayer =
    useAudioPlayer(null);

  const llamadaCargadaIdRef = useRef(null);

  const estadoLlamadaPlayer =
    useAudioPlayerStatus(llamadaPlayer);

  /*
   * Nos indica que hemos pulsado Escuchar
   * y estamos esperando a que replace()
   * termine de cargar el WAV.
   */
  const esperandoAudioRef =
    useRef(false);


  const servicioActivoRef = useRef(servicioActivo);

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

  const [mostrarCerrarServicio, setMostrarCerrarServicio] = useState(false);
  const [costoFinalInput, setCostoFinalInput] = useState("");
  const [guardandoCierre, setGuardandoCierre] = useState(false);

  const [mostrarChatServicio, setMostrarChatServicio] = useState(false);

  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);

  const mensajesInicializadosRef = useRef(false);
  const ultimoMensajeClienteRef = useRef(null);

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

  const API_BASE_URL = (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    "https://api.sjaceuta.es"
  ).replace(/\/$/, "");

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

  const recuperarServicioActivo = useCallback(() => {
    if (!socket?.connected) return;

    console.log("🔄 Buscando servicio activo del taxista...");

    socket.emit(
      "taxista:recuperar_servicio_activo",
      null,
      (respuesta) => {
        console.log(
          "📥 recuperar_servicio_activo:",
          respuesta
        );

        if (respuesta?.servicioActivo) {
          servicioActivoRef.current =
            respuesta.servicioActivo;

          setServicioActivo(
            respuesta.servicioActivo
          );

          console.log(
            "✅ Servicio activo recuperado"
          );
        } else {
          servicioActivoRef.current = null;

          setServicioActivo(null);

          console.log(
            "ℹ️ No existe servicio activo"
          );
        }
      }
    );
  }, [socket, setServicioActivo]);

  useEffect(() => {
    cargarTaxisDisponibles();
    const intervalo = setInterval(cargarTaxisDisponibles, 10000);

    return () => clearInterval(intervalo);
  }, [cargarTaxisDisponibles]);

  const cargarPosicionEnCola = useCallback(() => {
    socket.emit("taxista:posicion_en_cola", null, (respuesta) => {
      if (respuesta?.posicion != null) {
        setPosicionEnParada(respuesta.posicion);
      } else {
        setPosicionEnParada(null);
      }
    });
  }, [socket]);

  useEffect(() => {
    cargarPosicionEnCola();
    const intervalo = setInterval(cargarPosicionEnCola, 10000);

    return () => clearInterval(intervalo);
  }, [cargarPosicionEnCola]);

  useEffect(() => {
    console.log("🎧 Estado reproductor:", {
      isLoaded:
        estadoLlamadaPlayer.isLoaded,
      playing:
        estadoLlamadaPlayer.playing,
      duration:
        estadoLlamadaPlayer.duration,
      currentTime:
        estadoLlamadaPlayer.currentTime,
      error:
        estadoLlamadaPlayer.error,
    });

    if (!esperandoAudioRef.current) {
      return;
    }

    if (!estadoLlamadaPlayer.isLoaded) {
      return;
    }

    try {
      console.log(
        "✅ WAV cargado. Iniciando reproducción..."
      );

      llamadaPlayer.volume = 1;
      llamadaPlayer.muted = false;

      llamadaPlayer.play();

      esperandoAudioRef.current = false;

      console.log(
        "▶️ llamadaPlayer.play() ejecutado"
      );
    } catch (error) {
      console.log(
        "❌ Error ejecutando play:",
        error?.message || error
      );

      esperandoAudioRef.current = false;

      Alert.alert(
        "Error de audio",
        "No se ha podido reproducir la llamada."
      );
    }
  }, [
    estadoLlamadaPlayer.isLoaded,
  ]);


  useEffect(() => {
    setConectado(!!socket?.connected);
  }, [socket]);

  useEffect(() => {
    servicioActivoRef.current = servicioActivo;
  }, [servicioActivo]);

  useEffect(() => {

    if (
      !socket ||
      !servicioActivo?.solicitudId ||
      servicioActivo?.callId
    ) {
      mensajesInicializadosRef.current = false;
      ultimoMensajeClienteRef.current = null;
      setMensajesNoLeidos(0);

      return;
    }

    const solicitudIdActual =
      String(servicioActivo.solicitudId);

    /*
     * Cuando cambia de servicio,
     * reiniciamos el contador.
     */
    mensajesInicializadosRef.current = false;
    ultimoMensajeClienteRef.current = null;
    setMensajesNoLeidos(0);

    const onNuevoMensaje = (data) => {
      if (
        String(data?.solicitudId) !==
        solicitudIdActual
      ) {
        return;
      }

      const mensaje = data?.mensaje;

      if (!mensaje) {
        return;
      }

      /*
       * Al taxista solo le interesan
       * los mensajes enviados por el cliente.
       */
      if (mensaje.emisorTipo !== "cliente") {
        return;
      }

      /*
       * Si el chat está abierto,
       * no contamos el mensaje como no leído.
       */
      if (mostrarChatServicio) {
        ultimoMensajeClienteRef.current =
          mensaje.id;

        return;
      }

      /*
       * Evitar duplicados.
       */
      if (
        ultimoMensajeClienteRef.current ===
        mensaje.id
      ) {
        return;
      }

      ultimoMensajeClienteRef.current =
        mensaje.id;

      setMensajesNoLeidos(
        (actual) => actual + 1
      );
    };

    socket.on(
      "chat:nuevo_mensaje",
      onNuevoMensaje
    );

    return () => {
      socket.off(
        "chat:nuevo_mensaje",
        onNuevoMensaje
      );
    };

  }, [
    socket,
    servicioActivo?.solicitudId,
    servicioActivo?.callId,
    mostrarChatServicio,
  ]);

  useEffect(() => {
    if (!servicioActivo) return;

    setParadaEntrando(null);
    setParadaSaliendo(null);
    setSegundosEntradaParada(0);

    setParadaActual(null);
    setColaParada([]);
    setPosicionEnParada(null);
  }, [servicioActivo]);

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
      console.log(
        "🟢 socket conectado",
        socket.id
      );

      setConectado(true);

      socket.emit(
        "taxista:recuperar_servicio_activo",
        null,
        (respuesta) => {
          console.log(
            "📥 Servicio tras reconexión:",
            respuesta
          );

          if (respuesta?.servicioActivo) {
            servicioActivoRef.current =
              respuesta.servicioActivo;

            setServicioActivo(
              respuesta.servicioActivo
            );
          } else {
            servicioActivoRef.current = null;

            setServicioActivo(null);
          }
        }
      );
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
      console.log("✅ Servicio finalizado");

      setMostrarCerrarServicio(false);
      setCostoFinalInput("");
      setGuardandoCierre(false);
      setMostrarChatServicio(false);

      try {
        llamadaPlayer.pause();
        await llamadaPlayer.seekTo(0);
      } catch {
        // No pasa nada si no había audio
      }

      llamadaCargadaIdRef.current = null;
      esperandoAudioRef.current = false;

      servicioActivoRef.current = null;
      setServicioActivo(null);

      setParadaActual(null);
      setParadaEntrando(null);
      setParadaSaliendo(null);
      setSegundosEntradaParada(0);
      setColaParada([]);
      setPosicionEnParada(null);

      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "disponible");
      } else {
        setEstado("disponible");
      }

      const ubicacion = await refrescarUbicacion();

      console.log(
        "📍 Ubicación recargada tras finalizar:",
        ubicacion
      );

      cargarPosicionEnCola();
      cargarTaxisDisponibles();
    });

    socket.on("servicio:cliente_no_localizado_ok", async (data) => {
      console.log("🚫 Cliente no localizado confirmado", data);

      // Cerramos cualquier modal/chat que estuviera abierto
      setMostrarCerrarServicio(false);
      setCostoFinalInput("");
      setGuardandoCierre(false);
      setMostrarChatServicio(false);

      // Muy importante:
      // eliminamos el servicio activo de la app
      servicioActivoRef.current = null;
      setServicioActivo(null);

      // Limpiamos estado visual de parada
      setParadaActual(null);
      setParadaEntrando(null);
      setParadaSaliendo(null);
      setSegundosEntradaParada(0);
      setColaParada([]);
      setPosicionEnParada(null);

      // El backend ya devuelve el taxista actualizado como disponible
      if (data?.taxista) {
        await updateTaxista(data.taxista);
        setEstado(data.taxista.estado || "disponible");
      } else {
        setEstado("disponible");
      }

      // Refrescamos GPS porque vuelve a estar disponible
      const ubicacion = await refrescarUbicacion();

      console.log(
        "📍 Ubicación recargada tras cliente no localizado:",
        ubicacion
      );

      cargarPosicionEnCola();
      cargarTaxisDisponibles();
    });

    socket.on("taxista:parada_sugerida", (data) => {
      console.log("📥 taxista:parada_sugerida", data);

      if (servicioActivoRef.current) {
        console.log(
          "🚫 Sugerencia de parada ignorada porque existe un servicio activo"
        );

        setParadaEntrando(null);
        setParadaSaliendo(null);
        setSegundosEntradaParada(0);
        return;
      }

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

      if (servicioActivoRef.current) {
        console.log(
          "🚫 Confirmación de parada ignorada durante el servicio"
        );
        return;
      }

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
      setGuardandoCierre(false);
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
      socket.off("servicio:cliente_no_localizado_ok");
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

  const obtenerAudioLlamada =
    async () => {
      try {
        if (
          !servicioActivo?.callId
        ) {
          Alert.alert(
            "Llamada no disponible",
            "Este servicio no tiene una llamada asociada."
          );

          return null;
        }

        console.log(
          "📞 Solicitando grabación Retell:",
          servicioActivo.callId
        );

        const response =
          await fetch(
            `${API_BASE_URL}/retell/call/${servicioActivo.callId}/audio`
          );

        const data =
          await response.json();

        console.log(
          "📥 Respuesta audio backend:",
          data
        );

        if (
          !response.ok ||
          !data?.recordingUrl
        ) {
          Alert.alert(
            "Llamada no disponible",
            "La grabación todavía no está disponible o ya ha caducado."
          );

          return null;
        }

        return data.recordingUrl;
      } catch (error) {
        console.log(
          "❌ Error obteniendo grabación:",
          error?.message || error
        );

        Alert.alert(
          "Llamada no disponible",
          "No se pudo obtener la grabación."
        );

        return null;
      }
    };


  const escucharLlamadaCliente = async () => {
    try {
      const callIdActual =
        servicioActivo?.callId || null;

      if (!callIdActual) {
        Alert.alert(
          "Llamada no disponible",
          "Este servicio no tiene una llamada asociada."
        );
        return;
      }

      // ==================================================
      // ESTE MISMO AUDIO YA ESTÁ REPRODUCIÉNDOSE
      // ==================================================
      if (
        llamadaCargadaIdRef.current === callIdActual &&
        estadoLlamadaPlayer.playing
      ) {
        console.log("⏸️ Pausando llamada");

        llamadaPlayer.pause();
        return;
      }

      // ==================================================
      // ESTE MISMO AUDIO YA ESTÁ CARGADO
      // ==================================================
      if (
        llamadaCargadaIdRef.current === callIdActual &&
        estadoLlamadaPlayer.isLoaded
      ) {
        await setIsAudioActiveAsync(true);

        llamadaPlayer.volume = 1;
        llamadaPlayer.muted = false;

        const currentTime =
          estadoLlamadaPlayer.currentTime || 0;

        const duration =
          estadoLlamadaPlayer.duration || 0;

        const estaAlFinal =
          duration > 0 &&
          currentTime >= duration - 0.5;

        if (estaAlFinal) {
          console.log(
            "🔄 Reiniciando llamada desde el principio"
          );

          await llamadaPlayer.seekTo(0);
        } else {
          console.log(
            "▶️ Continuando llamada desde:",
            currentTime
          );
        }

        llamadaPlayer.play();

        return;
      }

      // ==================================================
      // ES OTRO SERVICIO -> HAY QUE CARGAR OTRO AUDIO
      // ==================================================

      console.log(
        "🆕 Nueva llamada. Call ID:",
        callIdActual
      );

      try {
        llamadaPlayer.pause();
      } catch {
        // Puede no haber nada reproduciéndose
      }

      const recordingUrl =
        await obtenerAudioLlamada();

      if (!recordingUrl) {
        return;
      }

      console.log(
        "🎧 Cargando audio del nuevo servicio:",
        recordingUrl
      );

      await setIsAudioActiveAsync(true);

      llamadaPlayer.volume = 1;
      llamadaPlayer.muted = false;

      /*
       * Guardamos qué llamada estamos cargando.
       */
      llamadaCargadaIdRef.current =
        callIdActual;

      /*
       * El useEffect que ya tienes hará play()
       * cuando isLoaded pase a true.
       */
      esperandoAudioRef.current = true;

      llamadaPlayer.replace({
        uri: recordingUrl,
      });

    } catch (error) {
      console.log(
        "❌ Error controlando llamada:",
        error?.message || error
      );

      Alert.alert(
        "Llamada no disponible",
        "No se ha podido reproducir la grabación."
      );
    }
  };

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

  const abrirCerrarServicio = () => {
    if (!servicioActivo?.solicitudId) return;
    setCostoFinalInput("");
    setMostrarCerrarServicio(true);
  };

  const confirmarCerrarServicio = () => {
    if (!servicioActivo?.solicitudId) return;

    const costo = Number(String(costoFinalInput).replace(",", "."));

    if (!Number.isFinite(costo) || costo < 0) {
      return;
    }

    setGuardandoCierre(true);

    socket.emit("servicio:terminar", {
      solicitudId: servicioActivo.solicitudId,
      costoFinal: costo,
    });
  };

  const clienteNoLocalizado = () => {
    if (!servicioActivo?.solicitudId) return;

    Alert.alert(
      "Cliente no localizado",
      "¿Confirmas que no has podido localizar al cliente?",
      [
        {
          text: "Volver",
          style: "cancel",
        },
        {
          text: "Confirmar",
          style: "destructive",
          onPress: () => {
            socket.emit("servicio:cliente_no_localizado", {
              solicitudId: servicioActivo.solicitudId,
            });
          },
        },
      ]
    );
  };

  const numeroTaxi = taxista?.vehiculo?.numeroTaxi || null;

  if (
    mostrarChatServicio &&
    servicioActivo?.solicitudId
  ) {
    return (
      <ChatTaxistaScreen
        solicitudId={
          servicioActivo.solicitudId
        }
        clienteNombre={
          servicioActivo.nombreCliente ||
          "Cliente"
        }
        onClose={() => {
          setMostrarChatServicio(false);
          setMensajesNoLeidos(0);
        }}
      />
    );
  }

  const llamadaTerminada =
    estadoLlamadaPlayer.isLoaded &&
    estadoLlamadaPlayer.duration > 0 &&
    estadoLlamadaPlayer.currentTime >=
    estadoLlamadaPlayer.duration - 0.5;

  return (
    <SafeAreaView style={styles.appShell} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(espacioInferior, 28) },
        ]}
        showsVerticalScrollIndicator={false}

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
              <Text style={styles.onlineLabel}>Taxis Disponibles</Text>
              <Text style={styles.onlineValue}>
                {taxisDisponibles !== null ? taxisDisponibles : "..."}
              </Text>
            </View>
          </View>

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

          {!servicioActivo && paradaEntrando?.parada && (
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

              {servicioActivo?.callId && (
                <TouchableOpacity
                  style={styles.llamadaButton}
                  onPress={escucharLlamadaCliente}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={
                      estadoLlamadaPlayer.playing
                        ? "pause-circle-outline"
                        : llamadaTerminada
                          ? "refresh-circle-outline"
                          : "play-circle-outline"
                    }
                    size={26}
                    color="#2563eb"
                  />

                  <View style={{ flex: 1 }}>
                    <Text style={styles.llamadaButtonTitle}>
                      {estadoLlamadaPlayer.playing
                        ? "Pausar llamada"
                        : llamadaTerminada
                          ? "Volver a escuchar"
                          : estadoLlamadaPlayer.isLoaded
                            ? "Continuar llamada"
                            : "Escuchar llamada"}
                    </Text>

                    <Text style={styles.llamadaButtonSubtitle}>
                      Conversación con el cliente
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.clienteNoLocalizadoButton}
                onPress={clienteNoLocalizado}
              >
                <Ionicons
                  name="person-remove-outline"
                  size={20}
                  color="#b91c1c"
                />

                <Text style={styles.clienteNoLocalizadoText}>
                  Cliente no localizado
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.finishButton}
                onPress={abrirCerrarServicio}
              >
                <Text style={styles.finishButtonText}>Finalizar servicio</Text>
              </TouchableOpacity>
            </View>
          )}
          {servicioActivo && !servicioActivo?.callId && (
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => {
                setMensajesNoLeidos(0);
                setMostrarChatServicio(true);
              }}
            >
              <View style={styles.chatIconWrap}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color="#111827"
                />

                {mensajesNoLeidos > 0 && (
                  <View style={styles.chatBadge}>
                    <Text style={styles.chatBadgeText}>
                      {mensajesNoLeidos > 9
                        ? "9+"
                        : mensajesNoLeidos}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.chatButtonText}>
                Mensaje
              </Text>

              {mensajesNoLeidos > 0 && (
                <View style={styles.messageDot} />
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      <Modal
        visible={mostrarCerrarServicio}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finalizar servicio</Text>
            <Text style={styles.modalSubtitle}>
              Introduce el coste final antes de cerrar el viaje.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Ej. 8.50"
              keyboardType="decimal-pad"
              value={costoFinalInput}
              onChangeText={setCostoFinalInput}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => {
                  if (guardandoCierre) return;
                  setMostrarCerrarServicio(false);
                  setCostoFinalInput("");
                }}
              >
                <Text style={styles.modalSecondaryText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalPrimaryButton,
                  guardandoCierre && { opacity: 0.7 },
                ]}
                onPress={confirmarCerrarServicio}
                disabled={guardandoCierre}
              >
                <Text style={styles.modalPrimaryText}>
                  {guardandoCierre ? "Guardando..." : "Finalizar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginTop: 14,
    padding: 14,          // antes 18
    borderRadius: 18,     // antes 20
    backgroundColor: "#fff",
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
    fontSize: 19,
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
    marginBottom: 8,
  },

  servicioLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 2,
  },

  servicioValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 20,
  },

  finishButton: {
    marginTop: 4,
    backgroundColor: "#16a34a",
    borderRadius: 14,
    paddingVertical: 12,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  modalSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748b",
  },
  modalInput: {
    marginTop: 16,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  modalSecondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalPrimaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  chatButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  clienteNoLocalizadoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    marginTop: 8,
    marginBottom: 8,
  },

  llamadaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

  llamadaButtonTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e3a8a",
  },

  llamadaButtonSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },

  clienteNoLocalizadoText: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "600",
  },
  chatIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },

  chatBadge: {
    position: "absolute",
    top: -7,
    right: -9,

    minWidth: 18,
    height: 18,

    borderRadius: 9,
    backgroundColor: "#ef4444",

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 4,
  },

  chatBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },

  messageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
});