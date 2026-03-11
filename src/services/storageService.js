const fs = require("fs");
const path = require("path");

function getFilePath(nombreArchivo) {
  return path.join(process.cwd(), nombreArchivo);
}

function leerJsonArray(nombreArchivo) {
  const filePath = getFilePath(nombreArchivo);

  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error(`Error leyendo ${nombreArchivo}:`, error.message);
    return [];
  }
}

function guardarJsonArray(nombreArchivo, data) {
  const filePath = getFilePath(nombreArchivo);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`✅ Guardado ${nombreArchivo} en ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error guardando ${nombreArchivo}:`, error.message);
    return false;
  }
}

module.exports = {
  leerJsonArray,
  guardarJsonArray,
};