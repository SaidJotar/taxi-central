const express = require("express");
const bcrypt = require("bcrypt");
const prisma = require("../services/bd");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const {
      nombreCompleto,
      telefono,
      password,
      numeroTaxi,
      matricula,
      modelo,
      color,
    } = req.body;

    if (!nombreCompleto || !telefono || !password || !numeroTaxi) {
      return res.status(400).json({
        error: "Faltan campos obligatorios",
      });
    }

    const existente = await prisma.taxista.findUnique({
      where: { telefono },
    });

    if (existente) {
      return res.status(409).json({
        error: "Ya existe un taxista con ese teléfono",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const taxista = await prisma.taxista.create({
      data: {
        nombreCompleto,
        telefono,
        passwordHash,
        estado: "desconectado",
        vehiculo: {
          create: {
            numeroTaxi,
            matricula: matricula || null,
            modelo: modelo || null,
            color: color || null,
          },
        },
      },
      include: {
        vehiculo: true,
      },
    });

    res.status(201).json({
      ok: true,
      taxista: {
        id: taxista.id,
        nombreCompleto: taxista.nombreCompleto,
        telefono: taxista.telefono,
        estado: taxista.estado,
        vehiculo: taxista.vehiculo,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { telefono, password } = req.body;

    if (!telefono || !password) {
      return res.status(400).json({
        error: "Faltan teléfono o contraseña",
      });
    }

    const taxista = await prisma.taxista.findUnique({
      where: { telefono },
      include: { vehiculo: true },
    });

    if (!taxista) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    const passwordOk = await bcrypt.compare(password, taxista.passwordHash);

    if (!passwordOk) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    res.json({
      ok: true,
      taxista: {
        id: taxista.id,
        nombreCompleto: taxista.nombreCompleto,
        telefono: taxista.telefono,
        estado: taxista.estado,
        vehiculo: taxista.vehiculo,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;