import { useEffect, useState } from "react";
import { socket } from "./api/socket";
import TarjetaOferta from "./components/TarjetaOferta";

const TAXISTA_ID_DEMO =
  new URLSearchParams(window.location.search).get("taxista") ||
  "fc23b8df-4e51-4086-b075-729247dad71b";


export default function App() {
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState("desc");
  const [oferta, setOferta] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [numeroTaxi, setNumeroTaxi] = useState(null);

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("✅ socket connect", socket.id);
      setConectado(true);

      socket.emit("taxista:conectar", {
        taxistaId: TAXISTA_ID_DEMO,
      });
    });

    socket.on("disconnect", () => {
      setConectado(false);
    });

    socket.on("taxista:estado_actualizado", (data) => {
      setEstado(data.taxista.estado);
      setMensajes((prev) => [
        `Estado actualizado: ${data.taxista.estado}`,
        ...prev,
      ]);
    });

    socket.on("taxista:conectado", (data) => {
      console.log("✅ taxista:conectado", data);

      if (data.taxista?.vehiculo?.numeroTaxi) {
        setNumeroTaxi(data.taxista.vehiculo.numeroTaxi);
      }

      setMensajes((prev) => [
        `Taxista conectado: ${data.taxista?.nombreCompleto || data.taxistaId}`,
        ...prev,
      ]);
    });

    socket.on("oferta:recibida", (data) => {
      console.log("📨 oferta:recibida", data);
      setOferta(data);
      setMensajes((prev) => [
        `Oferta recibida: ${data.ofertaId}`,
        ...prev,
      ]);
    });

    socket.on("oferta:aceptada_ok", (data) => {
      setMensajes((prev) => [
        `Oferta aceptada: ${data.ofertaId}`,
        ...prev,
      ]);

      if (data.solicitud?.asignacion?.vehiculo?.numeroTaxi) {
        setMensajes((prev) => [
          `Vehículo asignado: ${data.solicitud.asignacion.vehiculo.numeroTaxi}`,
          ...prev,
        ]);
      }

      setOferta(null);
      setEstado("ocupado");
    });

    socket.on("oferta:rechazada_ok", (data) => {
      setMensajes((prev) => [
        `Oferta rechazada: ${data.ofertaId}`,
        ...prev,
      ]);
      setOferta(null);
    });

    socket.on("oferta:expirada", (data) => {
      console.log("⏰ oferta:expirada", data);

      setMensajes((prev) => [
        `Oferta expirada: ${data.ofertaId}`,
        ...prev,
      ]);

      setOferta((actual) => {
        if (actual?.ofertaId === data.ofertaId) {
          return null;
        }
        return actual;
      });
    });

    socket.on("error:general", (data) => {
      console.log("❌ error:general", data);
      setMensajes((prev) => [
        `Error: ${data.message}`,
        ...prev,
      ]);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("taxista:conectado");
      socket.off("taxista:estado_actualizado");
      socket.off("oferta:recibida");
      socket.off("oferta:aceptada_ok");
      socket.off("oferta:rechazada_ok");
      socket.off("oferta:expirada");
      socket.off("error:general");
      socket.disconnect();
    };
  }, []);

  const cambiarEstado = (nuevoEstado) => {
    console.log("🔄 Enviando cambio de estado:", TAXISTA_ID_DEMO, nuevoEstado);

    socket.emit("taxista:cambiar_estado", {
      taxistaId: TAXISTA_ID_DEMO,
      estado: nuevoEstado,
    });
  };

  const aceptarOferta = (ofertaId) => {
    socket.emit("oferta:aceptar", {
      ofertaId,
      taxistaId: TAXISTA_ID_DEMO,
    });
  };

  const rechazarOferta = (ofertaId) => {
    socket.emit("oferta:rechazar", {
      ofertaId,
    });
  };

  return (
    <div style={styles.container}>
      <h1>
        {numeroTaxi ? `App ${numeroTaxi}` : "App Taxista"}
      </h1>
      <p>
        <strong>Socket:</strong> {conectado ? "Conectado" : "Desconectado"}
      </p>

      <p>
        <strong>Estado:</strong> {estado}
      </p>

      <div style={styles.actions}>
        <button onClick={() => cambiarEstado("disponible")}>Disponible</button>
        <button onClick={() => cambiarEstado("ocupado")}>Ocupado</button>
        <button onClick={() => cambiarEstado("desc")}>Desconectado</button>
      </div>

      <TarjetaOferta
        oferta={oferta}
        onAceptar={aceptarOferta}
        onRechazar={rechazarOferta}
      />

      <div style={styles.log}>
        <h3>Eventos</h3>
        {mensajes.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "480px",
    margin: "0 auto",
    padding: "24px",
    fontFamily: "sans-serif",
  },
  actions: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  log: {
    marginTop: "24px",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "12px",
  },
};