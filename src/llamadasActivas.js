const llamadasPorSolicitud = new Map();

function guardarLlamadaPorSolicitud(solicitudId, data) {
  llamadasPorSolicitud.set(solicitudId, data);
}

function obtenerLlamadaPorSolicitud(solicitudId) {
  return llamadasPorSolicitud.get(solicitudId);
}

function eliminarLlamadaPorSolicitud(solicitudId) {
  llamadasPorSolicitud.delete(solicitudId);
}

module.exports = {
  guardarLlamadaPorSolicitud,
  obtenerLlamadaPorSolicitud,
  eliminarLlamadaPorSolicitud,
};