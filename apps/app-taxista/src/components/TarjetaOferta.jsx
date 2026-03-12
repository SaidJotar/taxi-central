export default function TarjetaOferta({ oferta, onAceptar, onRechazar }) {
  if (!oferta) return null;

  return (
    <section className="oferta-card">
      <div className="oferta-badge">Nueva oferta</div>

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