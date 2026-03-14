const prisma = require("../services/bd");

async function main() {
  const paradas = [
    {
      nombre: "Plaza de África",
      direccion: "Plaza de África, Ceuta",
      lat: 35.8896,
      lng: -5.3198,
    },
    {
      nombre: "Estación Marítima",
      direccion: "Estación Marítima, Ceuta",
      lat: 35.8973,
      lng: -5.3076,
    },
    {
      nombre: "Hospital Universitario",
      direccion: "Hospital Universitario de Ceuta",
      lat: 35.8892,
      lng: -5.3444,
    },
    {
      nombre: "Hadú",
      direccion: "Hadú, Ceuta",
      lat: 35.8808,
      lng: -5.3305,
    },
  ];

  for (const parada of paradas) {
    await prisma.parada.upsert({
      where: { nombre: parada.nombre },
      update: parada,
      create: parada,
    });
  }

  console.log("✅ Paradas cargadas");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });