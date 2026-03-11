export default function TarjetaOferta({ oferta, onAceptar, onRechazar }) {
  if (!oferta) return null;

  return (
    <div style={styles.card}>
      <h2>Nueva oferta</h2>
      <p><strong>Cliente:</strong> {oferta.solicitud.nombreCliente}</p>
      <p><strong>Teléfono:</strong> {oferta.solicitud.telefonoCliente}</p>
      <p><strong>Recogida:</strong> {oferta.solicitud.direccionRecogida}</p>

      <div style={styles.actions}>
        <button style={styles.accept} onClick={() => onAceptar(oferta.ofertaId)}>
          Aceptar
        </button>
        <button style={styles.reject} onClick={() => onRechazar(oferta.ofertaId)}>
          Rechazar
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    border: "1px solid #ddd",
    borderRadius: "12px",
    padding: "16px",
    marginTop: "16px",
    background: "#fff",
  },
  actions: {
    display: "flex",
    gap: "12px",
    marginTop: "12px",
  },
  accept: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
  },
  reject: {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
  },
};