import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
  setIsAudioActiveAsync,
} from "expo-audio";

import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { useOferta } from "../context/OfertaContext";
import OfertaModal from "./OfertaModal";

const SONIDO_OFERTA = require(
  "../../assets/sounds/notificacion.mp3"
);

export default function GlobalOfertaLayer() {
  const { token } = useAuth();

  const {
    oferta,
    setOferta,
    setServicioActivo,
  } = useOferta();

  const socket = useMemo(
    () => getSocket(token),
    [token]
  );

  const sonidoOferta = useAudioPlayer(
    SONIDO_OFERTA,
    {
      downloadFirst: true,
      updateInterval: 1000,
    }
  );

  const estadoAudio =
    useAudioPlayerStatus(sonidoOferta);

  const [audioConfigurado, setAudioConfigurado] =
    useState(false);

  /*
   * Oferta para la que se inició el sonido.
   */
  const ofertaSonandoRef = useRef(null);

  /*
   * Contador que invalida cualquier reproducción antigua.
   *
   * Cada vez que iniciamos o detenemos el sonido,
   * aumentamos este número.
   */
  const operacionAudioRef = useRef(0);

  /*
   * Indica si el componente continúa montado.
   */
  const montadoRef = useRef(true);

  /*
   * Configuración general del audio.
   */
  useEffect(() => {
    montadoRef.current = true;

    const configurarAudio = async () => {
      try {
        await setIsAudioActiveAsync(true);

        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
          interruptionMode: "doNotMix",
        });

        if (montadoRef.current) {
          setAudioConfigurado(true);
        }
      } catch (error) {
        console.log(
          "❌ Error configurando audio:",
          error?.message || error
        );
      }
    };

    configurarAudio();

    return () => {
      montadoRef.current = false;

      /*
       * Invalida cualquier play pendiente.
       */
      operacionAudioRef.current += 1;

      try {
        sonidoOferta.pause();
      } catch {
        // El reproductor puede estar liberado.
      }
    };
  }, [sonidoOferta]);

  /*
   * Detención centralizada.
   *
   * Esta función invalida cualquier reproducción pendiente
   * antes de ejecutar pause().
   */
  const detenerSonido = async () => {
    /*
     * Cancela todas las operaciones anteriores.
     */
    operacionAudioRef.current += 1;

    ofertaSonandoRef.current = null;

    try {
      sonidoOferta.pause();
      await sonidoOferta.seekTo(0);

    } catch (error) {
      console.log(
        "❌ Error deteniendo sonido:",
        error?.message || error
      );
    }
  };

  /*
   * Reproducción de la oferta.
   */
  useEffect(() => {
    const ofertaId = oferta?.ofertaId ?? null;

    /*
     * Al ejecutar este efecto se crea una nueva operación.
     */
    const numeroOperacion =
      ++operacionAudioRef.current;

    const controlarAudio = async () => {
      /*
       * No hay oferta: detener.
       */
      if (!ofertaId) {
        ofertaSonandoRef.current = null;

        try {
          sonidoOferta.pause();
          await sonidoOferta.seekTo(0);
        } catch {
          // Puede estar ya detenido.
        }

        return;
      }

      /*
       * No iniciar otra vez la misma oferta.
       */
      if (
        ofertaSonandoRef.current === ofertaId
      ) {
        return;
      }

      if (!audioConfigurado) {
        return;
      }

      if (!estadoAudio.isLoaded) {
        return;
      }

      try {
        ofertaSonandoRef.current = ofertaId;

        await setIsAudioActiveAsync(true);

        /*
         * Puede haberse aceptado la oferta durante el await.
         */
        if (
          numeroOperacion !==
          operacionAudioRef.current ||
          !montadoRef.current
        ) {
          return;
        }

        sonidoOferta.loop = true;
        sonidoOferta.volume = 1;
        sonidoOferta.muted = false;

        await sonidoOferta.seekTo(0);

        /*
         * Puede haberse aceptado la oferta durante seekTo().
         */
        if (
          numeroOperacion !==
          operacionAudioRef.current ||
          !montadoRef.current
        ) {
          return;
        }

        /*
         * Verificamos también que la oferta siga siendo
         * la misma antes de reproducir.
         */
        if (
          ofertaSonandoRef.current !== ofertaId
        ) {
          return;
        }

        sonidoOferta.play();

      } catch (error) {
        if (
          numeroOperacion ===
          operacionAudioRef.current
        ) {
          ofertaSonandoRef.current = null;
        }

      }
    };

    controlarAudio();

    /*
     * Cuando cambie la oferta o se limpie,
     * invalidamos esta reproducción.
     */
    return () => {
      if (
        numeroOperacion ===
        operacionAudioRef.current
      ) {
        operacionAudioRef.current += 1;
      }
    };
  }, [
    oferta?.ofertaId,
    audioConfigurado,
    estadoAudio.isLoaded,
    sonidoOferta,
  ]);

  /*
   * Eventos Socket.IO.
   */
  useEffect(() => {
    if (!token) return;

    const onOfertaRecibida = (data) => {
      console.log(
        "📥 oferta:recibida COMPLETA",
        JSON.stringify(data, null, 2)
      );

      setOferta((actual) => {
        if (
          actual?.ofertaId === data?.ofertaId
        ) {
          return actual;
        }

        return data;
      });
    };

    const onOfertaRechazada = async (data) => {
      console.log(
        "📥 oferta:rechazada_ok",
        data?.ofertaId
      );

      await detenerSonido();
      setOferta(null);
    };

    const onOfertaExpirada = async (data) => {
      console.log(
        "📥 oferta:expirada",
        data?.ofertaId
      );

      const esOfertaActual =
        ofertaSonandoRef.current ===
        data?.ofertaId;

      if (esOfertaActual) {
        await detenerSonido();
      }

      setOferta((actual) => {
        if (!actual) return null;

        if (
          actual.ofertaId === data?.ofertaId
        ) {
          return null;
        }

        return actual;
      });
    };

    const onOfertaCancelada = async (data) => {
      console.log(
        "📥 oferta:cancelada",
        data?.ofertaId
      );

      const esOfertaActual =
        ofertaSonandoRef.current ===
        data?.ofertaId;

      if (esOfertaActual) {
        await detenerSonido();
      }

      setOferta((actual) => {
        if (!actual) return null;

        if (
          actual.ofertaId === data?.ofertaId
        ) {
          return null;
        }

        return actual;
      });
    };

    const onOfertaAceptada = async (data) => {
      console.log(
        "📥 oferta:aceptada_ok COMPLETA",
        JSON.stringify(data, null, 2)
      );

      /*
       * Detener antes de cambiar estados.
       */
      await detenerSonido();

      setOferta(null);

      const solicitud = data?.solicitud;

      if (!solicitud) return;

      console.log(
        "📞 CALL ID RECIBIDO:",
        solicitud.callId
      );

      setServicioActivo({
        solicitudId: solicitud.id,
        nombreCliente:
          solicitud.nombreCliente,
        telefonoCliente:
          solicitud.telefonoCliente,
        direccionRecogida:
          solicitud.direccionRecogida,
        direccionBase:
          solicitud.direccionBase,
        referenciaRecogida:
          solicitud.referenciaRecogida,
        callId:
          solicitud.callId || null,
      });
    };

    socket.on(
      "oferta:recibida",
      onOfertaRecibida
    );

    socket.on(
      "oferta:rechazada_ok",
      onOfertaRechazada
    );

    socket.on(
      "oferta:expirada",
      onOfertaExpirada
    );

    socket.on(
      "oferta:cancelada",
      onOfertaCancelada
    );

    socket.on(
      "oferta:aceptada_ok",
      onOfertaAceptada
    );

    return () => {
      socket.off(
        "oferta:recibida",
        onOfertaRecibida
      );

      socket.off(
        "oferta:rechazada_ok",
        onOfertaRechazada
      );

      socket.off(
        "oferta:expirada",
        onOfertaExpirada
      );

      socket.off(
        "oferta:cancelada",
        onOfertaCancelada
      );

      socket.off(
        "oferta:aceptada_ok",
        onOfertaAceptada
      );
    };
  }, [
    socket,
    token,
    setOferta,
    setServicioActivo,
  ]);

  /*
   * Aceptar oferta.
   */
  const aceptarOferta = async (ofertaId) => {
    console.log(
      "✅ Aceptando oferta:",
      ofertaId
    );

    /*
     * Primero cancelar y detener.
     */
    await detenerSonido();

    /*
     * Después ocultar la oferta.
     */
    setOferta(null);

    socket.emit("oferta:aceptar", {
      ofertaId,
    });
  };

  /*
   * Rechazar oferta.
   */
  const rechazarOferta = async (ofertaId) => {
    console.log(
      "❌ Rechazando oferta:",
      ofertaId
    );

    await detenerSonido();

    setOferta(null);

    socket.emit("oferta:rechazar", {
      ofertaId,
    });
  };

  return (
    <OfertaModal
      visible={Boolean(oferta)}
      oferta={oferta}
      onAceptar={aceptarOferta}
      onRechazar={rechazarOferta}
    />
  );
}