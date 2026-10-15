import type {
  CheckoutTotals,
  Company,
  Invoice,
  PaymentMethod,
  SignedWebhook,
  StripeCheckoutCompletedEvent,
  StripeEvent,
  StripeInvoiceCreatedEvent,
  StripeTaxId,
  VatRegime,
} from "@/types";
import { SUPPLIER } from "@/data/companies";

export const STRIPE_API_VERSION = "2025-09-30.clover";
/**
 * Segreto di firma della sandbox pubblica. In produzione è una variabile d'ambiente
 * (`STRIPE_WEBHOOK_SECRET`) mai esposta al client.
 */
export const SANDBOX_WEBHOOK_SECRET = "whsec_techpyre_sandbox_valkiria_7f3a9c1e5b2d4086";
/** Tolleranza massima sul timestamp della firma, come nelle librerie ufficiali Stripe. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function stripeId(prefix: string, length = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHANUM[b % ALPHANUM.length];
  return `${prefix}_${out}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 calcolato con la Web Crypto API (browser e runtime Node/Edge). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Costruisce l'header `Stripe-Signature: t=…,v1=…` sul payload `${t}.${body}`. */
export async function signPayload(payload: string, timestamp: number, secret = SANDBOX_WEBHOOK_SECRET): Promise<string> {
  const v1 = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return `t=${timestamp},v1=${v1}`;
}

export type SignatureCheck = { valid: true; timestamp: number } | { valid: false; reason: string };

/** Verifica conforme allo schema Stripe: parsing header, tolleranza temporale, confronto a tempo costante. */
export async function verifySignature(
  payload: string,
  header: string,
  secret = SANDBOX_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<SignatureCheck> {
  const parts = new Map<string, string[]>();
  for (const item of header.split(",")) {
    const [k, v] = item.split("=");
    if (!k || !v) continue;
    parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
  }
  const t = Number(parts.get("t")?.[0]);
  const signatures = parts.get("v1") ?? [];
  if (!Number.isFinite(t) || signatures.length === 0) return { valid: false, reason: "Header Stripe-Signature malformato." };
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: "Timestamp fuori tolleranza (possibile replay attack)." };
  }
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`);
  return signatures.some((s) => timingSafeEqual(s, expected))
    ? { valid: true, timestamp: t }
    : { valid: false, reason: "Firma HMAC non corrispondente." };
}

export interface StripeEventInput {
  orderCode: string;
  company: Company;
  totals: CheckoutTotals;
  paymentMethod: PaymentMethod;
  vatRegime: VatRegime;
  invoice: Invoice;
  createdSeconds: number;
  idempotencyKey: string;
}

function taxIds(company: Company): StripeTaxId[] {
  return [{ type: "eu_vat", value: company.vatNumber }];
}

export function buildStripeEvents(input: StripeEventInput): [StripeCheckoutCompletedEvent, StripeInvoiceCreatedEvent] {
  const { orderCode, company, totals, paymentMethod, vatRegime, invoice, createdSeconds, idempotencyKey } = input;
  const stripeInvoiceId = stripeId("in");
  const isCard = paymentMethod === "stripe_card";
  const taxExempt = vatRegime === "esente_art8" ? "exempt" : "none";
  const metadata: Record<string, string> = {
    order_code: orderCode,
    customer_vat: company.vatNumber,
    sdi_recipient_code: company.sdiRecipientCode,
    price_list_tier: company.priceListTier,
    vat_regime: vatRegime,
    invoice_number: invoice.number,
  };
  if (vatRegime === "esente_art8" && company.intentDeclarationProtocol) {
    metadata.intent_declaration_protocol = company.intentDeclarationProtocol;
  }

  const session: StripeCheckoutCompletedEvent = {
    id: stripeId("evt"),
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: createdSeconds,
    data: {
      object: {
        id: stripeId("cs_test", 58),
        object: "checkout.session",
        amount_subtotal: totals.taxableGoodsCents,
        amount_total: totals.grandTotalCents,
        created: createdSeconds - 4,
        currency: "eur",
        customer: company.stripeCustomerId,
        customer_details: {
          address: {
            city: company.address.city,
            country: company.address.country,
            line1: company.address.street,
            line2: null,
            postal_code: company.address.postalCode,
            state: company.address.province,
          },
          email: company.email,
          name: company.legalName,
          phone: null,
          tax_exempt: taxExempt,
          tax_ids: taxIds(company),
        },
        invoice: stripeInvoiceId,
        livemode: false,
        metadata,
        mode: "payment",
        payment_intent: paymentMethod === "bonifico_60_dffm" ? null : stripeId("pi"),
        payment_method_types:
          paymentMethod === "stripe_card" ? ["card"] : paymentMethod === "stripe_sepa_debit" ? ["sepa_debit"] : ["customer_balance"],
        payment_status: isCard ? "paid" : "unpaid",
        status: "complete",
        total_details: {
          amount_discount: totals.savingsCents,
          amount_shipping: totals.shippingCents,
          amount_tax: totals.vatCents,
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: stripeId("req", 14), idempotency_key: idempotencyKey },
    type: "checkout.session.completed",
  };

  const dueSeconds = Math.floor(new Date(`${invoice.dueDate}T23:59:59+01:00`).getTime() / 1000);
  const invoiceEvent: StripeInvoiceCreatedEvent = {
    id: stripeId("evt"),
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: createdSeconds + 1,
    data: {
      object: {
        id: stripeInvoiceId,
        object: "invoice",
        account_country: "IT",
        account_name: SUPPLIER.legalName,
        amount_due: totals.grandTotalCents,
        amount_paid: isCard ? totals.grandTotalCents : 0,
        collection_method: paymentMethod === "bonifico_60_dffm" ? "send_invoice" : "charge_automatically",
        created: createdSeconds + 1,
        currency: "eur",
        customer: company.stripeCustomerId,
        customer_name: company.legalName,
        customer_tax_exempt: taxExempt,
        customer_tax_ids: taxIds(company),
        due_date: paymentMethod === "bonifico_60_dffm" ? dueSeconds : null,
        footer:
          vatRegime === "esente_art8"
            ? `Operazione non imponibile art. 8 c.1 lett. c) DPR 633/72 — Dich. d'intento prot. ${company.intentDeclarationProtocol ?? ""}`
            : null,
        lines: {
          object: "list",
          data: totals.lines.map((l) => ({
            id: stripeId("il"),
            object: "line_item" as const,
            amount: l.quote.lineNetCents,
            currency: "eur" as const,
            description: `${l.product.sku} · ${l.product.name}`,
            quantity: l.quote.quantity,
            metadata: { volume_tier: l.quote.volumeTier.label, unit_net_cents: String(l.quote.netUnitCents) },
          })),
          has_more: false,
          url: `/v1/invoices/${stripeInvoiceId}/lines`,
        },
        livemode: false,
        metadata,
        number: invoice.number,
        status: "draft",
        subtotal: totals.taxableTotalCents,
        tax: totals.vatCents,
        total: totals.grandTotalCents,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "invoice.created",
  };

  return [session, invoiceEvent];
}

export async function signEvent(event: StripeEvent, timestamp: number): Promise<SignedWebhook> {
  const payload = JSON.stringify(event, null, 2);
  const signatureHeader = await signPayload(payload, timestamp);
  const check = await verifySignature(payload, signatureHeader, SANDBOX_WEBHOOK_SECRET, timestamp);
  return { event, payload, signatureHeader, timestamp, verified: check.valid };
}
