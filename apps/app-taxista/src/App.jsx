import { useEffect, useState } from "react";
import { socket } from "./api/socket";
import TarjetaOferta from "./components/TarjetaOferta";
import LoginPage from "./pages/LoginPage";
import "./App.css";

export default function App() {
  const taxistaLocal = JSON.parse(localStorage.getItem("taxista") || "null");

  if (!taxistaLocal) {
    return <LoginPage />;
  }

  const taxistaUrl =
    new URLSearchParams(window.location.search).get("taxista") ||
    taxistaLocal?.id ||
    null;

  const taxistaId = taxistaUrl || taxistaLocal?.id || null;

  const [taxista, setTaxista] = useState(taxistaLocal);
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState("desconectado");
  const [oferta, setOferta] = useState(null);
  const [numeroTaxi, setNumeroTaxi] = useState(taxistaLocal?.vehiculo?.numeroTaxi || null);

  useEffect(() => {
    if (!taxistaId) return;

    socket.connect();

    socket.on("connect", () => {
      setConectado(true);
      socket.emit("taxista:conectar", { taxistaId });
    });

    socket.on("disconnect", () => {
      setConectado(false);
    });

    socket.on("taxista:estado_actualizado", (data) => {
      setEstado(data.taxista.estado);
    });

    socket.on("taxista:conectado", (data) => {
      setTaxista(data.taxista);
      setEstado(data.taxista.estado);
      if (data.taxista?.vehiculo?.numeroTaxi) {
        setNumeroTaxi(data.taxista.vehiculo.numeroTaxi);
      }
      localStorage.setItem("taxista", JSON.stringify(data.taxista));
    });

    socket.on("oferta:recibida", (data) => setOferta(data));
    socket.on("oferta:aceptada_ok", () => {
      setOferta(null);
      setEstado("ocupado");
    });
    socket.on("oferta:rechazada_ok", () => setOferta(null));
    socket.on("oferta:expirada", (data) => {
      setOferta((actual) =>
        actual?.ofertaId === data.ofertaId ? null : actual
      );
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("taxista:conectado");
      socket.off("oferta:recibida");
      socket.off("oferta:aceptada_ok");
      socket.off("oferta:rechazada_ok");
      socket.off("oferta:expirada");
      socket.disconnect();
    };
  }, [taxistaId]);

  if (!taxistaId) {
    return <LoginPage onLogin={setTaxista} />;
  }

  const cambiarEstado = (nuevoEstado) => {
    socket.emit("taxista:cambiar_estado", {
      taxistaId,
      estado: nuevoEstado,
    });
  };

  const aceptarOferta = (ofertaId) => {
    socket.emit("oferta:aceptar", {
      ofertaId,
      taxistaId,
    });
  };

  const rechazarOferta = (ofertaId) => {
    socket.emit("oferta:rechazar", { ofertaId });
  };

  const cerrarSesion = () => {
    socket.disconnect();
    localStorage.removeItem("taxista");

    window.location.href = "/";
  };

  return (
    <main className="app-shell">
      <section className="app-card">
        <div className="app-header">

          <p className={`estado-socket ${conectado ? "ok" : "off"}`}>
            {conectado ? "Conectado" : "Desconectado"}
          </p>


          <h1 className="app-title">
            {numeroTaxi ? `Taxi ${numeroTaxi}` : "App Taxista"}
          </h1>


          <p className="app-subtitle">
            Estado actual: <strong>{estado}</strong>
          </p>

        </div>

        <div className="actions">
          <button
            className={estado === "disponible" ? "activo" : ""}
            onClick={() => cambiarEstado("disponible")}
          >
            Disponible
          </button>
          <button
            className={estado === "ocupado" ? "activo" : ""}
            onClick={() => cambiarEstado("ocupado")}
          >
            Ocupado
          </button>
          <button
            className={estado === "desconectado" ? "activo" : ""}
            onClick={() => cambiarEstado("desconectado")}
          >
            Desconectado
          </button>

          <button className="logout-btn" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </div>

        <TarjetaOferta
          oferta={oferta}
          onAceptar={aceptarOferta}
          onRechazar={rechazarOferta}
        />
      </section>
    </main>
  );
}