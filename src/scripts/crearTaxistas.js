const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

if (!process.env.DATABASE_URL) {
  console.error("ERROR: No se encontró DATABASE_URL en /var/www/taxi-central/.env");
  process.exit(1);
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  /*
   * Modifica estos datos antes de ejecutar el archivo.
   */
  const datosTaxista = {
    nombreCompleto: "Mohamed Ejemplo",
    telefono: "600000000",
    password: "Taxi1234",
    estado: "desconectado",
    telefonoVerificado: true,

    vehiculo: {
      numeroTaxi: "25",
      matricula: "1234ABC",
      marca: "Toyota",
      modelo: "Corolla",
    },
  };

  const estadosPermitidos = ["desconectado", "disponible", "ocupado"];

  if (!estadosPermitidos.includes(datosTaxista.estado)) {
    throw new Error(
      `Estado incorrecto. Usa uno de estos valores: ${estadosPermitidos.join(", ")}`
    );
  }

  const taxistaExistente = await prisma.taxista.findUnique({
    where: {
      telefono: datosTaxista.telefono,
    },
  });

  if (taxistaExistente) {
    throw new Error(
      `Ya existe un taxista con el teléfono ${datosTaxista.telefono}`
    );
  }

  const vehiculoExistente = await prisma.vehiculo.findUnique({
    where: {
      numeroTaxi: datosTaxista.vehiculo.numeroTaxi,
    },
  });

  if (vehiculoExistente) {
    throw new Error(
      `Ya existe un vehículo con el número de taxi ${datosTaxista.vehiculo.numeroTaxi}`
    );
  }

  const passwordHash = await bcrypt.hash(datosTaxista.password, 12);

  const taxistaCreado = await prisma.taxista.create({
    data: {
      nombreCompleto: datosTaxista.nombreCompleto,
      telefono: datosTaxista.telefono,
      passwordHash,
      estado: datosTaxista.estado,
      telefonoVerificado: datosTaxista.telefonoVerificado,

      vehiculo: {
        create: {
          numeroTaxi: datosTaxista.vehiculo.numeroTaxi,
          matricula: datosTaxista.vehiculo.matricula || null,
          marca: datosTaxista.vehiculo.marca || null,
          modelo: datosTaxista.vehiculo.modelo || null,
        },
      },
    },

    include: {
      vehiculo: true,
    },
  });

  console.log("\nTaxista creado correctamente:\n");

  console.log({
    id: taxistaCreado.id,
    nombreCompleto: taxistaCreado.nombreCompleto,
    telefono: taxistaCreado.telefono,
    estado: taxistaCreado.estado,
    telefonoVerificado: taxistaCreado.telefonoVerificado,
    creadoEn: taxistaCreado.creadoEn,
    vehiculo: taxistaCreado.vehiculo,
  });

  console.log("\nDatos para iniciar sesión:");
  console.log(`Teléfono: ${datosTaxista.telefono}`);
  console.log(`Contraseña: ${datosTaxista.password}`);
}

main()
  .catch((error) => {
    console.error("\nNo se pudo crear el taxista:\n");

    if (error.code === "P2002") {
      console.error(
        "Ya existe un registro con un teléfono, número de taxi u otro campo único igual."
      );
      console.error(error.meta);
    } else if (error.code === "P2021") {
      console.error(
        "No existe alguna de las tablas necesarias. Comprueba que hayas aplicado el schema de Prisma."
      );
      console.error(error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });