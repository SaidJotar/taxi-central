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
 * COMPROBAR GPS FÍSICO EN PRIMER PLANO
 * =====================================================
 *
 * No reenviamos una ubicación antigua como heartbeat.
 *
 * Si el usuario apaga el GPS mientras la app está
 * abierta, lo detectamos y desconectamos al taxista.
 *
 * En background, la vigilancia la hace:
 *
 * backgroundLocation.js
 *        +
 * watchdog del backend
 */

  useEffect(() => {
    if (!activo) {
      return;
    }

    let cancelado = false;
    let gpsPerdidoNotificado = false;

    const comprobarGps =
      async () => {
        try {
          /*
           * Esta comprobación solo es necesaria
           * mientras la app está en primer plano.
           *
           * En background dejamos trabajar a
           * expo-location + TaskManager.
           */
          if (
            appStateRef.current !==
            "active"
          ) {
            return;
          }

          const permiso =
            await Location.getForegroundPermissionsAsync();

          if (cancelado) {
            return;
          }

          if (
            permiso.status !==
            "granted"
          ) {
            setGpsActivo(false);

            setGpsError(
              "Debes activar la ubicación para trabajar."
            );

            ultimaUbicacionRef.current =
              null;

            if (
              !gpsPerdidoNotificado
            ) {
              gpsPerdidoNotificado =
                true;

              console.log(
                "❌ Permiso GPS perdido"
              );

              onGpsPerdido?.();
            }

            return;
          }

          const enabled =
            await Location.hasServicesEnabledAsync();

          if (cancelado) {
            return;
          }

          if (!enabled) {
            setGpsActivo(false);

            setGpsError(
              "El GPS del dispositivo está desactivado."
            );

            /*
             * Muy importante:
             * eliminamos la última ubicación para
             * que nunca pueda volver a enviarse
             * como si fuera una posición nueva.
             */
            ultimaUbicacionRef.current =
              null;

            if (
              !gpsPerdidoNotificado
            ) {
              gpsPerdidoNotificado =
                true;

              console.log(
                "❌ GPS desactivado físicamente"
              );

              onGpsPerdido?.();
            }

            return;
          }

          /*
           * El GPS vuelve a estar disponible.
           *
           * Permitimos que una pérdida posterior
           * vuelva a ser notificada.
           */
          gpsPerdidoNotificado =
            false;

        } catch (error) {
          console.log(
            "❌ Error comprobando estado GPS:",
            error?.message || error
          );
        }
      };

    /*
     * Comprobación inmediata.
     */
    comprobarGps();

    /*
     * Y después cada 5 segundos.
     */
    const interval =
      setInterval(
        comprobarGps,
        5000
      );

    return () => {
      cancelado = true;

      clearInterval(
        interval
      );
    };
  }, [
    activo,
    onGpsPerdido,
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