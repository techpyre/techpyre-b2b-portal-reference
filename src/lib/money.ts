/**
 * Aritmetica monetaria in centesimi interi.
 * Nessun calcolo intermedio in virgola mobile sugli importi: ogni sconto è
 * espresso in basis point e arrotondato al centesimo (half-up) una sola volta.
 */

const BP_SCALE = 10_000;

/** Applica uno sconto in basis point a un importo in centesimi, arrotondando half-up. */
export function applyDiscountBp(amountCents: number, discountBp: number): number {
  if (!Number.isInteger(amountCents) || !Number.isInteger(discountBp)) {
    throw new RangeError("Importo e sconto devono essere interi (centesimi / basis point).");
  }
  const numerator = amountCents * (BP_SCALE - discountBp);
  return Math.floor((numerator + BP_SCALE / 2) / BP_SCALE);
}

/** Calcola una percentuale (in bp) di un importo, arrotondando half-up. */
export function percentOfBp(amountCents: number, rateBp: number): number {
  return Math.floor((amountCents * rateBp + BP_SCALE / 2) / BP_SCALE);
}

/** Rapporto `part / whole` in basis point (es. margine percentuale). */
export function ratioBp(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part * BP_SCALE) / whole);
}

const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const PCT = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatEUR(cents: number): string {
  return EUR.format(cents / 100);
}

export function formatBp(bp: number): string {
  return `${PCT.format(bp / 100)}%`;
}

/** Importo in formato FatturaPA / API: punto decimale, due cifre, nessun separatore migliaia. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
