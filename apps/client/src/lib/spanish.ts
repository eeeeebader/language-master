/**
 * Spanish number, time and date wording for the interactive lecture widgets, with the German
 * reading next to it so the learner sees both.
 */

const UNITS = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidós",
  "veintitrés",
  "veinticuatro",
  "veinticinco",
  "veintiséis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const TENS = [
  "",
  "",
  "",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const HUNDREDS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function below1000(n: number): string {
  if (n < 30) return UNITS[n] as string;
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)] as string;
    const u = n % 10;
    return u ? `${t} y ${UNITS[u]}` : t;
  }
  if (n === 100) return "cien";
  const h = HUNDREDS[Math.floor(n / 100)] as string;
  const rest = n % 100;
  return rest ? `${h} ${below1000(rest)}` : h;
}

/** 0 … 999 999 999 in words; negatives get "menos". Decimals: "coma". */
export function numberToSpanish(n: number): string {
  if (!Number.isFinite(n)) return "…";
  if (n < 0) return `menos ${numberToSpanish(-n)}`;
  if (!Number.isInteger(n)) {
    const [int, frac] = n.toFixed(2).replace(/0+$/, "").split(".");
    return `${numberToSpanish(Number(int))} coma ${(frac ?? "")
      .split("")
      .map((d) => UNITS[Number(d)])
      .join(" ")}`;
  }
  if (n < 1000) return below1000(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = th === 1 ? "mil" : `${below1000(th)} mil`;
    return rest ? `${head} ${below1000(rest)}` : head;
  }
  const m = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const head = m === 1 ? "un millón" : `${below1000(m)} millones`;
  return rest ? `${head} ${numberToSpanish(rest)}` : head;
}

/** Hour word in feminine (la una, las dos …). */
function hourWord(h12: number): string {
  return h12 === 1 ? "una" : (UNITS[h12] as string);
}

/** "Son las tres y cuarto" style, plus the German reading. */
export function timeToSpanish(hour: number, minute: number): { es: string; de: string } {
  const h = ((hour % 24) + 24) % 24;
  const m = ((minute % 60) + 60) % 60;
  // Past 30 minutes Spanish counts back from the next hour.
  const toNext = m > 30;
  const baseH = toNext ? (h + 1) % 24 : h;
  const h12 = baseH % 12 === 0 ? 12 : baseH % 12;
  const es1 = h12 === 1 ? "Es la" : "Son las";
  let minutes = "";
  if (m === 0) minutes = "";
  else if (m === 15) minutes = " y cuarto";
  else if (m === 30) minutes = " y media";
  else if (m === 45) minutes = " menos cuarto";
  else if (toNext) minutes = ` menos ${numberToSpanish(60 - m)}`;
  else minutes = ` y ${numberToSpanish(m)}`;
  const part =
    baseH < 6
      ? " de la noche"
      : baseH < 12
        ? " de la mañana"
        : baseH < 20
          ? " de la tarde"
          : " de la noche";
  const es = `${es1} ${hourWord(h12)}${minutes}${h12 === 12 && m === 0 ? (baseH === 12 ? " del mediodía" : " de la noche") : part}.`;

  const deH = (x: number) => (x % 12 === 0 ? 12 : x % 12);
  let de: string;
  if (m === 0) de = `Es ist ${deH(h)} Uhr.`;
  else if (m === 15) de = `Es ist Viertel nach ${deH(h)}.`;
  else if (m === 30) de = `Es ist halb ${deH(h + 1)}.`;
  else if (m === 45) de = `Es ist Viertel vor ${deH(h + 1)}.`;
  else if (m > 30) de = `Es ist ${60 - m} vor ${deH(h + 1)}.`;
  else de = `Es ist ${m} nach ${deH(h)}.`;
  return { es, de: `${de} (${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")})` };
}

export const DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const DAYS_DE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
export const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** "el viernes, veintiuno de noviembre de dos mil veinticinco" plus German. */
export function dateToSpanish(d: Date): { es: string; de: string } {
  const dow = (d.getDay() + 6) % 7; // Monday first
  const day = d.getDate();
  const dayEs = day === 1 ? "primero" : numberToSpanish(day);
  const es = `el ${DAYS_ES[dow]}, ${dayEs} de ${MONTHS_ES[d.getMonth()]} de ${numberToSpanish(d.getFullYear())}`;
  const de = `${DAYS_DE[dow]}, der ${day}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
  return { es, de };
}
