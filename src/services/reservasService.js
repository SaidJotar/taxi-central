const MINIMO_ANTELACION_MS =
  60 * 60 * 1000;


/*
 * Devuelve la hora local de Ceuta.
 *
 * Ceuta utiliza el mismo horario peninsular:
 * Europe/Madrid.
 */
function obtenerHoraCeuta(fecha) {
  const partes =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        hourCycle: "h23",
      }
    ).formatToParts(fecha);

  const parteHora =
    partes.find(
      (parte) =>
        parte.type === "hour"
    );

  return Number(
    parteHora?.value
  );
}


/*
 * Valida que sea una fecha futura
 * con al menos una hora de antelación.
 */
function validarAntelacionReserva(
  fechaHora
) {
  const fecha =
    fechaHora instanceof Date
      ? fechaHora
      : new Date(fechaHora);

  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {
    throw new Error(
      "La fecha de la reserva no es válida."
    );
  }

  const minimo =
    Date.now() +
    MINIMO_ANTELACION_MS;

  if (
    fecha.getTime() <
    minimo
  ) {
    throw new Error(
      "La reserva debe realizarse con al menos 1 hora de antelación."
    );
  }

  return fecha;
}


/*
 * HORARIO:
 *
 * 05:00 - 20:59 -> 10 €
 * 21:00 - 04:59 -> 15 €
 */
function calcularPrecioReserva(
  fechaHora
) {
  const fecha =
    validarAntelacionReserva(
      fechaHora
    );

  const hora =
    obtenerHoraCeuta(
      fecha
    );

  const nocturna =
    hora >= 21 ||
    hora < 5;

  return {
    fechaHora: fecha,

    precioFinal:
      nocturna
        ? 15
        : 10,

    tipoTarifa:
      nocturna
        ? "nocturna"
        : "diurna",
  };
}


module.exports = {
  MINIMO_ANTELACION_MS,
  validarAntelacionReserva,
  calcularPrecioReserva,
};