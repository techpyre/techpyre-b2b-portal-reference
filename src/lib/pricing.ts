import type { OverrideValidation, PriceListTier, PriceQuote, Product, VolumeTier } from "@/types";
import { applyDiscountBp, percentOfBp, ratioBp } from "@/lib/money";

/** Sconto extra massimo concedibile dall'agente sopra contratto e scaglione. */
export const MAX_OVERRIDE_BP = 1_200;
/** Margine industriale minimo sotto cui l'override viene rifiutato. */
export const MIN_MARGIN_BP = 2_500;

/** Fasce provvigionali dell'agente in funzione del margine di riga. */
export const COMMISSION_BANDS: ReadonlyArray<{ minMarginBp: number; rateBp: number; label: string }> = [
  { minMarginBp: 4_500, rateBp: 600, label: "Margine ≥ 45% → provvigione 6%" },
  { minMarginBp: 3_500, rateBp: 450, label: "Margine ≥ 35% → provvigione 4,5%" },
  { minMarginBp: 0, rateBp: 250, label: "Margine < 35% → provvigione 2,5%" },
];

export function volumeTierFor(tier: PriceListTier, quantity: number): VolumeTier {
  const match = tier.volumeTiers.find(
    (t) => quantity >= t.minQty && (t.maxQty === null || quantity <= t.maxQty),
  );
  return match ?? tier.volumeTiers[0];
}

export function commissionRateFor(marginBp: number): number {
  const band = COMMISSION_BANDS.find((b) => marginBp >= b.minMarginBp);
  return band ? band.rateBp : 0;
}

function unitBeforeOverride(product: Product, tier: PriceListTier, quantity: number): number {
  const volumeTier = volumeTierFor(tier, quantity);
  const factor = (1 - tier.contractDiscountBp / 10_000) * (1 - volumeTier.discountBp / 10_000);
  return product.listPriceCents * factor;
}

/**
 * Valida uno sconto extra richiesto dall'agente: intero, entro il tetto
 * contrattuale e tale da preservare il margine industriale minimo.
 */
export function validateOverride(
  product: Product,
  tier: PriceListTier,
  quantity: number,
  overrideDiscountBp: number,
): OverrideValidation {
  if (!Number.isInteger(overrideDiscountBp) || overrideDiscountBp < 0) {
    return { valid: false, reason: "Lo sconto extra deve essere un valore positivo." };
  }
  if (overrideDiscountBp > MAX_OVERRIDE_BP) {
    return { valid: false, reason: `Sconto extra oltre il tetto consentito (${MAX_OVERRIDE_BP / 100}%).` };
  }
  const volumeTier = volumeTierFor(tier, quantity);
  const factor =
    (1 - tier.contractDiscountBp / 10_000) *
    (1 - volumeTier.discountBp / 10_000) *
    (1 - overrideDiscountBp / 10_000);
  const exactNetUnitCents = product.listPriceCents * factor;
  const netUnitCents = Math.round(exactNetUnitCents);
  const marginBp = ratioBp(netUnitCents - product.industrialCostCents, netUnitCents);
  if (marginBp < MIN_MARGIN_BP) {
    return {
      valid: false,
      reason: `Margine ${(marginBp / 100).toFixed(1).replace(".", ",")}% sotto il minimo del ${MIN_MARGIN_BP / 100}%.`,
    };
  }
  return { valid: true, netUnitCents, marginBp };
}

/**
 * Pricing engine B2B puro: sconti a cascata (composti).
 * Moltiplicatore = (1 - scontoContratto) × (1 - scontoVolume) × (1 - scontoOverride).
 * I prezzi unitari intermedi non subiscono arrotondamenti prematuri che falserebbero
 * i totali di riga su quantitativi industriali (es. 60 pz × 5,202 € = 312,12 €).
 * Il totale di riga è calcolato come `roundToCents(prezzoUnitarioEsatto × quantità)`
 * in piena conformità con le specifiche tecniche FatturaPA SDI.
 */
export function quote(
  product: Product,
  tier: PriceListTier,
  quantity: number,
  requestedOverrideBp = 0,
): PriceQuote {
  const qty = Math.max(1, Math.floor(quantity));
  const volumeTier = volumeTierFor(tier, qty);
  const contractUnitCents = applyDiscountBp(product.listPriceCents, tier.contractDiscountBp);
  const validation = requestedOverrideBp > 0 ? validateOverride(product, tier, qty, requestedOverrideBp) : null;
  const overrideDiscountBp = validation?.valid ? requestedOverrideBp : 0;

  const compoundMultiplier =
    (1 - tier.contractDiscountBp / 10_000) *
    (1 - volumeTier.discountBp / 10_000) *
    (1 - overrideDiscountBp / 10_000);
  const compoundDiscountBp = Math.round((1 - compoundMultiplier) * 10_000);

  const exactNetUnitPriceCents = product.listPriceCents * compoundMultiplier;
  const netUnitCents = Math.round(exactNetUnitPriceCents);
  const lineListCents = product.listPriceCents * qty;
  const lineNetCents = Math.round(exactNetUnitPriceCents * qty);

  const marginBp = ratioBp(netUnitCents - product.industrialCostCents, netUnitCents);
  const commissionRateBp = commissionRateFor(marginBp);

  return {
    sku: product.sku,
    quantity: qty,
    priceListTier: tier.id,
    listUnitCents: product.listPriceCents,
    contractDiscountBp: tier.contractDiscountBp,
    contractUnitCents,
    volumeTier,
    overrideDiscountBp,
    compoundDiscountBp,
    exactNetUnitPriceCents,
    netUnitCents,
    lineListCents,
    lineNetCents,
    savingsCents: lineListCents - lineNetCents,
    costUnitCents: product.industrialCostCents,
    marginBp,
    commissionRateBp,
    commissionCents: percentOfBp(lineNetCents, commissionRateBp),
  };
}
