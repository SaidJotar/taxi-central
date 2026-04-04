import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

export default function useTaxiLocation({
  socket,
  activo,
  onGpsPerdido,
}) {
  const [gpsActivo, setGpsActivo] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsInicializando, setGpsInicializando] = useState(false);

  const ultimaUbicacionRef = useRef(null);
  const subscriptionRef = useRef(null);
  const iniciandoRef = useRef(false);

  const refrescarUbicacion = async () => {
    try {

      const permiso = await Location.getForegroundPermissionsAsync();

      if (permiso.status !== "granted") {
        const nuevoPermiso = await Location.requestForegroundPermissionsAsync();

        if (nuevoPermiso.status !== "granted") {
          setGpsActivo(false);
          setGpsError("Debes activar la ubicación para trabajar.");
          return null;
        }
      }

      const enabled = await Location.hasServicesEnabledAsync();

      if (!enabled) {
        setGpsActivo(false);
        setGpsError("El GPS del dispositivo está desactivado.");
        return null;
      }

      const ultimaConocida = await Location.getLastKnownPositionAsync();

      if (ultimaConocida?.coords) {
        const lat = ultimaConocida.coords.latitude;
        const lng = ultimaConocida.coords.longitude;

        ultimaUbicacionRef.current = { lat, lng };
        setGpsActivo(true);
        setGpsError("");

        if (socket) {
          socket.emit("taxista:ubicacion", { lat, lng });
        }

        return { lat, lng };
      }

      const posicion = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (!posicion?.coords) {
        setGpsActivo(false);
        setGpsError("No se pudo obtener la ubicación.");
        return null;
      }

      const lat = posicion.coords.latitude;
      const lng = posicion.coords.longitude;

      ultimaUbicacionRef.current = { lat, lng };
      setGpsActivo(true);
      setGpsError("");

      if (socket) {
        socket.emit("taxista:ubicacion", { lat, lng });
      }

      return { lat, lng };
    } catch (error) {
      console.log("❌ Error refrescando ubicación:", error);
      setGpsActivo(false);
      setGpsError("No se pudo obtener la ubicación.");
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    const iniciarGps = async () => {
      if (!activo || !socket) return;
      if (subscriptionRef.current) return;
      if (iniciandoRef.current) return;

      iniciandoRef.current = true;
      setGpsInicializando(true);

      try {
        const permiso = await Location.requestForegroundPermissionsAsync();

        if (permiso.status !== "granted") {
          if (cancelled) return;
          setGpsActivo(false);
          setGpsError("Debes activar la ubicación para trabajar.");
          onGpsPerdido?.();
          return;
        }

        const enabled = await Location.hasServicesEnabledAsync();

        if (!enabled) {
          if (cancelled) return;
          setGpsActivo(false);
          setGpsError("El GPS del dispositivo está desactivado.");
          onGpsPerdido?.();
          return;
        }

        if (!cancelled) {
          setGpsInicializando(false);
        }

        const ultimaConocida = await Location.getLastKnownPositionAsync();

        if (!cancelled && ultimaConocida?.coords) {
          const lat = ultimaConocida.coords.latitude;
          const lng = ultimaConocida.coords.longitude;

          ultimaUbicacionRef.current = { lat, lng };
          setGpsActivo(true);
          setGpsError("");

          socket.emit("taxista:ubicacion", { lat, lng });
        }

        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 3,
          },
          (position) => {
            if (cancelled) return;
            if (!position?.coords) return;

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            ultimaUbicacionRef.current = { lat, lng };
            setGpsActivo(true);
            setGpsError("");
            setGpsInicializando(false);

            socket.emit("taxista:ubicacion", { lat, lng });
            console.log("📍 watch ubicación:", { lat, lng, at: new Date().toISOString() });
          }
        );

        subscriptionRef.current = sub;
      } catch (error) {
        console.log("❌ Error GPS:", error.message);
        setGpsActivo(false);
        setGpsError("No se pudo obtener la ubicación.");
        setGpsInicializando(false);
        onGpsPerdido?.();
      } finally {
        iniciandoRef.current = false;
      }
    };

    iniciarGps();

    return () => {
      cancelled = true;

      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      setGpsActivo(false);
      setGpsInicializando(false);
      ultimaUbicacionRef.current = null;
    };
  }, [activo, socket, onGpsPerdido]);

  useEffect(() => {
    if (!activo || !socket) return;

    const interval = setInterval(() => {
      const ubicacion = ultimaUbicacionRef.current;
      if (!ubicacion) return;

      socket.emit("taxista:ubicacion", ubicacion);
    }, 5000);

    return () => clearInterval(interval);
  }, [activo, socket]);

  return {
    gpsActivo,
    gpsError,
    gpsInicializando,
    ultimaUbicacion: ultimaUbicacionRef.current,
    refrescarUbicacion,
  };
}