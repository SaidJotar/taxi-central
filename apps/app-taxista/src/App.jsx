import { useEffect, useRef, useState } from "react";
import { socket } from "./api/socket";
import TarjetaOferta from "./components/TarjetaOferta";
import LoginPage from "./pages/LoginPage";
import "./App.css";

export default function App() {
  const token = localStorage.getItem("token");

  const taxistaLocal = JSON.parse(localStorage.getItem("taxista") || "null");

  const [taxista, setTaxista] = useState(taxistaLocal);
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState("desconectado");
  const [oferta, setOferta] = useState(null);
  const [servicioActivo, setServicioActivo] = useState(null);
  const [numeroTaxi, setNumeroTaxi] = useState(
    taxistaLocal?.vehiculo?.numeroTaxi || null
  );

  const audioRef = useRef(null);
  const intervaloSonidoRef = useRef(null);

  const taxistaUrl =
    new URLSearchParams(window.location.search).get("taxista") ||
    taxistaLocal?.id ||
    null;

  const taxistaId = taxistaUrl || taxistaLocal?.id || null;

  const reproducirNotificacion = () => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((err) => {
      console.log("Audio bloqueado:", err);
    });
  };

  const iniciarSonidoOferta = () => {
    if (intervaloSonidoRef.current) return;

    reproducirNotificacion();

    intervaloSonidoRef.current = setInterval(() => {
      reproducirNotificacion();
    }, 1500);
  };

  const pararSonidoOferta = () => {
    if (intervaloSonidoRef.current) {
      clearInterval(intervaloSonidoRef.current);
      intervaloSonidoRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    const desbloquearAudio = () => {
      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          })
          .catch(() => {});
      }

      window.removeEventListener("click", desbloquearAudio);
      window.removeEventListener("touchstart", desbloquearAudio);
    };

    window.addEventListener("click", desbloquearAudio);
    window.addEventListener("touchstart", desbloquearAudio);

    return () => {
      window.removeEventListener("click", desbloquearAudio);
      window.removeEventListener("touchstart", desbloquearAudio);
    };
  }, []);

  useEffect(() => {
    if (!taxistaId) return;

    if (!token) return;
    socket.auth = { token };
    socket.connect();

    socket.on("connect", () => {
      setConectado(true);
    });

    socket.on("connect_error", (err) => {
      console.log("Error de autenticación socket:", err.message);

      if (err.message === "No autorizado" || err.message === "Token no proporcionado") {
        localStorage.removeItem("token");
        localStorage.removeItem("taxista");

        window.location.href = "/";
      }
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

    socket.on("oferta:recibida", (data) => {
      setOferta(data);

      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }

      iniciarSonidoOferta();
    });

    socket.on("oferta:aceptada_ok", (data) => {
      pararSonidoOferta();
      setOferta(null);
      setEstado("ocupado");

      const solicitud = data?.solicitud;

      if (solicitud) {
        setServicioActivo({
          solicitudId: solicitud.id,
          nombreCliente: solicitud.nombreCliente,
          telefonoCliente: solicitud.telefonoCliente,
          direccionRecogida: solicitud.direccionRecogida,
        });
      }
    });

    socket.on("oferta:rechazada_ok", () => {
      pararSonidoOferta();
      setOferta(null);
    });

    socket.on("oferta:expirada", (data) => {
      setOferta((actual) => {
        const expira = actual?.ofertaId === data.ofertaId;

        if (expira) {
          pararSonidoOferta();
          return null;
        }

        return actual;
      });
    });

    socket.on("servicio:terminado_ok", (data) => {
      setServicioActivo(null);
      setEstado("disponible");

      if (data?.taxista) {
        setTaxista(data.taxista);
        localStorage.setItem("taxista", JSON.stringify(data.taxista));

        if (data.taxista?.vehiculo?.numeroTaxi) {
          setNumeroTaxi(data.taxista.vehiculo.numeroTaxi);
        }
      }
    });

    return () => {
      pararSonidoOferta();
      socket.off("connect");
      socket.off("disconnect");
      socket.off("taxista:estado_actualizado");
      socket.off("taxista:conectado");
      socket.off("oferta:recibida");
      socket.off("oferta:aceptada_ok");
      socket.off("oferta:rechazada_ok");
      socket.off("oferta:expirada");
      socket.off("servicio:terminado_ok");
      socket.disconnect();
    };
  }, [taxistaId]);

  if (!taxistaLocal || !taxistaId) {
    return <LoginPage onLogin={setTaxista} />;
  }

  const cambiarEstado = (nuevoEstado) => {
    socket.emit("taxista:cambiar_estado", {
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

  const terminarServicio = () => {
    if (!servicioActivo?.solicitudId) return;

    socket.emit("servicio:terminar", {
      solicitudId: servicioActivo.solicitudId,
      taxistaId,
    });
  };

  const cerrarSesion = () => {
    pararSonidoOferta();

    try {
      socket.off(); // elimina todos los listeners
      socket.disconnect();
    } catch (e) { }

    localStorage.removeItem("token");
    localStorage.removeItem("taxista");

    window.location.replace("/");
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
            Estado actual: <strong>{servicioActivo ? "en servicio" : estado}</strong>
          </p>
        </div>

        <div className="actions">
          <button
            className={estado === "disponible" ? "activo" : ""}
            onClick={() => cambiarEstado("disponible")}
            disabled={!!servicioActivo}
          >
            Disponible
          </button>

          <button
            className={estado === "ocupado" ? "activo" : ""}
            onClick={() => cambiarEstado("ocupado")}
            disabled={!!servicioActivo}
          >
            Ocupado
          </button>

          <button
            className={estado === "desconectado" ? "activo" : ""}
            onClick={() => cambiarEstado("desconectado")}
            disabled={!!servicioActivo}
          >
            Desconectado
          </button>

          <button className="logout-btn" onClick={cerrarSesion} title="Cerrar sesión">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v10" />
              <path d="M6.2 6.2a9 9 0 1 0 11.6 0" />
            </svg>
          </button>
        </div>

        <TarjetaOferta
          oferta={oferta}
          onAceptar={aceptarOferta}
          onRechazar={rechazarOferta}
        />

        {servicioActivo && (
          <section className="tarjeta-servicio">
            <h2>En servicio</h2>
            <p>
              <strong>Cliente:</strong> {servicioActivo.nombreCliente}
            </p>
            <p>
              <strong>Teléfono:</strong> {servicioActivo.telefonoCliente}
            </p>
            <p>
              <strong>Recogida:</strong> {servicioActivo.direccionRecogida}
            </p>

            <button className="activo" onClick={terminarServicio}>
              Terminado
            </button>
          </section>
        )}

        <audio ref={audioRef} src="/notificacion.mp3" preload="auto" />
      </section>
    </main>
  );
}