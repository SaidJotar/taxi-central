import { useEffect, useMemo, useRef, useState } from "react";

export default function ParadaSugeridaCard({
  paradaSugerida,
  onCancelar,
}) {
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const timeoutDisparadoRef = useRef(false);

  const expiresAtMs = useMemo(() => {
    if (!paradaSugerida?.expiresAt) return null;
    return new Date(paradaSugerida.expiresAt).getTime();
  }, [paradaSugerida?.expiresAt]);

  useEffect(() => {
    timeoutDisparadoRef.current = false;

    if (!paradaSugerida?.parada || !expiresAtMs) {
      setSegundosRestantes(0);
      return;
    }

    const actualizar = () => {
      const diff = expiresAtMs - Date.now();
      const segundos = Math.max(0, Math.ceil(diff / 1000));
      setSegundosRestantes(segundos);

      if (diff <= 0 && !timeoutDisparadoRef.current) {
        timeoutDisparadoRef.current = true;
        onCancelar(paradaSugerida.parada.id, "timeout");
      }
    };

    actualizar();

    const interval = setInterval(actualizar, 250);

    return () => {
      clearInterval(interval);
    };
  }, [paradaSugerida, expiresAtMs, onCancelar]);

  if (!paradaSugerida?.parada) return null;

  const { parada } = paradaSugerida;

  return (
    <section className="oferta-card">
      <div className="oferta-badge">Parada cercana</div>

      <p>
        <span>Tiempo restante</span>
        <strong className={segundosRestantes <= 5 ? "oferta-tiempo-urgente" : ""}>
          : {segundosRestantes}s
        </strong>
      </p>

      <h2 className="oferta-title">Entrando automáticamente en parada...</h2>

      <div className="oferta-info">
        <p>
          <span>Nombre</span>
          <strong>{parada.nombre}</strong>
        </p>

        {parada.direccion && (
          <p>
            <span>Dirección</span>
            <strong>{parada.direccion}</strong>
          </p>
        )}

        {typeof parada.distanciaMetros === "number" && (
          <p>
            <span>Distancia</span>
            <strong>{parada.distanciaMetros} m</strong>
          </p>
        )}
      </div>

      <div className="oferta-actions">
        <button
          className="btn-rechazar"
          onClick={() => {
            timeoutDisparadoRef.current = true;
            onCancelar(parada.id, "rechazada");
          }}
        >
          Cancelar autoentrada
        </button>
      </div>
    </section>
  );
}