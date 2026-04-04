const { verificarToken } = require("../services/authToken");
const prisma = require("../services/bd");

async function authTaxista(req, res, next) {
  try {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const token = auth.slice(7);
    const payload = verificarToken(token);

    if (!payload?.sub || payload?.tipo !== "taxista") {
      return res.status(401).json({ error: "No autorizado" });
    }

    const taxista = await prisma.taxista.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        telefono: true,
        sessionVersion: true,
      },
    });

    if (!taxista) {
      return res.status(401).json({ error: "No autorizado" });
    }

    if ((payload.sessionVersion ?? 1) !== taxista.sessionVersion) {
      return res.status(401).json({ error: "Sesión invalidada" });
    }

    req.taxistaAuth = {
      taxistaId: taxista.id,
      telefono: taxista.telefono,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "No autorizado" });
  }
}

module.exports = authTaxista;