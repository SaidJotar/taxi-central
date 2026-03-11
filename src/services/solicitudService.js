const prisma = require("./bd");

async function crearSolicitudViajeBD(datos) {
  return prisma.solicitudViaje.create({
    data: {
      nombreCliente: datos.nombre,
      telefonoCliente: datos.telefono,
      direccionRecogida: datos.recogida,
      estado: "pendiente",
      origen: "llamada_ia",
      confirmadaEn: new Date(),
    },
  });
}

module.exports = {
  crearSolicitudViajeBD,
};