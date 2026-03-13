const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

function firmarTokenTaxista(taxista) {
  return jwt.sign(
    {
      sub: taxista.id,
      tipo: "taxista",
      telefono: taxista.telefono,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verificarToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  firmarTokenTaxista,
  verificarToken,
};