"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  CartMap,
  CheckoutTotals,
  Company,
  CompanyId,
  Invoice,
  OrderEmissionResult,
  OverrideMap,
  PaymentMethod,
  Role,
  SignedWebhook,
  StockMap,
  VatRegime,
  WebhookLogEntry,
} from "@/types";
import { INITIAL_STOCK } from "@/data/catalog";
import { COMPANIES } from "@/data/companies";
import { can } from "@/lib/rbac";
import { computeCheckout, overrideKey } from "@/lib/checkout";
import { PAYMENT_METHODS } from "@/lib/orders";
import { consumeWebhook } from "@/lib/webhooks";
import { useDemoSession } from "@/hooks/useDemoSession";

interface PortalState {
  stock: StockMap;
  cart: CartMap;
  overrides: OverrideMap;
  vatRegime: VatRegime;
  paymentMethod: PaymentMethod;
  invoices: Invoice[];
  webhookLog: WebhookLogEntry[];
  processedEventIds: ReadonlySet<string>;
  invoiceSequence: number;
  orders: OrderEmissionResult[];
}

type Action =
  | { type: "SET_QTY"; sku: string; qty: number }
  | { type: "REMOVE_LINE"; sku: string }
  | { type: "CLEAR_CART" }
  | { type: "SET_OVERRIDE"; key: string; bp: number }
  | { type: "SET_VAT"; regime: VatRegime }
  | { type: "SET_PAYMENT"; method: PaymentMethod }
  | { type: "COMMIT_EMISSION"; result: OrderEmissionResult; receivedAt: Date }
  | { type: "REPLAY"; webhook: SignedWebhook; orderCode: string; companyId: CompanyId; receivedAt: Date }
  | { type: "SDI_DELIVERED"; invoiceId: string }
  | { type: "RESET" };

/** Progressivo fatture di partenza dell'esercizio nella sandbox. */
const FIRST_INVOICE_SEQUENCE = 1_041;

function initialState(): PortalState {
  return {
    stock: structuredClone(INITIAL_STOCK),
    cart: { "VLK-CT03-24V": 4, "VLK-RAC-2353-12L": 60 },
    overrides: {},
    vatRegime: "ordinaria",
    paymentMethod: "bonifico_60_dffm",
    invoices: [],
    webhookLog: [],
    processedEventIds: new Set<string>(),
    invoiceSequence: FIRST_INVOICE_SEQUENCE,
    orders: [],
  };
}

function reducer(state: PortalState, action: Action): PortalState {
  switch (action.type) {
    case "SET_QTY": {
      const qty = Math.max(0, Math.min(100_000, Math.floor(action.qty)));
      const cart = { ...state.cart };
      if (qty === 0 || Number.isNaN(qty)) delete cart[action.sku];
      else cart[action.sku] = qty;
      return { ...state, cart };
    }
    case "REMOVE_LINE": {
      const cart = { ...state.cart };
      delete cart[action.sku];
      return { ...state, cart };
    }
    case "CLEAR_CART":
      return { ...state, cart: {} };
    case "SET_OVERRIDE": {
      const overrides = { ...state.overrides };
      if (action.bp <= 0) delete overrides[action.key];
      else overrides[action.key] = action.bp;
      return { ...state, overrides };
    }
    case "SET_VAT":
      return { ...state, vatRegime: action.regime };
    case "SET_PAYMENT":
      return { ...state, paymentMethod: action.method };
    case "COMMIT_EMISSION": {
      const { result, receivedAt } = action;
      const stock: StockMap = { ...state.stock };
      for (const d of result.stockDecrements) {
        const current = stock[d.sku] ?? { BG: 0, BS: 0 };
        stock[d.sku] = { BG: Math.max(0, current.BG - d.fromBG), BS: Math.max(0, current.BS - d.fromBS) };
      }
      let processed = state.processedEventIds;
      const entries: WebhookLogEntry[] = [];
      result.webhooks.forEach((webhook, i) => {
        const out = consumeWebhook(processed, webhook, {
          orderCode: result.orderCode,
          companyId: result.customer.id,
          isReplay: false,
          receivedAt: new Date(receivedAt.getTime() + i * 180),
        });
        processed = out.processedEventIds;
        entries.push(out.entry);
      });
      return {
        ...state,
        stock,
        cart: {},
        invoices: [result.invoice, ...state.invoices],
        webhookLog: [...entries.reverse(), ...state.webhookLog],
        processedEventIds: processed,
        invoiceSequence: state.invoiceSequence + 1,
        orders: [result, ...state.orders],
      };
    }
    case "REPLAY": {
      const out = consumeWebhook(state.processedEventIds, action.webhook, {
        orderCode: action.orderCode,
        companyId: action.companyId,
        isReplay: true,
        receivedAt: action.receivedAt,
      });
      return { ...state, processedEventIds: out.processedEventIds, webhookLog: [out.entry, ...state.webhookLog] };
    }
    case "SDI_DELIVERED":
      return {
        ...state,
        invoices: state.invoices.map((inv) => (inv.id === action.invoiceId ? { ...inv, sdiStatus: "RC_CONSEGNATA" } : inv)),
      };
    case "RESET":
      return initialState();
  }
}

export interface PortalContextValue {
  role: Role;
  company: Company;
  setRole: (role: Role) => void;
  setCompany: (companyId: CompanyId) => void;
  state: PortalState;
  totals: CheckoutTotals;
  activeOverrides: OverrideMap;
  effectivePayment: PaymentMethod;
  effectiveVatRegime: VatRegime;
  allowedPayments: PaymentMethod[];
  setQty: (sku: string, qty: number) => void;
  removeLine: (sku: string) => void;
  clearCart: () => void;
  setOverride: (sku: string, bp: number) => void;
  overrideFor: (sku: string) => number;
  setVatRegime: (regime: VatRegime) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  commitEmission: (result: OrderEmissionResult) => void;
  replayWebhook: (webhook: SignedWebhook, orderCode: string, companyId: CompanyId) => void;
  resetSandbox: () => void;
}

const PortalContext = createContext<PortalContextValue | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const { role, companyId, setRole, setCompany } = useDemoSession();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const company = COMPANIES[companyId];

  const allowedPayments = useMemo(
    () => PAYMENT_METHODS.filter((m) => can(role, m.permission)).map((m) => m.id),
    [role],
  );
  const effectivePayment: PaymentMethod = allowedPayments.includes(state.paymentMethod)
    ? state.paymentMethod
    : (allowedPayments[0] ?? state.paymentMethod);
  const effectiveVatRegime: VatRegime =
    state.vatRegime === "esente_art8" && can(role, "tax:exemption_declare") && company.intentDeclarationProtocol
      ? "esente_art8"
      : "ordinaria";

  // Gli override sono una trattativa in corso dell'agente: hanno effetto solo nella sua vista.
  const activeOverrides = useMemo<OverrideMap>(
    () => (can(role, "price:override") ? state.overrides : {}),
    [role, state.overrides],
  );

  const totals = useMemo(
    () =>
      computeCheckout({
        cart: state.cart,
        company,
        stock: state.stock,
        overrides: activeOverrides,
        vatRegime: effectiveVatRegime,
      }),
    [state.cart, state.stock, activeOverrides, company, effectiveVatRegime],
  );

  const setQty = useCallback((sku: string, qty: number) => dispatch({ type: "SET_QTY", sku, qty }), []);
  const removeLine = useCallback((sku: string) => dispatch({ type: "REMOVE_LINE", sku }), []);
  const clearCart = useCallback(() => dispatch({ type: "CLEAR_CART" }), []);
  const setOverride = useCallback(
    (sku: string, bp: number) => dispatch({ type: "SET_OVERRIDE", key: overrideKey(companyId, sku), bp }),
    [companyId],
  );
  const overrideFor = useCallback(
    (sku: string) => state.overrides[overrideKey(companyId, sku)] ?? 0,
    [state.overrides, companyId],
  );
  const setVatRegime = useCallback((regime: VatRegime) => dispatch({ type: "SET_VAT", regime }), []);
  const setPaymentMethod = useCallback((method: PaymentMethod) => dispatch({ type: "SET_PAYMENT", method }), []);
  const commitEmission = useCallback((result: OrderEmissionResult) => {
    dispatch({ type: "COMMIT_EMISSION", result, receivedAt: new Date() });
    window.setTimeout(() => dispatch({ type: "SDI_DELIVERED", invoiceId: result.invoice.id }), 4_000);
  }, []);
  const replayWebhook = useCallback(
    (webhook: SignedWebhook, orderCode: string, cid: CompanyId) =>
      dispatch({ type: "REPLAY", webhook, orderCode, companyId: cid, receivedAt: new Date() }),
    [],
  );
  const resetSandbox = useCallback(() => dispatch({ type: "RESET" }), []);

  const value: PortalContextValue = {
    role,
    company,
    setRole,
    setCompany,
    state,
    totals,
    activeOverrides,
    effectivePayment,
    effectiveVatRegime,
    allowedPayments,
    setQty,
    removeLine,
    clearCart,
    setOverride,
    overrideFor,
    setVatRegime,
    setPaymentMethod,
    commitEmission,
    replayWebhook,
    resetSandbox,
  };

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal deve essere usato all'interno di <PortalProvider>.");
  return ctx;
}
