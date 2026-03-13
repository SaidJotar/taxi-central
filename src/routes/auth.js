const express = require("express");
const bcrypt = require("bcrypt");
const twilio = require("twilio");
const prisma = require("../services/bd");
const {
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
} = require("../configSoloTwilio");

const router = express.Router();

const twilioClient =
  twilioAccountSid && twilioAuthToken
    ? twilio(twilioAccountSid, twilioAuthToken)
    : null;

function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizarTelefono(telefono) {
  if (!telefono) return "";

  let t = telefono.trim().replace(/\s+/g, "");

  if (t.startsWith("00")) {
    t = `+${t.slice(2)}`;
  }

  if (!t.startsWith("+")) {
    if (/^\d{9}$/.test(t)) {
      t = `+34${t}`;
    }
  }

  return t;
}

async function enviarCodigoSMS(telefono, codigo) {
  if (!twilioClient) {
    throw new Error("Twilio no está configurado");
  }

  await twilioClient.messages.create({
    body: `Tu código de verificación es: ${codigo}`,
    from: twilioPhoneNumber,
    to: telefono,
  });
}

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

    const telefonoNormalizado = normalizarTelefono(telefono);

    const existente = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
    });

    if (existente) {
      return res.status(409).json({
        error: "Ya existe un taxista con ese teléfono",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const codigo = generarCodigo();
    const expiraEn = new Date(Date.now() + 10 * 60 * 1000);

    const taxista = await prisma.taxista.create({
      data: {
        nombreCompleto,
        telefono: telefonoNormalizado,
        passwordHash,
        estado: "desconectado",
        telefonoVerificado: false,
        codigoVerificacion: codigo,
        codigoVerificacionExpiraEn: expiraEn,
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

    await enviarCodigoSMS(telefonoNormalizado, codigo);

    return res.status(201).json({
      ok: true,
      message: "Te hemos enviado un código por SMS para verificar tu teléfono",
      taxistaId: taxista.id,
      telefono: taxista.telefono,
    });
  } catch (error) {
    console.error("Error /auth/register:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

router.post("/verify-phone", async (req, res) => {
  try {
    const { telefono, codigo } = req.body;

    if (!telefono || !codigo) {
      return res.status(400).json({
        error: "Faltan teléfono o código",
      });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
      include: { vehiculo: true },
    });

    if (!taxista) {
      return res.status(404).json({
        error: "Taxista no encontrado",
      });
    }

    if (taxista.telefonoVerificado) {
      return res.json({
        ok: true,
        message: "El teléfono ya estaba verificado",
        taxista: {
          id: taxista.id,
          nombreCompleto: taxista.nombreCompleto,
          telefono: taxista.telefono,
          estado: taxista.estado,
          vehiculo: taxista.vehiculo,
        },
      });
    }

    if (!taxista.codigoVerificacion || !taxista.codigoVerificacionExpiraEn) {
      return res.status(400).json({
        error: "No hay ningún código activo para este teléfono",
      });
    }

    if (new Date() > new Date(taxista.codigoVerificacionExpiraEn)) {
      return res.status(400).json({
        error: "El código ha expirado",
      });
    }

    if (taxista.codigoVerificacion !== codigo.trim()) {
      return res.status(400).json({
        error: "Código incorrecto",
      });
    }

    const taxistaActualizado = await prisma.taxista.update({
      where: { id: taxista.id },
      data: {
        telefonoVerificado: true,
        codigoVerificacion: null,
        codigoVerificacionExpiraEn: null,
      },
      include: {
        vehiculo: true,
      },
    });

    return res.json({
      ok: true,
      message: "Teléfono verificado correctamente",
      taxista: {
        id: taxistaActualizado.id,
        nombreCompleto: taxistaActualizado.nombreCompleto,
        telefono: taxistaActualizado.telefono,
        estado: taxistaActualizado.estado,
        vehiculo: taxistaActualizado.vehiculo,
      },
    });
  } catch (error) {
    console.error("Error /auth/verify-phone:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

router.post("/resend-code", async (req, res) => {
  try {
    const { telefono } = req.body;

    if (!telefono) {
      return res.status(400).json({
        error: "Falta el teléfono",
      });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
    });

    if (!taxista) {
      return res.status(404).json({
        error: "Taxista no encontrado",
      });
    }

    if (taxista.telefonoVerificado) {
      return res.status(400).json({
        error: "Este teléfono ya está verificado",
      });
    }

    const codigo = generarCodigo();
    const expiraEn = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.taxista.update({
      where: { id: taxista.id },
      data: {
        codigoVerificacion: codigo,
        codigoVerificacionExpiraEn: expiraEn,
      },
    });

    await enviarCodigoSMS(telefonoNormalizado, codigo);

    return res.json({
      ok: true,
      message: "Te hemos reenviado el código por SMS",
    });
  } catch (error) {
    console.error("Error /auth/resend-code:", error);
    return res.status(500).json({
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

    const telefonoNormalizado = normalizarTelefono(telefono);

    console.log("telefono recibido:", telefono);
    console.log("telefono normalizado:", telefonoNormalizado);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
      include: { vehiculo: true },
    });

    console.log("taxista encontrado:", taxista ? taxista.telefono : null);

    if (!taxista) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    const passwordOk = await bcrypt.compare(password, taxista.passwordHash);
    console.log("passwordOk:", passwordOk);

    if (!passwordOk) {
      return res.status(401).json({
        error: "Credenciales incorrectas",
      });
    }

    if (!taxista.telefonoVerificado) {
      return res.status(403).json({
        error: "Debes verificar tu teléfono antes de iniciar sesión",
        requiresVerification: true,
        telefono: taxista.telefono,
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

router.post("/login", async (req, res) => {
  try {
    const { telefono, password } = req.body;

    if (!telefono || !password) {
      return res.status(400).json({
        error: "Faltan teléfono o contraseña",
      });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
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

    if (!taxista.telefonoVerificado) {
      return res.status(403).json({
        error: "Debes verificar tu teléfono antes de iniciar sesión",
        requiresVerification: true,
        telefono: taxista.telefono,
      });
    }

    return res.json({
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
    console.error("Error /auth/login:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;