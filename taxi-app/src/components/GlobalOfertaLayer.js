import React, { useMemo, useEffect } from "react";
import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { useOferta } from "../context/OfertaContext";
import OfertaModal from "./OfertaModal";

export default function GlobalOfertaLayer() {
  const { token } = useAuth();
  const { oferta, setOferta, setServicioActivo } = useOferta();

  const socket = useMemo(() => getSocket(token), [token]);

  useEffect(() => {
    if (!token) return;

    const onOfertaRecibida = (data) => {
      setOferta(data);
    };

    const onOfertaRechazada = () => {
      setOferta(null);
    };

    const onOfertaExpirada = (data) => {
      setOferta((actual) => {
        if (!actual) return null;
        if (actual.ofertaId === data.ofertaId) return null;
        return actual;
      });
    };

    const onOfertaCancelada = (data) => {
      setOferta((actual) => {
        if (!actual) return null;
        if (actual.ofertaId === data.ofertaId) return null;
        return actual;
      });
    };

    const onOfertaAceptada = (data) => {
      setOferta(null);

      const solicitud = data?.solicitud;
      if (solicitud) {
        setServicioActivo({
          solicitudId: solicitud.id,
          nombreCliente: solicitud.nombreCliente,
          telefonoCliente: solicitud.telefonoCliente,
          direccionRecogida: solicitud.direccionRecogida,
          direccionBase: solicitud.direccionBase,
          referenciaRecogida: solicitud.referenciaRecogida,
        });
      }
    };

    socket.on("oferta:recibida", onOfertaRecibida);
    socket.on("oferta:rechazada_ok", onOfertaRechazada);
    socket.on("oferta:expirada", onOfertaExpirada);
    socket.on("oferta:cancelada", onOfertaCancelada);
    socket.on("oferta:aceptada_ok", onOfertaAceptada);

    return () => {
      socket.off("oferta:recibida", onOfertaRecibida);
      socket.off("oferta:rechazada_ok", onOfertaRechazada);
      socket.off("oferta:expirada", onOfertaExpirada);
      socket.off("oferta:cancelada", onOfertaCancelada);
      socket.off("oferta:aceptada_ok", onOfertaAceptada);
    };
  }, [socket, token, setOferta, setServicioActivo]);

  const aceptarOferta = (ofertaId) => {
    socket.emit("oferta:aceptar", { ofertaId });
  };

  const rechazarOferta = (ofertaId) => {
    socket.emit("oferta:rechazar", { ofertaId });
  };

  return (
    <OfertaModal
      visible={!!oferta}
      oferta={oferta}
      onAceptar={aceptarOferta}
      onRechazar={rechazarOferta}
    />
  );
}