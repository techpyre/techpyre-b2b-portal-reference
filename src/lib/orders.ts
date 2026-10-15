import type {
  ApiErrorResponse,
  CartMap,
  Company,
  CompanyId,
  OrderAcceptedResponse,
  OrderRequestBody,
  OverrideMap,
  PaymentMethod,
  Permission,
  Role,
  VatRegime,
} from "@/types";
import { COMPANIES } from "@/data/companies";
import { INITIAL_STOCK, findProduct } from "@/data/catalog";
import { can, isRole, ROLES } from "@/lib/rbac";
import { computeCheckout, overrideKey } from "@/lib/checkout";

export const PAYMENT_METHODS: ReadonlyArray<{ id: PaymentMethod; label: string; detail: string; permission: Permission }> = [
  {
    id: "bonifico_60_dffm",
    label: "Bonifico 60 gg DFFM",
    detail: "SEPA Credit Transfer · scadenza a fine mese",
    permission: "payment:deferred_terms",
  },
  { id: "stripe_card", label: "Stripe · Carta aziendale", detail: "Addebito immediato con 3-D Secure", permission: "payment:stripe" },
  {
    id: "stripe_sepa_debit",
    label: "Stripe · SEPA Direct Debit B2B",
    detail: "Mandato B2B, incasso asincrono",
    permission: "payment:stripe",
  },
];

export function paymentPermission(method: PaymentMethod): Permission {
  const found = PAYMENT_METHODS.find((m) => m.id === method);
  return found ? found.permission : "payment:stripe";
}

export function isCompanyId(value: unknown): value is CompanyId {
  return value === "lario" || value === "padana";
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "bonifico_60_dffm" || value === "stripe_card" || value === "stripe_sepa_debit";
}

function isVatRegime(value: unknown): value is VatRegime {
  return value === "ordinaria" || value === "esente_art8";
}

/** Azienda su cui un ruolo può operare: i ruoli cliente sono vincolati alla propria P.IVA. */
export function resolveCompany(role: Role, requested: CompanyId | null): Company {
  const def = ROLES[role];
  if (requested && def.canSwitchCompany) return COMPANIES[requested];
  return COMPANIES[def.defaultCompanyId];
}

export type AuthorizationResult = { ok: true } | { ok: false; permission: Permission; message: string };

/** Policy di emissione ordine valutata identica su client (UX) e server (enforcement). */
export function authorizeOrder(
  role: Role,
  company: Company,
  paymentMethod: PaymentMethod,
  vatRegime: VatRegime,
  hasOverrides: boolean,
): AuthorizationResult {
  if (!can(role, "order:submit")) {
    return { ok: false, permission: "order:submit", message: `Il ruolo «${ROLES[role].label}» non può emettere ordini.` };
  }
  const payPerm = paymentPermission(paymentMethod);
  if (!can(role, payPerm)) {
    return { ok: false, permission: payPerm, message: "Modalità di pagamento non consentita per il ruolo." };
  }
  if (vatRegime === "esente_art8") {
    if (!can(role, "tax:exemption_declare")) {
      return { ok: false, permission: "tax:exemption_declare", message: "Regime di non imponibilità non dichiarabile dal ruolo." };
    }
    if (!company.intentDeclarationProtocol) {
      return {
        ok: false,
        permission: "tax:exemption_declare",
        message: "Il cliente non ha una dichiarazione d'intento registrata.",
      };
    }
  }
  if (hasOverrides && !can(role, "price:override")) {
    return { ok: false, permission: "price:override", message: "Override di listino non autorizzato per il ruolo." };
  }
  return { ok: true };
}

export function generateOrderCode(now: Date = new Date()): string {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `VLK-ORD-${now.getFullYear()}-${String(rand).padStart(6, "0")}`;
}

type ParseResult = { ok: true; body: OrderRequestBody } | { ok: false; message: string };

export function parseOrderRequest(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null) return { ok: false, message: "Corpo JSON mancante." };
  const raw = input as Record<string, unknown>;
  if (!isRole(raw.role)) return { ok: false, message: "Campo «role» non valido." };
  if (!isCompanyId(raw.companyId)) return { ok: false, message: "Campo «companyId» non valido." };
  if (!isVatRegime(raw.vatRegime)) return { ok: false, message: "Campo «vatRegime» non valido." };
  if (!isPaymentMethod(raw.paymentMethod)) return { ok: false, message: "Campo «paymentMethod» non valido." };
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > 100) {
    return { ok: false, message: "Il campo «lines» deve contenere da 1 a 100 righe." };
  }
  const lines: OrderRequestBody["lines"] = [];
  for (const entry of raw.lines as unknown[]) {
    if (typeof entry !== "object" || entry === null) return { ok: false, message: "Riga ordine non valida." };
    const line = entry as Record<string, unknown>;
    const sku = typeof line.sku === "string" ? line.sku : "";
    const quantity = typeof line.quantity === "number" ? line.quantity : NaN;
    const overrideDiscountBp = typeof line.overrideDiscountBp === "number" ? line.overrideDiscountBp : 0;
    if (!findProduct(sku)) return { ok: false, message: `SKU sconosciuto: ${sku || "(vuoto)"}.` };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
      return { ok: false, message: `Quantità non valida per ${sku}.` };
    }
    if (!Number.isInteger(overrideDiscountBp) || overrideDiscountBp < 0) {
      return { ok: false, message: `Override non valido per ${sku}.` };
    }
    lines.push({ sku, quantity, overrideDiscountBp });
  }
  return {
    ok: true,
    body: { role: raw.role, companyId: raw.companyId, vatRegime: raw.vatRegime, paymentMethod: raw.paymentMethod, lines },
  };
}

export type OrderProcessingResult =
  | { httpStatus: 201; body: OrderAcceptedResponse }
  | { httpStatus: 400 | 403; body: ApiErrorResponse };

/** Elaborazione server-side: autorizzazione deny-by-default e ricalcolo integrale dei prezzi. */
export function processOrder(input: unknown, idempotencyKey: string): OrderProcessingResult {
  const parsed = parseOrderRequest(input);
  if (!parsed.ok) {
    return { httpStatus: 400, body: { status: "error", error: "invalid_request", message: parsed.message } };
  }
  const { role, companyId, lines, vatRegime, paymentMethod } = parsed.body;
  const company = resolveCompany(role, companyId);
  if (company.id !== companyId) {
    return {
      httpStatus: 403,
      body: {
        status: "error",
        error: "forbidden",
        message: "Il ruolo non può operare per conto di un'altra P.IVA.",
        requiredPermission: "order:submit",
      },
    };
  }
  const hasOverrides = lines.some((l) => l.overrideDiscountBp > 0);
  const auth = authorizeOrder(role, company, paymentMethod, vatRegime, hasOverrides);
  if (!auth.ok) {
    return {
      httpStatus: 403,
      body: { status: "error", error: "forbidden", message: auth.message, requiredPermission: auth.permission },
    };
  }

  const cart: CartMap = {};
  const overrides: OverrideMap = {};
  for (const l of lines) {
    cart[l.sku] = (cart[l.sku] ?? 0) + l.quantity;
    if (l.overrideDiscountBp > 0) overrides[overrideKey(company.id, l.sku)] = l.overrideDiscountBp;
  }
  const totals = computeCheckout({ cart, company, stock: INITIAL_STOCK, overrides, vatRegime });

  return {
    httpStatus: 201,
    body: {
      status: "accepted",
      orderCode: generateOrderCode(),
      idempotencyKey,
      customerVat: company.vatNumber,
      priceListTier: company.priceListTier,
      totals: {
        taxableGoodsCents: totals.taxableGoodsCents,
        shippingCents: totals.shippingCents,
        taxableTotalCents: totals.taxableTotalCents,
        vatCents: totals.vatCents,
        stampDutyCents: totals.stampDutyCents,
        grandTotalCents: totals.grandTotalCents,
      },
      lines: totals.lines.map((l) => ({
        sku: l.product.sku,
        quantity: l.quote.quantity,
        netUnitCents: l.quote.netUnitCents,
        lineNetCents: l.quote.lineNetCents,
        volumeTier: l.quote.volumeTier.label,
      })),
    },
  };
}
