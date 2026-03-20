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

  const solicitud = oferta?.solicitud || {};

  const nombreCliente = solicitud?.nombreCliente || "No disponible";
  const telefonoCliente = solicitud?.telefonoCliente || "No disponible";
  const recogida =
    solicitud?.direccionBase ||
    solicitud?.direccionRecogida ||
    "No disponible";
  const referencia = solicitud?.referenciaRecogida || null;

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
          <strong>{nombreCliente}</strong>
        </p>

        <p>
          <span>Teléfono</span>
          <strong>{telefonoCliente}</strong>
        </p>

        <p>
          <span>Recogida</span>
          <strong>{recogida}</strong>
        </p>

        {referencia && (
          <p>
            <span>Referencia</span>
            <strong>{referencia}</strong>
          </p>
        )}
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