import type {
  CartMap,
  CheckoutTotals,
  Company,
  OverrideMap,
  PricedCartLine,
  Product,
  StockAllocation,
  StockMap,
  VatRegime,
} from "@/types";
import { PRICE_LIST_TIERS, SHIPPING_FEE_CENTS, VAT_STANDARD_BP } from "@/data/companies";
import { findProduct } from "@/data/catalog";
import { percentOfBp } from "@/lib/money";
import { quote } from "@/lib/pricing";

/** Imposta di bollo su fatture non imponibili IVA (art. 15 DPR 642/72). */
export const STAMP_DUTY_CENTS = 200;
export const STAMP_DUTY_THRESHOLD_CENTS = 7_747;
/** Giorni lavorativi di transfer Brescia → Bergamo per spedizione consolidata. */
export const SPLIT_TRANSFER_DAYS = 2;

export function overrideKey(companyId: string, sku: string): string {
  return `${companyId}:${sku}`;
}

/**
 * Allocazione su due magazzini: prima Bergamo (sede di spedizione), poi Brescia,
 * l'eventuale residuo va in backorder con il lead time di produzione.
 */
export function allocateStock(product: Product, requested: number, stock: StockMap): StockAllocation {
  const available = stock[product.sku] ?? { BG: 0, BS: 0 };
  const fromBG = Math.min(requested, available.BG);
  const fromBS = Math.min(requested - fromBG, available.BS);
  const backorder = requested - fromBG - fromBS;
  const status = backorder > 0 ? "backorder" : fromBS > 0 ? "split" : "single";
  const leadTimeDays = backorder > 0 ? product.leadTimeDays : fromBS > 0 ? SPLIT_TRANSFER_DAYS + 1 : 1;
  return { sku: product.sku, requested, fromBG, fromBS, backorder, status, leadTimeDays };
}

export function totalStock(stock: StockMap, sku: string): number {
  const s = stock[sku];
  return s ? s.BG + s.BS : 0;
}

export interface CheckoutInput {
  cart: CartMap;
  company: Company;
  stock: StockMap;
  overrides: OverrideMap;
  vatRegime: VatRegime;
}

/** Calcolo completo del checkout: funzione pura condivisa da client e Route Handler. */
export function computeCheckout({ cart, company, stock, overrides, vatRegime }: CheckoutInput): CheckoutTotals {
  const tier = PRICE_LIST_TIERS[company.priceListTier];
  const lines: PricedCartLine[] = [];

  for (const [sku, qty] of Object.entries(cart)) {
    const product = findProduct(sku);
    if (!product || qty <= 0) continue;
    const q = quote(product, tier, qty, overrides[overrideKey(company.id, sku)] ?? 0);
    lines.push({ product, quote: q, allocation: allocateStock(product, q.quantity, stock) });
  }

  const taxableGoodsCents = lines.reduce((acc, l) => acc + l.quote.lineNetCents, 0);
  const listTotalCents = lines.reduce((acc, l) => acc + l.quote.lineListCents, 0);
  const commissionCents = lines.reduce((acc, l) => acc + l.quote.commissionCents, 0);
  const freeShipping = lines.length === 0 || taxableGoodsCents >= company.freeShippingThresholdCents;
  const shippingCents = freeShipping ? 0 : SHIPPING_FEE_CENTS;
  const taxableTotalCents = taxableGoodsCents + shippingCents;
  const exempt = vatRegime === "esente_art8";
  const vatRateBp = exempt ? 0 : VAT_STANDARD_BP;
  const vatCents = percentOfBp(taxableTotalCents, vatRateBp);
  const stampDutyCents = exempt && taxableTotalCents > STAMP_DUTY_THRESHOLD_CENTS ? STAMP_DUTY_CENTS : 0;

  return {
    lines,
    taxableGoodsCents,
    listTotalCents,
    savingsCents: listTotalCents - taxableGoodsCents,
    shippingCents,
    freeShipping,
    taxableTotalCents,
    vatRateBp,
    vatCents,
    stampDutyCents,
    grandTotalCents: taxableTotalCents + vatCents + stampDutyCents,
    commissionCents,
    hasSplit: lines.some((l) => l.allocation.status === "split"),
    hasBackorder: lines.some((l) => l.allocation.status === "backorder"),
  };
}
