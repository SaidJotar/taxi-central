import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";

export default function useTaxiLocation({
  socket,
  activo,
  onGpsPerdido,
}) {
  const [gpsActivo, setGpsActivo] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsInicializando, setGpsInicializando] =
    useState(false);

  const ultimaUbicacionRef = useRef(null);
  const subscriptionRef = useRef(null);
  const iniciandoRef = useRef(false);

  /*
   * Guardamos el estado actual de la app.
   *
   * active      = primer plano
   * background  = segundo plano
   * inactive    = transición
   */
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription =
      AppState.addEventListener(
        "change",
        (nextState) => {
          appStateRef.current =
            nextState;
        }
      );

    return () => {
      subscription.remove();
    };
  }, []);

  /*
   * =====================================================
   * ENVIAR UBICACIÓN POR SOCKET
   * =====================================================
   *
   * Socket.IO lo usamos solamente cuando
   * la app está activa.
   *
   * En background ya tenemos:
   *
   * backgroundLocation.js
   *          ↓
   * POST /mobile/ubicacion-background
   */

  const enviarUbicacionSocket =
    useCallback(
      (lat, lng) => {
        if (
          appStateRef.current !==
          "active"
        ) {
          return;
        }

        if (!socket?.connected) {
          return;
        }

        socket.emit(
          "taxista:ubicacion",
          {
            lat,
            lng,
          }
        );
      },
      [socket]
    );

  /*
   * =====================================================
   * REFRESCAR UBICACIÓN MANUALMENTE
   * =====================================================
   */

  const refrescarUbicacion =
    useCallback(async () => {
      try {
        const permiso =
          await Location.getForegroundPermissionsAsync();

        if (
          permiso.status !==
          "granted"
        ) {
          const nuevoPermiso =
            await Location.requestForegroundPermissionsAsync();

          if (
            nuevoPermiso.status !==
            "granted"
          ) {
            setGpsActivo(false);

            setGpsError(
              "Debes activar la ubicación para trabajar."
            );

            return null;
          }
        }

        const enabled =
          await Location.hasServicesEnabledAsync();

        if (!enabled) {
          setGpsActivo(false);

          setGpsError(
            "El GPS del dispositivo está desactivado."
          );

          return null;
        }

        /*
         * Intentamos primero la última
         * posición conocida para responder
         * inmediatamente.
         */

        const ultimaConocida =
          await Location.getLastKnownPositionAsync();

        if (
          ultimaConocida?.coords
        ) {
          const lat =
            ultimaConocida.coords.latitude;

          const lng =
            ultimaConocida.coords.longitude;

          ultimaUbicacionRef.current =
          {
            lat,
            lng,
          };

          setGpsActivo(true);
          setGpsError("");

          enviarUbicacionSocket(
            lat,
            lng
          );

          return {
            lat,
            lng,
          };
        }

        /*
         * Si Android no tiene posición
         * almacenada, solicitamos una nueva.
         */

        const posicion =
          await Location.getCurrentPositionAsync(
            {
              accuracy:
                Location.Accuracy.High,
            }
          );

        if (!posicion?.coords) {
          setGpsActivo(false);

          setGpsError(
            "No se pudo obtener la ubicación."
          );

          return null;
        }

        const lat =
          posicion.coords.latitude;

        const lng =
          posicion.coords.longitude;

        ultimaUbicacionRef.current =
        {
          lat,
          lng,
        };

        setGpsActivo(true);
        setGpsError("");

        enviarUbicacionSocket(
          lat,
          lng
        );

        return {
          lat,
          lng,
        };

      } catch (error) {
        console.log(
          "❌ Error refrescando ubicación:",
          error
        );

        setGpsActivo(false);

        setGpsError(
          "No se pudo obtener la ubicación."
        );

        return null;
      }
    }, [enviarUbicacionSocket]);

  /*
   * =====================================================
   * GPS DE PRIMER PLANO
   * =====================================================
   */

  useEffect(() => {
    let cancelled = false;

    const iniciarGps =
      async () => {
        if (!activo) {
          return;
        }

        if (!socket) {
          return;
        }

        if (
          subscriptionRef.current
        ) {
          return;
        }

        if (
          iniciandoRef.current
        ) {
          return;
        }

        iniciandoRef.current =
          true;

        setGpsInicializando(true);

        try {
          /*
           * Primero comprobamos.
           *
           * Solo pedimos permiso si
           * todavía no está concedido.
           */

          let permiso =
            await Location.getForegroundPermissionsAsync();

          if (
            permiso.status !==
            "granted"
          ) {
            permiso =
              await Location.requestForegroundPermissionsAsync();
          }

          if (
            permiso.status !==
            "granted"
          ) {
            if (cancelled) {
              return;
            }

            setGpsActivo(false);

            setGpsError(
              "Debes activar la ubicación para trabajar."
            );

            setGpsInicializando(
              false
            );

            onGpsPerdido?.();

            return;
          }

          const enabled =
            await Location.hasServicesEnabledAsync();

          if (!enabled) {
            if (cancelled) {
              return;
            }

            setGpsActivo(false);

            setGpsError(
              "El GPS del dispositivo está desactivado."
            );

            setGpsInicializando(
              false
            );

            onGpsPerdido?.();

            return;
          }

          /*
           * Marcamos GPS disponible.
           *
           * Aunque todavía estemos esperando
           * una posición nueva, sabemos que
           * servicio + permiso están activos.
           */

          if (!cancelled) {
            setGpsActivo(true);
            setGpsError("");
          }

          /*
           * Mandamos inmediatamente la última
           * ubicación conocida si existe.
           */

          const ultimaConocida =
            await Location.getLastKnownPositionAsync();

          if (
            !cancelled &&
            ultimaConocida?.coords
          ) {
            const lat =
              ultimaConocida
                .coords
                .latitude;

            const lng =
              ultimaConocida
                .coords
                .longitude;

            ultimaUbicacionRef.current =
            {
              lat,
              lng,
            };

            enviarUbicacionSocket(
              lat,
              lng
            );
          }

          /*
           * Seguimiento de primer plano.
           *
           * El seguimiento background está
           * completamente separado en
           * backgroundLocation.js.
           */

          const sub =
            await Location.watchPositionAsync(
              {
                accuracy:
                  Location.Accuracy.High,

                timeInterval:
                  5000,

                distanceInterval:
                  5,
              },

              (position) => {
                if (cancelled) {
                  return;
                }

                if (
                  !position?.coords
                ) {
                  return;
                }

                const lat =
                  position.coords
                    .latitude;

                const lng =
                  position.coords
                    .longitude;

                ultimaUbicacionRef.current =
                {
                  lat,
                  lng,
                };

                setGpsActivo(true);
                setGpsError("");

                setGpsInicializando(
                  false
                );

                enviarUbicacionSocket(
                  lat,
                  lng
                );
              }
            );

          /*
           * Puede ocurrir que el componente
           * se haya desmontado mientras
           * esperábamos watchPositionAsync.
           */

          if (cancelled) {
            sub.remove();
            return;
          }

          subscriptionRef.current =
            sub;

          setGpsInicializando(false);

        } catch (error) {
          console.log(
            "❌ Error GPS:",
            error?.message ||
            error
          );

          if (!cancelled) {
            setGpsActivo(false);

            setGpsError(
              "No se pudo obtener la ubicación."
            );

            setGpsInicializando(
              false
            );

            onGpsPerdido?.();
          }

        } finally {
          iniciandoRef.current =
            false;
        }
      };

    iniciarGps();

    return () => {
      cancelled = true;

      if (
        subscriptionRef.current
      ) {
        subscriptionRef.current.remove();

        subscriptionRef.current =
          null;
      }

      iniciandoRef.current =
        false;
    };
  }, [
    activo,
    socket,
    onGpsPerdido,
    enviarUbicacionSocket,
  ]);

  /*
   * =====================================================
   * HEARTBEAT GPS EN PRIMER PLANO
   * =====================================================
   *
   * Aunque el taxi esté parado y Android
   * no produzca una nueva posición por
   * distanceInterval, reenviamos la última
   * posición cada 10 segundos.
   *
   * Esto NO funciona ni se necesita en
   * background. Allí manda la tarea nativa.
   */

  useEffect(() => {
    if (!activo) {
      return;
    }

    const interval =
      setInterval(() => {
        if (
          appStateRef.current !==
          "active"
        ) {
          return;
        }

        const ubicacion =
          ultimaUbicacionRef.current;

        if (!ubicacion) {
          return;
        }

        enviarUbicacionSocket(
          ubicacion.lat,
          ubicacion.lng
        );
      }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [
    activo,
    enviarUbicacionSocket,
  ]);

  /*
   * =====================================================
   * ESTADO DESCONECTADO
   * =====================================================
   */

  useEffect(() => {
    if (activo) {
      return;
    }

    if (
      subscriptionRef.current
    ) {
      subscriptionRef.current.remove();

      subscriptionRef.current =
        null;
    }

    ultimaUbicacionRef.current =
      null;

    setGpsActivo(false);
    setGpsError("");
    setGpsInicializando(false);

  }, [activo]);

  return {
    gpsActivo,
    gpsError,
    gpsInicializando,

    ultimaUbicacion:
      ultimaUbicacionRef.current,

    refrescarUbicacion,
  };
}