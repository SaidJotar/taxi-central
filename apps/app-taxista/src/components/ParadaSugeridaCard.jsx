import { useEffect, useMemo, useState } from "react";

export default function ParadaSugeridaCard({
  paradaSugerida,
  onConfirmar,
  onRechazar,
}) {
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  const expiresAtMs = useMemo(() => {
    if (!paradaSugerida?.expiresAt) return null;
    return new Date(paradaSugerida.expiresAt).getTime();
  }, [paradaSugerida]);

  useEffect(() => {
    if (!paradaSugerida || !expiresAtMs) {
      setSegundosRestantes(0);
      return;
    }

    const actualizar = () => {
      const diff = expiresAtMs - Date.now();
      const segundos = Math.max(0, Math.ceil(diff / 1000));
      setSegundosRestantes(segundos);

      if (diff <= 0) {
        onRechazar(paradaSugerida.parada.id, "timeout");
      }
    };

    actualizar();

    const interval = setInterval(actualizar, 250);

    return () => clearInterval(interval);
  }, [paradaSugerida, expiresAtMs, onRechazar]);

  if (!paradaSugerida?.parada) return null;

  const { parada } = paradaSugerida;

  return (
    <section className="oferta-card">
      <div className="oferta-badge">Parada cercana</div>

      <h2 className="oferta-title">¿Has llegado a esta parada?</h2>

      <div className="oferta-info">
        <p>
          <span>Parada</span>
          <strong>{parada.nombre}</strong>
        </p>

        {parada.direccion && (
          <p>
            <span>Dirección</span>
            <strong>{parada.direccion}</strong>
          </p>
        )}

        <p>
          <span>Distancia</span>
          <strong>{parada.distanciaMetros} m</strong>
        </p>

        <p>
          <span>Tiempo restante</span>
          <strong className={segundosRestantes <= 5 ? "oferta-tiempo-urgente" : ""}>
            {segundosRestantes}s
          </strong>
        </p>
      </div>

      <div className="oferta-actions">
        <button
          className="btn-aceptar"
          onClick={() => onConfirmar(parada.id)}
        >
          Entrar en parada
        </button>

        <button
          className="btn-rechazar"
          onClick={() => onRechazar(parada.id, "rechazada")}
        >
          No
        </button>
      </div>
    </section>
  );
}