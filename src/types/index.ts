/**
 * Tipi di dominio del portale B2B Valkiria Fluidodinamica S.r.l. (azienda fittizia).
 * Convenzioni:
 * - importi monetari in centesimi di euro interi (`*Cents`), mai float;
 * - percentuali in basis point (`*Bp`, 100 bp = 1%).
 */

/* ------------------------------------------------------------------ */
/* RBAC                                                                */
/* ------------------------------------------------------------------ */

export type Role = "buyer" | "tier1" | "agent" | "admin";

export type Permission =
  | "catalog:read"
  | "price:view_contract"
  | "price:view_cost"
  | "price:view_margin"
  | "price:override"
  | "cart:edit"
  | "order:submit"
  | "payment:stripe"
  | "payment:deferred_terms"
  | "tax:exemption_declare"
  | "invoice:read"
  | "invoice:export_xml"
  | "webhook:read_log"
  | "webhook:replay"
  | "architecture:inspect";

export interface RoleDefinition {
  id: Role;
  label: string;
  shortLabel: string;
  description: string;
  /** Cliente su cui opera il ruolo per impostazione predefinita. */
  defaultCompanyId: CompanyId;
  /** Il ruolo può operare per conto di più clienti (agente, amministrazione). */
  canSwitchCompany: boolean;
}

export interface PermissionDefinition {
  id: Permission;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Anagrafiche e contratti                                             */
/* ------------------------------------------------------------------ */

export type ContractTierId = "OFFERTA_BASE" | "CONTRATTO_QUADRO";

export interface VolumeTier {
  id: string;
  minQty: number;
  /** `null` = scaglione aperto (es. 50+). */
  maxQty: number | null;
  /** Sconto extra applicato in cascata al prezzo netto da contratto. */
  discountBp: number;
  label: string;
}

export interface PriceListTier {
  id: ContractTierId;
  label: string;
  contractCode: string;
  contractDiscountBp: number;
  volumeTiers: VolumeTier[];
}

export type CompanyId = "lario" | "padana";

export interface PostalAddress {
  street: string;
  postalCode: string;
  city: string;
  province: string;
  country: "IT";
}

export interface Company {
  id: CompanyId;
  legalName: string;
  vatNumber: string;
  sdiRecipientCode: string;
  pec: string;
  email: string;
  address: PostalAddress;
  priceListTier: ContractTierId;
  freeShippingThresholdCents: number;
  /** Protocollo telematico della dichiarazione d'intento, se presente. */
  intentDeclarationProtocol: string | null;
  stripeCustomerId: string;
}

/* ------------------------------------------------------------------ */
/* Catalogo                                                            */
/* ------------------------------------------------------------------ */

export type ProductCategory =
  | "Valvole direzionali"
  | "Valvole proporzionali"
  | "Valvole di pressione"
  | "Pompe"
  | "Attuatori"
  | "Strumentazione"
  | "Accumulatori"
  | "Filtrazione"
  | "Raccorderia"
  | "Tubi flessibili"
  | "Centraline"
  | "Scambiatori";

export type Warehouse = "BG" | "BS";

export interface Product {
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  maxPressureBar: number;
  /** Portata nominale in L/min; `null` per componenti non soggetti a portata. */
  flowLpm: number | null;
  tempMinC: number;
  tempMaxC: number;
  weightKg: number;
  listPriceCents: number;
  industrialCostCents: number;
  /** Lead time di produzione/riordino in giorni lavorativi. */
  leadTimeDays: number;
  certifications: string[];
}

export type StockMap = Record<string, Record<Warehouse, number>>;

export type AvailabilityFilter = "all" | "in_stock" | "on_order";

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export type OverrideValidation =
  | { valid: true; netUnitCents: number; marginBp: number }
  | { valid: false; reason: string };

export interface PriceQuote {
  sku: string;
  quantity: number;
  priceListTier: ContractTierId;
  listUnitCents: number;
  contractDiscountBp: number;
  contractUnitCents: number;
  volumeTier: VolumeTier;
  /** Sconto extra concesso dall'agente (override), già validato. */
  overrideDiscountBp: number;
  /** Sconto a cascata totale combinato in basis point: (1 - (1-d1)*(1-d2)*(1-d3))*10000. */
  compoundDiscountBp: number;
  /** Prezzo unitario netto prima dell'arrotondamento di riga (fino a frazioni di centesimo). */
  exactNetUnitPriceCents: number;
  netUnitCents: number;
  lineListCents: number;
  lineNetCents: number;
  savingsCents: number;
  costUnitCents: number;
  marginBp: number;
  commissionRateBp: number;
  commissionCents: number;
}

/* ------------------------------------------------------------------ */
/* Carrello e checkout                                                 */
/* ------------------------------------------------------------------ */

export type CartMap = Record<string, number>;
export type OverrideMap = Record<string, number>;

export type VatRegime = "ordinaria" | "esente_art8";

export type PaymentMethod = "bonifico_60_dffm" | "stripe_card" | "stripe_sepa_debit";

export type AllocationStatus = "single" | "split" | "backorder";

export interface StockAllocation {
  sku: string;
  requested: number;
  fromBG: number;
  fromBS: number;
  backorder: number;
  status: AllocationStatus;
  leadTimeDays: number;
}

export interface PricedCartLine {
  product: Product;
  quote: PriceQuote;
  allocation: StockAllocation;
}

export interface CheckoutTotals {
  lines: PricedCartLine[];
  taxableGoodsCents: number;
  listTotalCents: number;
  savingsCents: number;
  shippingCents: number;
  freeShipping: boolean;
  taxableTotalCents: number;
  vatRateBp: number;
  vatCents: number;
  /** Imposta di bollo (2,00 €) su fatture non imponibili sopra 77,47 €, addebitata in rivalsa. */
  stampDutyCents: number;
  grandTotalCents: number;
  commissionCents: number;
  hasSplit: boolean;
  hasBackorder: boolean;
}

/* ------------------------------------------------------------------ */
/* Fatturazione elettronica SDI                                        */
/* ------------------------------------------------------------------ */

export type SdiStatus = "RC_CONSEGNATA" | "IN_ELABORAZIONE";

export interface InvoiceLine {
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  orderCode: string;
  customer: Company;
  lines: InvoiceLine[];
  shippingCents: number;
  taxableCents: number;
  vatRegime: VatRegime;
  vatCents: number;
  stampDutyCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  sdiStatus: SdiStatus;
  sdiIdentifier: string;
  sdiFileName: string;
  progressivoInvio: string;
}

/* ------------------------------------------------------------------ */
/* Stripe (sottoinsieme fedele dell'API, modalità test)                */
/* ------------------------------------------------------------------ */

export interface StripeTaxId {
  type: "eu_vat";
  value: string;
}

export interface StripeAddress {
  city: string;
  country: string;
  line1: string;
  line2: string | null;
  postal_code: string;
  state: string;
}

export interface StripeCheckoutSession {
  id: string;
  object: "checkout.session";
  amount_subtotal: number;
  amount_total: number;
  created: number;
  currency: "eur";
  customer: string;
  customer_details: {
    address: StripeAddress;
    email: string;
    name: string;
    phone: string | null;
    tax_exempt: "none" | "exempt" | "reverse";
    tax_ids: StripeTaxId[];
  };
  invoice: string;
  livemode: false;
  metadata: Record<string, string>;
  mode: "payment";
  payment_intent: string | null;
  payment_method_types: Array<"card" | "sepa_debit" | "customer_balance">;
  payment_status: "paid" | "unpaid";
  status: "complete";
  total_details: {
    amount_discount: number;
    amount_shipping: number;
    amount_tax: number;
  };
}

export interface StripeInvoiceLineItem {
  id: string;
  object: "line_item";
  amount: number;
  currency: "eur";
  description: string;
  quantity: number;
  metadata: Record<string, string>;
}

export interface StripeInvoice {
  id: string;
  object: "invoice";
  account_country: "IT";
  account_name: string;
  amount_due: number;
  amount_paid: number;
  collection_method: "charge_automatically" | "send_invoice";
  created: number;
  currency: "eur";
  customer: string;
  customer_name: string;
  customer_tax_exempt: "none" | "exempt" | "reverse";
  customer_tax_ids: StripeTaxId[];
  due_date: number | null;
  footer: string | null;
  lines: {
    object: "list";
    data: StripeInvoiceLineItem[];
    has_more: false;
    url: string;
  };
  livemode: false;
  metadata: Record<string, string>;
  number: string;
  status: "draft";
  subtotal: number;
  tax: number;
  total: number;
}

export type StripeEventType = "checkout.session.completed" | "invoice.created";

interface StripeEventBase<T extends StripeEventType, O> {
  id: string;
  object: "event";
  api_version: string;
  created: number;
  data: { object: O };
  livemode: false;
  pending_webhooks: number;
  request: { id: string | null; idempotency_key: string | null };
  type: T;
}

export type StripeCheckoutCompletedEvent = StripeEventBase<"checkout.session.completed", StripeCheckoutSession>;
export type StripeInvoiceCreatedEvent = StripeEventBase<"invoice.created", StripeInvoice>;
export type StripeEvent = StripeCheckoutCompletedEvent | StripeInvoiceCreatedEvent;

export interface SignedWebhook {
  event: StripeEvent;
  payload: string;
  signatureHeader: string;
  timestamp: number;
  verified: boolean;
}

export type WebhookOutcome = "processed" | "duplicate_ignored";

export interface WebhookLogEntry {
  id: string;
  eventId: string;
  type: StripeEventType;
  receivedAt: string;
  httpStatus: 200;
  signatureVerified: boolean;
  outcome: WebhookOutcome;
  /** Consegna originale (`false`) o ritrasmissione manuale dal pannello (`true`). */
  isReplay: boolean;
  orderCode: string;
  companyId: CompanyId;
  amountCents: number;
  webhook: SignedWebhook;
}

/* ------------------------------------------------------------------ */
/* Emissione ordine                                                    */
/* ------------------------------------------------------------------ */

export interface OrderEmissionResult {
  orderCode: string;
  createdAt: string;
  role: Role;
  customer: Company;
  totals: CheckoutTotals;
  paymentMethod: PaymentMethod;
  vatRegime: VatRegime;
  webhooks: SignedWebhook[];
  invoice: Invoice;
  stockDecrements: Array<{ sku: string; fromBG: number; fromBS: number }>;
}

/** Corpo della richiesta `POST /api/v1/orders`. */
export interface OrderRequestBody {
  role: Role;
  companyId: CompanyId;
  lines: Array<{ sku: string; quantity: number; overrideDiscountBp: number }>;
  vatRegime: VatRegime;
  paymentMethod: PaymentMethod;
}

/** Totali ricalcolati lato server (il client non è mai fonte di verità). */
export interface OrderServerTotals {
  taxableGoodsCents: number;
  shippingCents: number;
  taxableTotalCents: number;
  vatCents: number;
  stampDutyCents: number;
  grandTotalCents: number;
}

export interface OrderAcceptedResponse {
  status: "accepted";
  orderCode: string;
  idempotencyKey: string;
  customerVat: string;
  priceListTier: ContractTierId;
  totals: OrderServerTotals;
  lines: Array<{ sku: string; quantity: number; netUnitCents: number; lineNetCents: number; volumeTier: string }>;
}

export interface ApiErrorResponse {
  status: "error";
  error: string;
  message: string;
  requiredPermission?: Permission;
}

/* ------------------------------------------------------------------ */
/* Documentazione API                                                  */
/* ------------------------------------------------------------------ */

export type HttpMethod = "GET" | "POST";

export interface ApiParameter {
  name: string;
  location: "query" | "path" | "header" | "body";
  type: string;
  required: boolean;
  description: string;
}

export interface ApiEndpointDoc {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  roles: Role[] | "stripe";
  parameters: ApiParameter[];
  requestExample: string | null;
  responseStatus: number;
  responseExample: string;
  /** URL eseguibile dal vivo nella sandbox, se implementato. */
  liveUrl: string | null;
}
