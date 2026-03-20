import { useEffect, useRef, useState } from "react";
import { socket } from "./api/socket";
import TarjetaOferta from "./components/TarjetaOferta";
import LoginPage from "./pages/LoginPage";
import "./App.css";
import ParadaSugeridaCard from "./components/ParadaSugeridaCard";

export default function App() {

  //window.socket = socket; // para depuración en consola

  const token = localStorage.getItem("token");

  const taxistaLocal = JSON.parse(localStorage.getItem("taxista") || "null");
  const [paradaSugerida, setParadaSugerida] = useState(null);
  const [taxista, setTaxista] = useState(taxistaLocal);
  const [conectado, setConectado] = useState(false);
  const [estado, setEstado] = useState("desconectado");
  const [oferta, setOferta] = useState(null);
  const [servicioActivo, setServicioActivo] = useState(null);
  const [numeroTaxi, setNumeroTaxi] = useState(
    taxistaLocal?.vehiculo?.numeroTaxi || null
  );
  const [colaParada, setColaParada] = useState([]);
  const [posicionEnParada, setPosicionEnParada] = useState(null);

  const [gpsActivo, setGpsActivo] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  const audioRef = useRef(null);
  const intervaloSonidoRef = useRef(null);
  const ultimaUbicacionRef = useRef(null);

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

  const forzarDesconexionPorGps = () => {
    setEstado("desconectado");

    socket.emit("taxista:cambiar_estado", {
      estado: "desconectado",
    });
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

  const [paradaActual, setParadaActual] = useState(taxistaLocal?.parada || null);

  useEffect(() => {
    if (!paradaActual) {
      setColaParada([]);
      setPosicionEnParada(null);
    }
  }, [paradaActual]);

  useEffect(() => {
    if (!conectado) return;

    const interval = setInterval(() => {
      const ubicacion = ultimaUbicacionRef.current;
      if (!ubicacion) return;

      socket.emit("taxista:ubicacion", ubicacion);
    }, 15000); // cada 15s

    return () => clearInterval(interval);
  }, [conectado]);

  useEffect(() => {
    if (!taxistaId) return;
    if (!conectado) return;

    if (!navigator.geolocation) {
      setGpsActivo(false);
      setGpsError("Este dispositivo no permite geolocalización.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        ultimaUbicacionRef.current = { lat, lng };
        setGpsActivo(true);
        setGpsError(null);

        socket.emit("taxista:ubicacion", { lat, lng });
      },
      (error) => {
        console.log("Error geolocalización:", error.message);

        setGpsActivo(false);

        if (error.code === 1) {
          setGpsError("Has desactivado la ubicación. Te hemos puesto como desconectado.");
        } else if (error.code === 2) {
          setGpsError("No se pudo obtener tu ubicación. Te hemos puesto como desconectado.");
        } else if (error.code === 3) {
          setGpsError("La ubicación ha caducado. Te hemos puesto como desconectado.");
        } else {
          setGpsError("GPS inactivo. Te hemos puesto como desconectado.");
        }

        forzarDesconexionPorGps();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => {
      setGpsActivo(false);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [taxistaId, conectado]);

  useEffect(() => {
    const desbloquearAudio = () => {
      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          })
          .catch(() => { });
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

    socket.on("taxista:gps_requerido", (data) => {
      setParadaSugerida(null);
      setEstado("desconectado");
      setGpsActivo(false);
      setGpsError(data?.message || "Activa el GPS para recibir ofertas.");
    });

    socket.on("taxista:parada_sugerida", (data) => {
      if (paradaActual) return;

      setParadaSugerida((actual) => {
        const mismaParada =
          actual?.parada?.id &&
          data?.parada?.id &&
          actual.parada.id === data.parada.id;

        if (mismaParada) {
          return actual;
        }

        return data;
      });
    });

    socket.on("oferta:cancelada", (data) => {
      setOferta((actual) => {
        if (!actual) return null;

        if (actual.ofertaId === data.ofertaId) {
          pararSonidoOferta();
          return null;
        }

        return actual;
      });
    });


    socket.on("taxista:parada_confirmada", (data) => {
      setParadaSugerida(null);

      if (data?.taxista) {
        setTaxista(data.taxista);
        setParadaActual(data.taxista?.parada || null);
        setEstado(data.taxista?.estado || "disponible");
        localStorage.setItem("taxista", JSON.stringify(data.taxista));
      }
    });

    socket.on("taxista:parada_rechazada_ok", () => {
      setParadaSugerida(null);
    });

    socket.on("taxista:salio_parada", (data) => {
      setParadaSugerida(null);

      if (data?.taxista) {
        setTaxista(data.taxista);
        setParadaActual(null);
        setEstado(data.taxista.estado || "disponible");
        localStorage.setItem("taxista", JSON.stringify(data.taxista));
      } else {
        setParadaActual(null);
        setEstado("disponible");
      }

      setColaParada([]);
      setPosicionEnParada(null);
    });

    socket.on("taxista:gps_requerido", (data) => {
      setParadaSugerida(null);
      setEstado("desconectado");
    });

    socket.on("taxista:estado_actualizado", (data) => {
      setEstado(data.taxista.estado);
      setParadaActual(data.taxista?.parada || null);

      if (data?.taxista) {
        setTaxista(data.taxista);
        localStorage.setItem("taxista", JSON.stringify(data.taxista));
      }
    });

    socket.on("taxista:conectado", (data) => {
      setTaxista(data.taxista);
      setEstado(data.taxista.estado);
      setParadaActual(data.taxista?.parada || null);

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
          direccionBase: solicitud.direccionBase || null,
          referenciaRecogida: solicitud.referenciaRecogida || null,
        });
      }
    });

    socket.on("taxista:parada_sugerida_cancelada", () => {
      setParadaSugerida(null);
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

    socket.on("parada:cola_actualizada", (data) => {
      console.log("📥 parada:cola_actualizada", data);

      if (!data?.paradaId) return;

      setColaParada(data.cola || []);

      const mia = (data.cola || []).find((item) => item.taxistaId === taxistaId);
      setPosicionEnParada(mia?.posicion || null);
    });

    socket.on("servicio:terminado_ok", (data) => {
      setServicioActivo(null);
      setEstado("disponible");

      if (data?.taxista) {
        setTaxista(data.taxista);
        setParadaActual(data.taxista?.parada || null);
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
      socket.off("taxista:gps_requerido");
      socket.off("oferta:aceptada_ok");
      socket.off("oferta:rechazada_ok");
      socket.off("oferta:cancelada");
      socket.off("oferta:expirada");
      socket.off("servicio:terminado_ok");
      socket.off("taxista:parada_sugerida_cancelada");
      socket.off("taxista:parada_sugerida");
      socket.off("taxista:parada_confirmada");
      socket.off("taxista:parada_rechazada_ok");
      socket.off("taxista:salio_parada");
      socket.off("parada:cola_actualizada");
      socket.disconnect();
    };
  }, [taxistaId]);

  if (!taxistaLocal || !taxistaId) {
    return <LoginPage onLogin={setTaxista} />;
  }

  const cambiarEstado = (nuevoEstado) => {
    if ((nuevoEstado === "disponible" || nuevoEstado === "ocupado") && !gpsActivo) {
      setGpsError("No puedes conectarte sin GPS activo.");
      return;
    }

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

  const rechazarParada = (paradaId, motivo = "rechazada") => {
    if (!paradaSugerida?.parada?.id) return;
    if (paradaSugerida.parada.id !== paradaId) return;
    if (paradaActual) return;

    // ocultar la tarjeta inmediatamente en frontend
    setParadaSugerida(null);

    socket.emit("taxista:rechazar_parada", { paradaId, motivo });
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

  const formatearHora = (fecha) => {
    if (!fecha) return "";
    return new Date(fecha).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <main className="app-shell">
      <section className="app-card">
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

        <div className="app-header">

          <h1 className="app-title">
            {numeroTaxi ? `Taxi ${numeroTaxi}` : "App Taxista"}
          </h1>

          <div className="info-operativa">
            {servicioActivo ? (
              <p className="info-pill info-servicio">
                🚕 En servicio con cliente
              </p>
            ) : paradaActual ? (
              <>
                <p className="info-pill info-parada">
                  🚖 En parada: <strong>{paradaActual.nombre}</strong>
                </p>

                {posicionEnParada ? (
                  <p className="info-extra">
                    Posición en cola: <strong>{posicionEnParada}</strong>
                  </p>
                ) : (
                  <p className="info-extra">
                    Calculando posición en cola...
                  </p>
                )}

              </>
            ) : estado === "disponible" ? (
              <p className="info-pill info-disponible">
                ✅ Disponible fuera de parada
              </p>
            ) : estado === "ocupado" ? (
              <p className="info-pill info-ocupado">
                ⛔ Ocupado
              </p>
            ) : (
              <p className="info-pill info-desconectado">
                ⚪ Desconectado
              </p>
            )}

            {gpsActivo ? (
              <p className="info-extra">GPS activo</p>
            ) : (
              <p className="info-extra info-alerta">
                ⚠️ Activa el GPS para poder recibir ofertas
              </p>
            )}

            {gpsError && (
              <p className="info-extra info-alerta">
                {gpsError}
              </p>
            )}
          </div>
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
        </div>

        <TarjetaOferta
          oferta={oferta}
          onAceptar={aceptarOferta}
          onRechazar={rechazarOferta}
        />

        {!paradaActual && estado === "disponible" && (
          <ParadaSugeridaCard
            paradaSugerida={paradaSugerida}
            onCancelar={rechazarParada}
          />
        )}

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
              <strong>Recogida:</strong>{" "}
              {servicioActivo.direccionBase || servicioActivo.direccionRecogida}
            </p>

            {servicioActivo.referenciaRecogida && (
              <p>
                <strong>Referencia:</strong> {servicioActivo.referenciaRecogida}
              </p>
            )}

            {servicioActivo.direccionRecogida &&
              servicioActivo.direccionBase &&
              servicioActivo.direccionRecogida !== servicioActivo.direccionBase && (
                <p>
                  <strong>Texto original:</strong> {servicioActivo.direccionRecogida}
                </p>
              )}

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