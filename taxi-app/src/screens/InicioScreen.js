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
import ReservasTaxistaScreen
  from "../screens/ReservasTaxistaScreen";


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

  const [
    proximaReserva,
    setProximaReserva,
  ] = useState(null);

  const [
    pestañaReservasInicial,
    setPestañaReservasInicial,
  ] = useState("disponibles");

  const [
    totalReservasMias,
    setTotalReservasMias,
  ] = useState(0);

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

  const [
    mostrarReservas,
    setMostrarReservas,
  ] = useState(false);

  const [
    reservasPendientes,
    setReservasPendientes,
  ] = useState(0);

  const gpsDebeEstarActivo = estado !== "desconectado";

  useEffect(() => {
    let cancelado = false;

    const actualizarBackgroundGps =
      async () => {
        try {
          if (!token) {
            return;
          }

          if (
            estado ===
            "desconectado"
          ) {
            console.log(
              "🛑 Estado desconectado: detenemos GPS background"
            );

            await stopBackgroundLocationUpdates();

            return;
          }

          console.log(
            "🟢 Estado activo:",
            estado,
            "-> comprobando GPS background"
          );

          const iniciado =
            await startBackgroundLocationUpdates();

          if (cancelado) {
            return;
          }

          console.log(
            "📍 Resultado startBackgroundLocationUpdates:",
            iniciado
          );
        } catch (error) {
          console.log(
            "❌ Error controlando GPS background:",
            error?.message || error
          );
        }
      };

    actualizarBackgroundGps();

    return () => {
      cancelado = true;
    };
  }, [
    estado,
    token,
  ]);

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

  const cargarMisReservas =
    useCallback(async () => {

      if (!token) {
        return;
      }

      try {

        const response =
          await fetch(
            `${API_BASE_URL}/mobile/reservas/mias`,
            {
              headers: {
                Accept:
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },
            }
          );


        const data =
          await response.json();


        if (!response.ok) {
          throw new Error(
            data?.error ||
            "Error cargando mis reservas"
          );
        }


        const lista =
          Array.isArray(
            data?.reservas
          )
            ? data.reservas
            : [];


        const ordenadas =
          [...lista].sort(
            (
              a,
              b
            ) =>
              new Date(
                a.fechaHora
              ).getTime() -
              new Date(
                b.fechaHora
              ).getTime()
          );


        setTotalReservasMias(
          ordenadas.length
        );


        setProximaReserva(
          ordenadas[0] ||
          null
        );


      } catch (error) {

        console.log(
          "Error cargando mis reservas:",
          error.message
        );

      }

    }, [
      token,
      API_BASE_URL,
    ]);

  const cargarReservasPendientes =
    useCallback(async () => {

      if (!token) {
        return;
      }

      try {

        const response =
          await fetch(
            `${API_BASE_URL}/mobile/reservas/disponibles`,
            {
              headers: {
                Accept:
                  "application/json",

                Authorization:
                  `Bearer ${token}`,
              },
            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          throw new Error(
            data?.error ||
            "Error cargando reservas"
          );

        }


        setReservasPendientes(
          Array.isArray(
            data?.reservas
          )
            ? data.reservas.length
            : 0
        );


      } catch (error) {

        console.log(
          "Error reservas pendientes:",
          error.message
        );

      }

    }, [
      token,
      API_BASE_URL,
    ]);

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

    cargarMisReservas();


    const interval =
      setInterval(
        cargarMisReservas,
        15000
      );


    return () =>
      clearInterval(
        interval
      );

  }, [
    cargarMisReservas,
  ]);

  useEffect(() => {

    cargarReservasPendientes();


    const interval =
      setInterval(
        cargarReservasPendientes,
        15000
      );


    return () =>
      clearInterval(
        interval
      );

  }, [
    cargarReservasPendientes,
  ]);

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

    const onReservaNueva = () => {
      cargarReservasPendientes();
      cargarMisReservas();
    };

    const onReservaAceptada = () => {
      cargarReservasPendientes();
      cargarMisReservas();
    };

    const onReservaCancelada = (data) => {
      cargarReservasPendientes();
      cargarMisReservas();

      Alert.alert(
        "Reserva cancelada",
        data?.direccionRecogida
          ? `El cliente ha cancelado la reserva de ${data.direccionRecogida}.`
          : "El cliente ha cancelado una reserva que tenías aceptada."
      );
    };


    socket.on(
      "reserva:nueva",
      onReservaNueva
    );

    socket.on(
      "reserva:aceptada",
      onReservaAceptada
    );

    socket.on(
      "reserva:cancelada",
      onReservaCancelada
    );


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
      socket.off(
        "reserva:nueva"
      );

      socket.off(
        "reserva:aceptada"
      );
      socket.off(
        "reserva:cancelada",
        onReservaCancelada
      );
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

  const confirmarClienteRecogido = () => {

    if (
      !servicioActivo?.solicitudId
    ) {
      return;
    }


    Alert.alert(
      "Cliente recogido",
      "¿Confirmas que el cliente ya está dentro del taxi?",
      [
        {
          text:
            "Cancelar",

          style:
            "cancel",
        },

        {
          text:
            "Sí, iniciar trayecto",

          onPress: () => {

            socket.emit(
              "servicio:cliente_recogido",
              {
                solicitudId:
                  servicioActivo.solicitudId,
              },
              (respuesta) => {

                if (
                  !respuesta?.ok
                ) {

                  Alert.alert(
                    "Error",
                    respuesta?.error ||
                    "No se pudo iniciar el trayecto."
                  );

                  return;
                }


                /*
                 * Actualizamos inmediatamente
                 * la tarjeta local.
                 */
                const actualizado = {

                  ...servicioActivo,

                  recogidaIniciadaEn:
                    respuesta
                      .recogidaIniciadaEn,

                };


                servicioActivoRef.current =
                  actualizado;


                setServicioActivo(
                  actualizado
                );

              }
            );

          },
        },
      ]
    );

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

  if (
    mostrarReservas
  ) {

    return (

      <ReservasTaxistaScreen
        pestañaInicial={
          pestañaReservasInicial
        }
        onClose={() => {
          setMostrarReservas(false);

          cargarReservasPendientes();
          cargarMisReservas();
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

    <SafeAreaView
      style={styles.appShell}
      edges={["bottom"]}
    >

      <ScrollView

        contentContainerStyle={[
          styles.scrollContent,

          {
            paddingBottom:
              Math.max(
                espacioInferior,
                18
              ),
          },
        ]}

        showsVerticalScrollIndicator={
          false
        }

        bounces={
          !servicioActivo
        }

      >

        <View
          style={[
            styles.appCard,

            servicioActivo &&
            styles.appCardServicioActivo,
          ]}
        >

          {/* =================================================
            CABECERA COMPACTA
        ================================================= */}

          <View
            style={
              styles.topRow
            }
          >

            <View
              style={
                styles.headerMain
              }
            >

              <Text
                style={
                  styles.eyebrow
                }
              >
                Panel del taxista
              </Text>


              <Text
                style={
                  styles.appTitle
                }
              >

                {numeroTaxi
                  ? `Taxi ${numeroTaxi}`
                  : "App Taxista"}

              </Text>

            </View>


            <View
              style={
                styles.onlineBadge
              }
            >

              <Text
                style={
                  styles.onlineLabel
                }
              >
                Disponibles
              </Text>


              <Text
                style={
                  styles.onlineValue
                }
              >

                {taxisDisponibles !== null
                  ? taxisDisponibles
                  : "..."}

              </Text>

            </View>

          </View>


          {/* =================================================
            ESTADO OPERATIVO
        ================================================= */}

          <View
            style={
              styles.infoOperativa
            }
          >

            {servicioActivo ? (

              <View
                style={[
                  styles.infoPill,
                  styles.infoServicio,
                ]}
              >

                <Ionicons
                  name="car-sport-outline"
                  size={14}
                  color="#92400e"
                />

                <Text
                  style={
                    styles.infoPillText
                  }
                >
                  En servicio
                </Text>

              </View>

            ) : paradaActual ? (

              <View
                style={
                  styles.estadoParadaRow
                }
              >

                <View
                  style={[
                    styles.infoPill,
                    styles.infoParada,
                  ]}
                >

                  <Ionicons
                    name="car-outline"
                    size={14}
                    color="#1d4ed8"
                  />

                  <Text
                    style={
                      styles.infoPillText
                    }
                    numberOfLines={1}
                  >
                    {paradaActual.nombre}
                  </Text>

                </View>


                <Text
                  style={
                    styles.infoExtraInline
                  }
                  numberOfLines={1}
                >

                  {posicionEnParada
                    ? `Cola: ${posicionEnParada}`
                    : "Calculando cola..."}

                </Text>

              </View>

            ) : estado ===
              "disponible" ? (

              <View
                style={[
                  styles.infoPill,
                  styles.infoDisponible,
                ]}
              >

                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color="#166534"
                />

                <Text
                  style={
                    styles.infoPillText
                  }
                >
                  Disponible
                </Text>

              </View>

            ) : (

              <View
                style={[
                  styles.infoPill,
                  styles.infoDesconectado,
                ]}
              >

                <Ionicons
                  name="power-outline"
                  size={14}
                  color="#475569"
                />

                <Text
                  style={
                    styles.infoPillText
                  }
                >
                  Desconectado
                </Text>

              </View>

            )}

          </View>


          {!!accionPendiente && (

            <Text
              style={
                styles.infoExtra
              }
            >
              {accionPendiente}
            </Text>

          )}


          {/* =================================================
            ENTRANDO EN PARADA
        ================================================= */}

          {!servicioActivo &&
            paradaEntrando?.parada && (

              <View
                style={
                  styles.noticeCard
                }
              >

                <View
                  style={{
                    flex: 1,
                  }}
                >

                  <Text
                    style={
                      styles.noticeTitle
                    }
                  >
                    Entrando en parada
                  </Text>


                  <Text
                    style={
                      styles.noticeText
                    }
                    numberOfLines={1}
                  >
                    {paradaEntrando.parada.nombre}
                  </Text>

                </View>


                <Text
                  style={
                    styles.noticeCountdown
                  }
                >
                  {segundosEntradaParada}s
                </Text>

              </View>

            )}


          {!servicioActivo &&
            paradaSaliendo && (

              <View
                style={
                  styles.noticeCard
                }
              >

                <View
                  style={{
                    flex: 1,
                  }}
                >

                  <Text
                    style={
                      styles.noticeTitle
                    }
                  >
                    Movimiento detectado
                  </Text>

                  <Text
                    style={
                      styles.noticeText
                    }
                  >
                    Saliendo de la parada
                  </Text>

                </View>

              </View>

            )}


          {!!gpsError &&
            !gpsInicializando && (

              <Text
                style={
                  styles.errorText
                }
              >
                {gpsError}
              </Text>

            )}


          {/* =================================================
            DISPONIBLE / DESCONECTADO
        ================================================= */}

          {!servicioActivo && (

            <View
              style={
                styles.actionsRow
              }
            >

              <TouchableOpacity

                style={[
                  styles.stateButton,

                  estado ===
                  "disponible" &&
                  styles.stateButtonActive,

                  cambiandoEstado &&
                  styles.stateButtonDisabled,
                ]}

                onPress={() =>
                  cambiarEstado(
                    "disponible"
                  )
                }

                activeOpacity={0.85}

                disabled={
                  cambiandoEstado
                }

              >

                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={
                    estado ===
                      "disponible"
                      ? "#2563eb"
                      : "#0f172a"
                  }
                />


                <View
                  style={{
                    flex: 1,
                  }}
                >

                  <Text

                    style={[
                      styles.stateButtonTitle,

                      estado ===
                      "disponible" &&
                      styles.stateButtonTitleActive,
                    ]}

                  >
                    Disponible
                  </Text>


                  <Text
                    style={
                      styles.stateButtonText
                    }
                  >
                    Recibir servicios
                  </Text>

                </View>

              </TouchableOpacity>


              <TouchableOpacity

                style={[
                  styles.stateButton,

                  estado ===
                  "desconectado" &&
                  styles.stateButtonActive,

                  cambiandoEstado &&
                  styles.stateButtonDisabled,
                ]}

                onPress={() =>
                  cambiarEstado(
                    "desconectado"
                  )
                }

                activeOpacity={0.85}

                disabled={
                  cambiandoEstado
                }

              >

                <Ionicons
                  name="power-outline"
                  size={20}
                  color={
                    estado ===
                      "desconectado"
                      ? "#2563eb"
                      : "#0f172a"
                  }
                />


                <View
                  style={{
                    flex: 1,
                  }}
                >

                  <Text

                    style={[
                      styles.stateButtonTitle,

                      estado ===
                      "desconectado" &&
                      styles.stateButtonTitleActive,
                    ]}

                  >
                    Desconectado
                  </Text>


                  <Text
                    style={
                      styles.stateButtonText
                    }
                  >
                    No recibir
                  </Text>

                </View>

              </TouchableOpacity>

            </View>

          )}


          {/* =================================================
            SERVICIO ACTIVO
        ================================================= */}

          {servicioActivo && (

            <View
              style={
                styles.tarjetaServicio
              }
            >

              <View
                style={
                  styles.tarjetaServicioHeader
                }
              >

                <Text
                  style={
                    styles.tarjetaServicioTitle
                  }
                >
                  Servicio activo
                </Text>


                <View
                  style={
                    styles.tarjetaServicioBadge
                  }
                >

                  <Text
                    style={
                      styles.tarjetaServicioBadgeText
                    }
                  >
                    En curso
                  </Text>

                </View>

              </View>


              {/* TELÉFONO */}

              <View
                style={
                  styles.servicioItemRow
                }
              >

                <Ionicons
                  name="call-outline"
                  size={17}
                  color="#64748b"
                />


                <Text
                  style={
                    styles.servicioLabelInline
                  }
                >
                  Teléfono
                </Text>


                <Text
                  style={
                    styles.servicioValueInline
                  }
                  numberOfLines={1}
                >
                  {servicioActivo.telefonoCliente ||
                    "-"}
                </Text>

              </View>


              {/* RECOGIDA */}

              <View
                style={
                  styles.servicioItemRow
                }
              >

                <Ionicons
                  name="location-outline"
                  size={17}
                  color="#64748b"
                />


                <Text
                  style={
                    styles.servicioLabelInline
                  }
                >
                  Recogida
                </Text>


                <Text
                  style={
                    styles.servicioValueInline
                  }
                  numberOfLines={2}
                >

                  {servicioActivo.direccionBase ||
                    servicioActivo.direccionRecogida ||
                    "-"}

                </Text>

              </View>


              {/* REFERENCIA */}

              {!!servicioActivo.referenciaRecogida && (

                <View
                  style={
                    styles.servicioItemRow
                  }
                >

                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color="#64748b"
                  />


                  <Text
                    style={
                      styles.servicioLabelInline
                    }
                  >
                    Referencia
                  </Text>


                  <Text
                    style={
                      styles.servicioValueInline
                    }
                    numberOfLines={2}
                  >
                    {servicioActivo.referenciaRecogida}
                  </Text>

                </View>

              )}


              {/* =================================================
                LLAMADA
                SOLO SERVICIO POR TELÉFONO
            ================================================= */}

              {servicioActivo?.callId && (

                <TouchableOpacity

                  style={
                    styles.llamadaButton
                  }

                  onPress={
                    escucharLlamadaCliente
                  }

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

                    size={22}

                    color="#2563eb"

                  />


                  <Text
                    style={
                      styles.llamadaButtonTitle
                    }
                  >

                    {estadoLlamadaPlayer.playing
                      ? "Pausar llamada"

                      : llamadaTerminada
                        ? "Volver a escuchar"

                        : estadoLlamadaPlayer.isLoaded
                          ? "Continuar llamada"

                          : "Escuchar llamada"}

                  </Text>

                </TouchableOpacity>

              )}


              {/* =================================================
                MENSAJES
                SOLO SERVICIO DESDE APP
            ================================================= */}

              {!servicioActivo?.callId && (

                <TouchableOpacity

                  style={
                    styles.chatButton
                  }

                  onPress={() => {

                    setMensajesNoLeidos(
                      0
                    );

                    setMostrarChatServicio(
                      true
                    );

                  }}

                  activeOpacity={0.85}

                >

                  <View
                    style={
                      styles.chatIconWrap
                    }
                  >

                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={18}
                      color="#111827"
                    />


                    {mensajesNoLeidos >
                      0 && (

                        <View
                          style={
                            styles.chatBadge
                          }
                        >

                          <Text
                            style={
                              styles.chatBadgeText
                            }
                          >

                            {mensajesNoLeidos >
                              9
                              ? "9+"
                              : mensajesNoLeidos}

                          </Text>

                        </View>

                      )}

                  </View>


                  <Text
                    style={
                      styles.chatButtonText
                    }
                  >
                    Mensajes
                  </Text>


                  {mensajesNoLeidos >
                    0 && (

                      <View
                        style={
                          styles.messageDot
                        }
                      />

                    )}

                </TouchableOpacity>

              )}


              {/* =================================================
                ACCIONES SERVICIO
            ================================================= */}

              <View style={styles.servicioActionsRow}>

                {!servicioActivo?.recogidaIniciadaEn ? (

                  <View style={styles.recogidaActionsRow}>

                    <TouchableOpacity
                      style={styles.clienteRecogidoButton}
                      onPress={confirmarClienteRecogido}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="person-circle-outline"
                        size={20}
                        color="#ffffff"
                      />

                      <Text style={styles.clienteRecogidoText}>
                        Cliente recogido
                      </Text>
                    </TouchableOpacity>


                    <TouchableOpacity
                      style={styles.clienteNoLocalizadoButton}
                      onPress={clienteNoLocalizado}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name="person-remove-outline"
                        size={20}
                        color="#b91c1c"
                      />

                      <Text style={styles.clienteNoLocalizadoText}>
                        No localizado
                      </Text>
                    </TouchableOpacity>

                  </View>

                ) : (

                  <TouchableOpacity
                    style={styles.finishButton}
                    onPress={abrirCerrarServicio}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="checkmark-done-outline"
                      size={18}
                      color="#ffffff"
                    />

                    <Text style={styles.finishButtonText}>
                      Finalizar servicio
                    </Text>
                  </TouchableOpacity>

                )}

              </View>

            </View>

          )}

        </View>

        {/* =================================================
          RESERVAS
      ================================================= */}

        <TouchableOpacity

          style={
            styles.reservasButton
          }

          onPress={() => {
            setPestañaReservasInicial(
              "disponibles"
            );

            setMostrarReservas(
              true
            );
          }}

          activeOpacity={0.85}

        >

          <View
            style={
              styles.reservasIconWrap
            }
          >

            <Ionicons
              name="calendar-outline"
              size={19}
              color="#111827"
            />


            {reservasPendientes >
              0 && (

                <View
                  style={
                    styles.reservasDot
                  }
                />

              )}

          </View>


          <View
            style={{
              flex: 1,
            }}
          >

            <Text
              style={
                styles.reservasButtonTitle
              }
            >
              Reservas
            </Text>


            <Text
              style={
                styles.reservasButtonSubtitle
              }
              numberOfLines={1}
            >

              {reservasPendientes >
                0
                ? `${reservasPendientes} disponible${reservasPendientes ===
                  1
                  ? ""
                  : "s"
                }`
                : "No hay reservas disponibles"}

            </Text>

          </View>


          <Ionicons
            name="chevron-forward"
            size={18}
            color="#94a3b8"
          />

        </TouchableOpacity>

        {proximaReserva && (

          <TouchableOpacity

            style={
              styles.proximaReservaCard
            }

            onPress={() => {
              setPestañaReservasInicial(
                "mias"
              );

              setMostrarReservas(
                true
              );
            }}

            activeOpacity={0.85}

          >

            <View
              style={
                styles.proximaReservaIcon
              }
            >

              <Ionicons
                name="calendar-outline"
                size={19}
                color="#111827"
              />

            </View>


            <View
              style={{
                flex: 1,
              }}
            >

              <View
                style={
                  styles.proximaReservaTop
                }
              >

                <Text
                  style={
                    styles.proximaReservaLabel
                  }
                >
                  Próxima reserva
                </Text>


                <Text
                  style={
                    styles.proximaReservaHora
                  }
                >
                  {formatearHoraReserva(
                    proximaReserva.fechaHora
                  )}
                </Text>

              </View>


              <Text
                style={
                  styles.proximaReservaFecha
                }
              >
                {formatearFechaReserva(
                  proximaReserva.fechaHora
                )}
              </Text>


              <Text
                style={
                  styles.proximaReservaDireccion
                }
                numberOfLines={1}
              >
                {proximaReserva.direccionBase ||
                  proximaReserva.direccionRecogida ||
                  "-"}
              </Text>


              <View
                style={
                  styles.proximaReservaBottom
                }
              >

                {proximaReserva.precioFinal != null && (

                  <Text
                    style={
                      styles.proximaReservaPrecio
                    }
                  >
                    {proximaReserva.precioFinal} €
                  </Text>

                )}


                {totalReservasMias > 1 && (

                  <Text
                    style={
                      styles.proximaReservaMas
                    }
                  >
                    +{totalReservasMias - 1} más
                  </Text>

                )}

              </View>

            </View>


            <Ionicons
              name="chevron-forward"
              size={18}
              color="#94a3b8"
            />

          </TouchableOpacity>

        )}

      </ScrollView>


      {/* =================================================
        MODAL FINALIZAR
    ================================================= */}

      <Modal

        visible={
          mostrarCerrarServicio
        }

        transparent

        animationType="fade"

        statusBarTranslucent

      >

        <View
          style={
            styles.modalOverlay
          }
        >

          <View
            style={
              styles.modalCard
            }
          >

            <Text
              style={
                styles.modalTitle
              }
            >
              Finalizar servicio
            </Text>


            <Text
              style={
                styles.modalSubtitle
              }
            >
              Introduce el coste final antes de cerrar el viaje.
            </Text>


            <TextInput

              style={
                styles.modalInput
              }

              placeholder="Ej. 8.50"

              keyboardType="decimal-pad"

              value={
                costoFinalInput
              }

              onChangeText={
                setCostoFinalInput
              }

            />


            <View
              style={
                styles.modalActions
              }
            >

              <TouchableOpacity

                style={
                  styles.modalSecondaryButton
                }

                onPress={() => {

                  if (
                    guardandoCierre
                  ) {
                    return;
                  }

                  setMostrarCerrarServicio(
                    false
                  );

                  setCostoFinalInput(
                    ""
                  );

                }}

              >

                <Text
                  style={
                    styles.modalSecondaryText
                  }
                >
                  Cancelar
                </Text>

              </TouchableOpacity>


              <TouchableOpacity

                style={[
                  styles.modalPrimaryButton,

                  guardandoCierre && {
                    opacity: 0.7,
                  },
                ]}

                onPress={
                  confirmarCerrarServicio
                }

                disabled={
                  guardandoCierre
                }

              >

                <Text
                  style={
                    styles.modalPrimaryText
                  }
                >

                  {guardandoCierre
                    ? "Guardando..."
                    : "Finalizar"}

                </Text>

              </TouchableOpacity>

            </View>

          </View>

        </View>

      </Modal>

    </SafeAreaView>

  );

}

function formatearFechaReserva(
  valor
) {

  return new Date(
    valor
  ).toLocaleDateString(
    "es-ES",
    {
      weekday:
        "short",

      day:
        "numeric",

      month:
        "short",
    }
  );

}


function formatearHoraReserva(
  valor
) {

  return new Date(
    valor
  ).toLocaleTimeString(
    "es-ES",
    {
      hour:
        "2-digit",

      minute:
        "2-digit",

      hour12:
        false,
    }
  );

}


/* =====================================================
   STYLES
===================================================== */

const styles =
  StyleSheet.create({

    appShell: {
      flex: 1,
      backgroundColor: "#f8fafc",
    },


    scrollContent: {
      paddingHorizontal: 10,
      paddingTop: 8,
      flexGrow: 1,
    },


    appCard: {
      width: "100%",

      backgroundColor: "#ffffff",

      borderRadius: 18,

      padding: 12,

      borderWidth: 1,
      borderColor: "#e5e7eb",

      shadowColor: "#0f172a",

      shadowOpacity: 0.05,

      shadowOffset: {
        width: 0,
        height: 6,
      },

      shadowRadius: 12,

      elevation: 3,
    },


    appCardServicioActivo: {
      padding: 10,
    },


    topRow: {
      flexDirection: "row",

      justifyContent: "space-between",

      alignItems: "center",

      gap: 8,

      marginBottom: 6,
    },


    headerMain: {
      flex: 1,

      justifyContent: "center",
    },


    eyebrow: {
      fontSize: 10,

      fontWeight: "700",

      color: "#64748b",

      marginBottom: 1,

      textTransform: "uppercase",
    },


    appTitle: {
      fontSize: 23,

      lineHeight: 26,

      fontWeight: "900",

      color: "#0f172a",
    },


    onlineBadge: {
      minWidth: 82,

      paddingVertical: 5,

      paddingHorizontal: 9,

      borderRadius: 12,

      backgroundColor: "#eff6ff",

      borderWidth: 1,

      borderColor: "#bfdbfe",

      alignItems: "center",

      justifyContent: "center",
    },


    onlineLabel: {
      fontSize: 9,

      fontWeight: "700",

      color: "#64748b",
    },


    onlineValue: {
      marginTop: 1,

      fontSize: 18,

      lineHeight: 20,

      fontWeight: "900",

      color: "#2563eb",
    },


    infoOperativa: {
      marginBottom: 3,
    },


    estadoParadaRow: {
      flexDirection: "row",

      alignItems: "center",

      gap: 8,
    },


    infoPill: {
      alignSelf: "flex-start",

      paddingVertical: 5,

      paddingHorizontal: 9,

      borderRadius: 999,

      flexDirection: "row",

      alignItems: "center",

      gap: 5,
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
      fontSize: 11,

      fontWeight: "800",

      color: "#0f172a",
    },


    infoExtraInline: {
      flex: 1,

      fontSize: 11,

      color: "#64748b",

      fontWeight: "600",
    },


    infoExtra: {
      marginTop: 4,

      fontSize: 11,

      color: "#64748b",

      lineHeight: 15,
    },


    noticeCard: {
      marginTop: 7,

      backgroundColor: "#f8fafc",

      borderRadius: 12,

      paddingVertical: 8,

      paddingHorizontal: 10,

      borderWidth: 1,

      borderColor: "#e2e8f0",

      flexDirection: "row",

      alignItems: "center",

      gap: 8,
    },


    noticeTitle: {
      fontSize: 11,

      fontWeight: "800",

      color: "#0f172a",
    },


    noticeText: {
      marginTop: 1,

      fontSize: 12,

      fontWeight: "700",

      color: "#0f172a",
    },


    noticeCountdown: {
      fontSize: 17,

      fontWeight: "900",

      color: "#2563eb",
    },


    errorText: {
      marginTop: 5,

      color: "#dc2626",

      fontSize: 11,

      fontWeight: "600",
    },


    /* =================================================
       BOTONES ESTADO
    ================================================= */

    actionsRow: {
      flexDirection: "row",

      gap: 8,

      marginTop: 8,
    },


    stateButton: {
      flex: 1,

      minHeight: 58,

      backgroundColor: "#ffffff",

      borderRadius: 14,

      borderWidth: 1,

      borderColor: "#e2e8f0",

      paddingHorizontal: 10,

      paddingVertical: 8,

      flexDirection: "row",

      alignItems: "center",

      gap: 8,
    },


    stateButtonActive: {
      backgroundColor: "#eff6ff",

      borderColor: "#93c5fd",
    },


    stateButtonDisabled: {
      opacity: 0.5,
    },


    stateButtonTitle: {
      fontSize: 13,

      fontWeight: "800",

      color: "#0f172a",
    },


    stateButtonTitleActive: {
      color: "#2563eb",
    },


    stateButtonText: {
      marginTop: 1,

      fontSize: 10,

      color: "#64748b",
    },


    /* =================================================
       SERVICIO ACTIVO
    ================================================= */

    tarjetaServicio: {
      marginTop: 7,

      padding: 10,

      borderRadius: 15,

      backgroundColor: "#f8fafc",

      borderWidth: 1,

      borderColor: "#e2e8f0",
    },


    tarjetaServicioHeader: {
      flexDirection: "row",

      justifyContent: "space-between",

      alignItems: "center",

      marginBottom: 7,

      gap: 8,
    },


    tarjetaServicioTitle: {
      fontSize: 16,

      fontWeight: "900",

      color: "#0f172a",
    },


    tarjetaServicioBadge: {
      backgroundColor: "#dcfce7",

      paddingVertical: 4,

      paddingHorizontal: 8,

      borderRadius: 999,
    },


    tarjetaServicioBadgeText: {
      color: "#166534",

      fontWeight: "800",

      fontSize: 10,
    },


    servicioItemRow: {
      minHeight: 31,

      paddingVertical: 4,

      borderTopWidth: 1,

      borderTopColor: "#e2e8f0",

      flexDirection: "row",

      alignItems: "center",

      gap: 6,
    },


    servicioLabelInline: {
      width: 64,

      fontSize: 9,

      fontWeight: "800",

      color: "#64748b",

      textTransform: "uppercase",
    },


    servicioValueInline: {
      flex: 1,

      fontSize: 12,

      lineHeight: 16,

      fontWeight: "700",

      color: "#0f172a",
    },


    /* =================================================
       AUDIO
    ================================================= */

    llamadaButton: {
      minHeight: 39,

      marginTop: 7,

      paddingHorizontal: 10,

      borderRadius: 12,

      backgroundColor: "#eff6ff",

      borderWidth: 1,

      borderColor: "#bfdbfe",

      flexDirection: "row",

      alignItems: "center",

      justifyContent: "center",

      gap: 7,
    },


    llamadaButtonTitle: {
      fontSize: 12,

      fontWeight: "800",

      color: "#1e3a8a",
    },


    /* =================================================
       CHAT
    ================================================= */

    chatButton: {
      marginTop: 7,

      minHeight: 39,

      borderRadius: 12,

      backgroundColor: "#ffffff",

      borderWidth: 1,

      borderColor: "#e2e8f0",

      flexDirection: "row",

      alignItems: "center",

      justifyContent: "center",

      gap: 7,
    },


    chatButtonText: {
      fontSize: 12,

      fontWeight: "800",

      color: "#111827",
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

      minWidth: 17,

      height: 17,

      borderRadius: 9,

      backgroundColor: "#ef4444",

      alignItems: "center",

      justifyContent: "center",

      paddingHorizontal: 4,
    },


    chatBadgeText: {
      color: "#ffffff",

      fontSize: 9,

      fontWeight: "800",
    },


    messageDot: {
      width: 7,

      height: 7,

      borderRadius: 4,

      backgroundColor: "#ef4444",
    },


    /* =================================================
       BOTONES SERVICIO
    ================================================= */

    servicioActionsRow: {
      marginTop: 7,
      flexDirection: "column",
      gap: 7,
    },


    clienteRecogidoButton: {
      flex: 1,
      height: 48,
      borderRadius: 14,

      backgroundColor: "#111827",

      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",

      gap: 7,
      paddingHorizontal: 10,
    },

    clienteRecogidoText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
    },

    clienteNoLocalizadoButton: {
      flex: 1,
      height: 48,
      borderRadius: 14,

      backgroundColor: "#fff1f2",

      borderWidth: 1,
      borderColor: "#fecdd3",

      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",

      gap: 7,
      paddingHorizontal: 10,
    },

    clienteNoLocalizadoText: {
      color: "#b91c1c",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
    },


    finishButton: {
      width: "100%",
      minHeight: 39,

      borderRadius: 12,

      backgroundColor: "#16a34a",

      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",

      gap: 7,
    },

    finishButtonText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },


    /* =================================================
       RESERVAS
    ================================================= */

    reservasButton: {
      marginTop: 8,

      minHeight: 50,

      paddingHorizontal: 11,

      borderRadius: 14,

      backgroundColor: "#fff",

      borderWidth: 1,

      borderColor: "#e2e8f0",

      flexDirection: "row",

      alignItems: "center",

      gap: 9,
    },


    reservasIconWrap: {
      width: 34,

      height: 34,

      borderRadius: 17,

      backgroundColor: "#f1f5f9",

      alignItems: "center",

      justifyContent: "center",

      position: "relative",
    },


    reservasDot: {
      position: "absolute",

      top: 0,

      right: 0,

      width: 9,

      height: 9,

      borderRadius: 5,

      backgroundColor: "#ef4444",

      borderWidth: 2,

      borderColor: "#fff",
    },


    reservasButtonTitle: {
      fontSize: 13,

      fontWeight: "800",

      color: "#111827",
    },


    reservasButtonSubtitle: {
      marginTop: 1,

      fontSize: 10,

      color: "#64748b",
    },


    /* =================================================
       MODAL
    ================================================= */

    modalOverlay: {
      flex: 1,

      backgroundColor:
        "rgba(15, 23, 42, 0.45)",

      justifyContent: "center",

      alignItems: "center",

      padding: 20,
    },


    modalCard: {
      width: "100%",

      maxWidth: 420,

      backgroundColor: "#ffffff",

      borderRadius: 20,

      padding: 18,
    },


    modalTitle: {
      fontSize: 20,

      fontWeight: "800",

      color: "#0f172a",
    },


    modalSubtitle: {
      marginTop: 6,

      fontSize: 13,

      lineHeight: 18,

      color: "#64748b",
    },


    modalInput: {
      marginTop: 14,

      height: 48,

      borderRadius: 14,

      borderWidth: 1,

      borderColor: "#cbd5e1",

      paddingHorizontal: 13,

      fontSize: 15,

      color: "#0f172a",

      backgroundColor: "#f8fafc",
    },


    modalActions: {
      flexDirection: "row",

      gap: 10,

      marginTop: 15,
    },


    modalSecondaryButton: {
      flex: 1,

      height: 44,

      borderRadius: 14,

      borderWidth: 1,

      borderColor: "#cbd5e1",

      alignItems: "center",

      justifyContent: "center",
    },


    modalSecondaryText: {
      fontSize: 14,

      fontWeight: "700",

      color: "#0f172a",
    },


    modalPrimaryButton: {
      flex: 1,

      height: 44,

      borderRadius: 14,

      backgroundColor: "#111827",

      alignItems: "center",

      justifyContent: "center",
    },


    modalPrimaryText: {
      fontSize: 14,

      fontWeight: "700",

      color: "#ffffff",
    },

    proximaReservaCard: {
      marginTop: 8,

      minHeight: 72,

      paddingHorizontal: 11,
      paddingVertical: 9,

      borderRadius: 14,

      backgroundColor: "#fff7ed",

      borderWidth: 1,
      borderColor: "#fed7aa",

      flexDirection: "row",

      alignItems: "center",

      gap: 9,
    },

    proximaReservaIcon: {
      width: 36,
      height: 36,

      borderRadius: 18,

      backgroundColor: "#ffedd5",

      alignItems: "center",
      justifyContent: "center",
    },

    proximaReservaTop: {
      flexDirection: "row",

      justifyContent: "space-between",

      alignItems: "center",

      gap: 8,
    },

    proximaReservaLabel: {
      fontSize: 11,

      fontWeight: "800",

      color: "#9a3412",

      textTransform: "uppercase",
    },

    proximaReservaHora: {
      fontSize: 14,

      fontWeight: "900",

      color: "#111827",
    },

    proximaReservaFecha: {
      marginTop: 1,

      fontSize: 11,

      fontWeight: "700",

      color: "#64748b",

      textTransform: "capitalize",
    },

    proximaReservaDireccion: {
      marginTop: 2,

      fontSize: 13,

      fontWeight: "800",

      color: "#111827",
    },

    proximaReservaBottom: {
      marginTop: 3,

      flexDirection: "row",

      alignItems: "center",

      gap: 8,
    },

    proximaReservaPrecio: {
      fontSize: 12,

      fontWeight: "800",

      color: "#166534",
    },

    proximaReservaMas: {
      fontSize: 11,

      fontWeight: "700",

      color: "#64748b",
    },


    trayectoActivoBox: {

      marginTop:
        12,

      minHeight:
        58,

      borderRadius:
        16,

      backgroundColor:
        "#f0fdf4",

      borderWidth:
        1,

      borderColor:
        "#bbf7d0",

      flexDirection:
        "row",

      alignItems:
        "center",

      gap:
        10,

      paddingHorizontal:
        14,

      paddingVertical:
        10,

    },

    trayectoActivoTitle: {

      color:
        "#166534",

      fontSize:
        14,

      fontWeight:
        "800",

    },

    trayectoActivoSubtitle: {

      marginTop:
        2,

      color:
        "#4b5563",

      fontSize:
        12,

      fontWeight:
        "600",

    },
    recogidaActionsRow: {
      flexDirection: "row",
      gap: 7,
      width: "100%",
    },

  });