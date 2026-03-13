import { useEffect, useMemo, useState } from "react";

export default function TarjetaOferta({ oferta, onAceptar, onRechazar }) {
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  const expiresAtMs = useMemo(() => {
    if (!oferta?.expiresAt) return null;
    return new Date(oferta.expiresAt).getTime();
  }, [oferta]);

  useEffect(() => {
    if (!oferta || !expiresAtMs) {
      setSegundosRestantes(0);
      return;
    }

    const actualizar = () => {
      const diff = expiresAtMs - Date.now();
      setSegundosRestantes(Math.max(0, Math.ceil(diff / 1000)));
    };

    actualizar();

    const interval = setInterval(actualizar, 250);

    return () => clearInterval(interval);
  }, [oferta, expiresAtMs]);

  if (!oferta) return null;

  return (
    <section className="oferta-card">
      <div className="oferta-badge">Nueva oferta</div>
      <p>
        <span>Tiempo restante</span>
        <strong className={segundosRestantes <= 3 ? "oferta-tiempo-urgente" : ""}>
          : {segundosRestantes}s
        </strong>
      </p>

      <h2 className="oferta-title">Servicio disponible</h2>

      <div className="oferta-info">
        <p>
          <span>Cliente</span>
          <strong>{oferta.solicitud.nombreCliente}</strong>
        </p>

        <p>
          <span>Teléfono</span>
          <strong>{oferta.solicitud.telefonoCliente}</strong>
        </p>

        <p>
          <span>Recogida</span>
          <strong>{oferta.solicitud.direccionRecogida}</strong>
        </p>


      </div>

      <div className="oferta-actions">
        <button
          className="btn-aceptar"
          onClick={() => onAceptar(oferta.ofertaId)}
        >
          Aceptar
        </button>

        <button
          className="btn-rechazar"
          onClick={() => onRechazar(oferta.ofertaId)}
        >
          Rechazar
        </button>
      </div>
    </section>
  );
}