const express = require("express");
const bcrypt = require("bcrypt");
const twilio = require("twilio");
const prisma = require("../services/bd");
const { firmarTokenTaxista } = require("../services/authToken");
const {
  twilioAccountSid,
  twilioAuthToken,
  twilioPhoneNumber,
} = require("../configSoloTwilio");

const rateLimit = require("express-rate-limit");

const router = express.Router();

/* -------------------- RATE LIMIT -------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos, prueba más tarde" },
});

const smsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: "Demasiados SMS enviados, espera unos minutos" },
});

router.use("/login", loginLimiter);
router.use("/resend-code", smsLimiter);
router.use("/register", smsLimiter);

/* -------------------- TWILIO -------------------- */

const twilioClient =
  twilioAccountSid && twilioAuthToken
    ? twilio(twilioAccountSid, twilioAuthToken)
    : null;

/* -------------------- UTILIDADES -------------------- */

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
    throw new Error("Twilio no configurado");
  }

  await twilioClient.messages.create({
    body: `Tu código de verificación es: ${codigo}`,
    from: twilioPhoneNumber,
    to: telefono,
  });
}

/* -------------------- REGISTER -------------------- */

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

    if (password.length < 6) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres",
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
        ultimoEnvioCodigo: new Date(),
        vehiculo: {
          create: {
            numeroTaxi,
            matricula: matricula || null,
            modelo: modelo || null,
            color: color || null,
          },
        },
      },
      include: { vehiculo: true },
    });

    await enviarCodigoSMS(telefonoNormalizado, codigo);

    return res.status(201).json({
      ok: true,
      message: "Te hemos enviado un código por SMS para verificar tu teléfono",
      telefono: taxista.telefono,
    });
  } catch (error) {
    console.error("Error /auth/register:", error);
    return res.status(500).json({
      error: "Error interno",
    });
  }
});

/* -------------------- VERIFY PHONE -------------------- */

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
        message: "Teléfono ya verificado",
      });
    }

    if (
      !taxista.codigoVerificacion ||
      new Date() > new Date(taxista.codigoVerificacionExpiraEn)
    ) {
      return res.status(400).json({
        error: "Código expirado",
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
      include: { vehiculo: true },
    });

    const token = firmarTokenTaxista(taxistaActualizado);

    return res.json({
      ok: true,
      token,
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
    return res.status(500).json({ error: "Error interno" });
  }
});

/* -------------------- RESEND CODE -------------------- */

router.post("/resend-code", async (req, res) => {
  try {
    const { telefono } = req.body;

    if (!telefono) {
      return res.status(400).json({ error: "Falta el teléfono" });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
    });

    if (!taxista) {
      return res.status(404).json({ error: "Taxista no encontrado" });
    }

    if (taxista.telefonoVerificado) {
      return res.status(400).json({
        error: "Este teléfono ya está verificado",
      });
    }

    /* evitar spam de SMS */
    if (
      taxista.ultimoEnvioCodigo &&
      Date.now() - new Date(taxista.ultimoEnvioCodigo).getTime() < 60000
    ) {
      return res.status(429).json({
        error: "Espera un minuto antes de pedir otro código",
      });
    }

    const codigo = generarCodigo();
    const expiraEn = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.taxista.update({
      where: { id: taxista.id },
      data: {
        codigoVerificacion: codigo,
        codigoVerificacionExpiraEn: expiraEn,
        ultimoEnvioCodigo: new Date(),
      },
    });

    await enviarCodigoSMS(telefonoNormalizado, codigo);

    return res.json({
      ok: true,
      message: "Te hemos reenviado el código por SMS",
    });
  } catch (error) {
    console.error("Error /auth/resend-code:", error);
    return res.status(500).json({ error: "Error interno" });
  }
});

/* -------------------- LOGIN -------------------- */

router.post("/login", async (req, res) => {
  try {
    const { telefono, password } = req.body;

    if (!telefono || !password) {
      return res.status(400).json({
        error: "Credenciales incorrectas",
      });
    }

    const telefonoNormalizado = normalizarTelefono(telefono);

    const taxista = await prisma.taxista.findUnique({
      where: { telefono: telefonoNormalizado },
      include: { vehiculo: true },
    });

    /* evitar enumeración de usuarios */
    if (!taxista) {
      await bcrypt.compare(password, "$2b$10$invalidhashforsecurity");
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

    const token = firmarTokenTaxista(taxista);

    return res.json({
      ok: true,
      token,
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
    return res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;