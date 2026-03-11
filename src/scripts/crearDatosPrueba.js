const prisma = require("../services/bd");

async function main() {
  await prisma.asignacionSolicitud.deleteMany();
  await prisma.ofertaSolicitud.deleteMany();
  await prisma.solicitudViaje.deleteMany();
  await prisma.vehiculo.deleteMany();
  await prisma.taxista.deleteMany();

  const taxista1 = await prisma.taxista.create({
    data: {
      nombreCompleto: "Juan Pérez",
      telefono: "600000001",
      passwordHash: "demo",
      estado: "disponible",
      vehiculo: {
        create: {
          numeroTaxi: "Taxi 1",
          matricula: "1111AAA",
          modelo: "Toyota Prius",
          color: "Blanco",
        },
      },
    },
    include: {
      vehiculo: true,
    },
  });

  const taxista2 = await prisma.taxista.create({
    data: {
      nombreCompleto: "María López",
      telefono: "600000002",
      passwordHash: "demo",
      estado: "disponible",
      vehiculo: {
        create: {
          numeroTaxi: "Taxi 2",
          matricula: "2222BBB",
          modelo: "Skoda Octavia",
          color: "Blanco",
        },
      },
    },
    include: {
      vehiculo: true,
    },
  });

  const taxista3 = await prisma.taxista.create({
    data: {
      nombreCompleto: "Carlos Ruiz",
      telefono: "600000003",
      passwordHash: "demo",
      estado: "ocupado",
      vehiculo: {
        create: {
          numeroTaxi: "Taxi 3",
          matricula: "3333CCC",
          modelo: "Toyota Corolla",
          color: "Blanco",
        },
      },
    },
    include: {
      vehiculo: true,
    },
  });

  console.log("✅ Datos de prueba creados");
  console.log({ taxista1, taxista2, taxista3 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });