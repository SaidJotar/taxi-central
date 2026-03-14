const prisma = require("../services/bd");
const bcrypt = require("bcrypt");

async function main() {

  const passwordHash = await bcrypt.hash("123456", 10);

  const paradas = await prisma.parada.findMany();

  if (!paradas.length) {
    console.log("❌ No hay paradas creadas");
    return;
  }

  const plazaAfrica = paradas.find(p => p.nombre.includes("África"));
  const estacion = paradas.find(p => p.nombre.includes("Marítima"));

  const taxistas = [
    {
      nombreCompleto: "Taxi 1",
      telefono: "+34600000001",
      numeroTaxi: "1",
      lat: 35.8896,
      lng: -5.3198,
      paradaId: plazaAfrica?.id
    },
    {
      nombreCompleto: "Taxi 2",
      telefono: "+34600000002",
      numeroTaxi: "2",
      lat: 35.8897,
      lng: -5.3199,
      paradaId: plazaAfrica?.id
    },
    {
      nombreCompleto: "Taxi 3",
      telefono: "+34600000003",
      numeroTaxi: "3",
      lat: 35.8973,
      lng: -5.3076,
      paradaId: estacion?.id
    },
    {
      nombreCompleto: "Taxi 4",
      telefono: "+34600000004",
      numeroTaxi: "4",
      lat: 35.8925,
      lng: -5.3250,
      paradaId: null
    },
    {
      nombreCompleto: "Taxi 5",
      telefono: "+34600000005",
      numeroTaxi: "5",
      lat: 35.8900,
      lng: -5.3300,
      paradaId: null
    }
  ];

  for (const t of taxistas) {

    const existente = await prisma.taxista.findUnique({
      where: { telefono: t.telefono }
    });

    if (existente) {
      console.log("⚠️ Ya existe:", t.telefono);
      continue;
    }

    const taxista = await prisma.taxista.create({
      data: {
        nombreCompleto: t.nombreCompleto,
        telefono: t.telefono,
        passwordHash,
        estado: "disponible",
        telefonoVerificado: true,

        lat: t.lat,
        lng: t.lng,
        ubicacionActualizadaEn: new Date(),

        paradaId: t.paradaId,
        enParadaDesde: t.paradaId ? new Date() : null,

        vehiculo: {
          create: {
            numeroTaxi: t.numeroTaxi,
            matricula: `TEST-${t.numeroTaxi}`,
            modelo: "Toyota Prius",
            color: "Blanco"
          }
        }
      },
      include: {
        vehiculo: true
      }
    });

    console.log("✅ Taxista creado:", taxista.nombreCompleto);
  }

  console.log("🚕 Taxistas de prueba creados");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });