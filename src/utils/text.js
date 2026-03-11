function normalizarTexto(texto = "") {
  return texto.toLowerCase().trim();
}

function esConfirmacion(texto = "") {
  const t = normalizarTexto(texto);
  return [
    "sí",
    "si",
    "correcto",
    "correcta",
    "es correcto",
    "es correcta",
    "exacto",
    "exacta",
    "vale",
    "de acuerdo",
    "afirmativo",
  ].some((x) => t === x || t.includes(x));
}

function esNegacion(texto = "") {
  const t = normalizarTexto(texto);
  return [
    "no",
    "incorrecto",
    "incorrecta",
    "no es correcto",
    "no es correcta",
    "está mal",
    "esta mal",
    "negativo",
  ].some((x) => t === x || t.includes(x));
}

module.exports = {
  normalizarTexto,
  esConfirmacion,
  esNegacion,
};