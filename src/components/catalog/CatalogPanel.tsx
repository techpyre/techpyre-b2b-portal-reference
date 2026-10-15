"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { AlertCircle, Check, FileText, Minus, Plus, Search, Zap } from "lucide-react";
import type { AvailabilityFilter, PriceListTier, Product, ProductCategory, StockMap } from "@/types";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { PRICE_LIST_TIERS } from "@/data/companies";
import { formatBp, formatEUR, formatUnitPrice } from "@/lib/money";
import { MAX_OVERRIDE_BP, MIN_MARGIN_BP, quote, validateOverride } from "@/lib/pricing";
import { overrideKey, totalStock } from "@/lib/checkout";
import { can, deniedReason } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";
import { DatasheetModal } from "@/components/catalog/DatasheetModal";

const AVAILABILITY_OPTIONS: ReadonlyArray<{ id: AvailabilityFilter; label: string }> = [
  { id: "all", label: "Tutti" },
  { id: "in_stock", label: "Pronta consegna" },
  { id: "on_order", label: "Su ordinazione" },
];

const nf = new Intl.NumberFormat("it-IT");

type Quote = ReturnType<typeof quote>;

/** Scaglioni quantità in una riga di testo: lo scaglione attivo è evidenziato. */
function TierLine({ tier, quantity }: { tier: PriceListTier; quantity: number }) {
  const q = Math.max(1, quantity);
  return (
    <p className="num text-xs text-dim" aria-label="Scaglioni quantità">
      {tier.volumeTiers.map((t, i) => {
        const active = q >= t.minQty && (t.maxQty === null || q <= t.maxQty);
        return (
          <Fragment key={t.id}>
            {i > 0 && <span aria-hidden> · </span>}
            <span aria-current={active ? "true" : undefined} className={active ? "font-medium text-fg" : undefined}>
              {t.label}
              {t.discountBp > 0 ? ` −${formatBp(t.discountBp)}` : ""}
            </span>
          </Fragment>
        );
      })}
    </p>
  );
}

function QtyStepper({ product, disabledReason }: { product: Product; disabledReason: string | null }) {
  const { state, setQty } = usePortal();
  const qty = state.cart[product.sku] ?? 0;
  const inputId = useId();
  const disabled = disabledReason !== null;
  const btn =
    "flex size-11 shrink-0 items-center justify-center rounded border border-line-strong bg-panel text-muted hover:border-fg hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 lg:size-8";
  return (
    <div className="flex items-center gap-1" title={disabledReason ?? undefined}>
      <button
        type="button"
        className={btn}
        disabled={disabled || qty === 0}
        onClick={() => setQty(product.sku, qty - 1)}
        aria-label={`Riduci quantità ${product.sku}`}
      >
        <Minus aria-hidden className="size-4 lg:size-3.5" />
      </button>
      <label htmlFor={inputId} className="sr-only">
        Quantità {product.sku}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={0}
        max={100000}
        value={qty === 0 ? "" : qty}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => setQty(product.sku, e.target.value === "" ? 0 : Number(e.target.value))}
        className={`num h-11 w-16 rounded border bg-panel px-2 text-center text-base text-fg placeholder:text-dim disabled:opacity-40 lg:h-8 lg:text-sm ${
          qty > 0 ? "border-fg" : "border-line-strong"
        }`}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => setQty(product.sku, qty + 1)}
        aria-label={`Aumenta quantità ${product.sku}`}
      >
        <Plus aria-hidden className="size-4 lg:size-3.5" />
      </button>
    </div>
  );
}

function OverrideInput({ product, tier, quantity }: { product: Product; tier: PriceListTier; quantity: number }) {
  const { overrideFor, setOverride } = usePortal();
  const bp = overrideFor(product.sku);
  const inputId = useId();
  const validation = bp > 0 ? validateOverride(product, tier, Math.max(1, quantity), bp) : null;
  const invalid = validation !== null && !validation.valid;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-xs text-dim lg:sr-only">
          Sconto extra {product.sku}
        </label>
        <input
          id={inputId}
          type="number"
          step={0.5}
          min={0}
          max={MAX_OVERRIDE_BP / 100}
          value={bp === 0 ? "" : bp / 100}
          placeholder="0"
          onChange={(e) => setOverride(product.sku, Math.round(Number(e.target.value || 0) * 100))}
          aria-invalid={invalid}
          aria-describedby={`${inputId}-msg`}
          className={`num h-10 w-20 rounded border bg-panel px-2 text-right text-base text-fg lg:h-8 lg:w-16 lg:text-sm ${
            invalid ? "border-danger" : bp > 0 ? "border-info" : "border-line-strong"
          }`}
        />
        <span className="text-xs text-dim">%</span>
      </div>
      <span id={`${inputId}-msg`} className={`max-w-[12rem] text-xs leading-snug ${invalid ? "text-danger" : "text-dim"}`}>
        {validation && !validation.valid ? validation.reason : validation?.valid ? "Applicato" : `max ${MAX_OVERRIDE_BP / 100}% · margine ≥ ${MIN_MARGIN_BP / 100}%`}
      </span>
    </div>
  );
}

function discountLabel(q: Quote): string {
  return `−${formatBp(q.compoundDiscountBp)}`;
}

function Availability({ product, stock, qty }: { product: Product; stock: StockMap[string] | undefined; qty: number }) {
  const s = stock ?? { BG: 0, BS: 0 };
  const total = s.BG + s.BS;
  const shortage = qty > total;
  return (
    <div className="text-xs leading-snug">
      <p className={`flex items-center gap-1.5 font-medium ${total > 0 ? "text-ok" : "text-warn"}`}>
        <span aria-hidden className={`size-2 rounded-full ${total > 0 ? "bg-ok" : "bg-warn"}`} />
        {total > 0 ? "Pronta consegna" : `Su ordinazione · ${product.leadTimeDays} gg`}
      </p>
      <p className="num text-dim">
        BG {nf.format(s.BG)} · BS {nf.format(s.BS)}
      </p>
      {shortage && total > 0 && <p className="text-warn">Residuo in backorder · {product.leadTimeDays} gg</p>}
    </div>
  );
}

export function CatalogPanel() {
  const { role, company, state, activeOverrides, setQty } = usePortal();
  const tier = PRICE_LIST_TIERS[company.priceListTier];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Micro-feature: Quick Order Bar
  const [quickSku, setQuickSku] = useState("");
  const [quickQty, setQuickQty] = useState(1);
  const [quickFeedback, setQuickFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const searchId = useId();
  const categoryId = useId();
  const quickSkuId = useId();
  const quickQtyId = useId();

  const showCost = can(role, "price:view_cost");
  const showMargin = can(role, "price:view_margin");
  const canOverride = can(role, "price:override");
  const qtyDisabledReason = can(role, "cart:edit") ? null : deniedReason(role, "cart:edit");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      const stock = totalStock(state.stock, p.sku);
      if (q && !p.sku.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      if (category !== "all" && p.category !== category) return false;
      if (availability === "in_stock" && stock === 0) return false;
      if (availability === "on_order" && stock > 0) return false;
      return true;
    });
  }, [search, category, availability, state.stock]);

  const priced = rows.map((p) => {
    const qty = state.cart[p.sku] ?? 0;
    const q = quote(p, tier, Math.max(1, qty), activeOverrides[overrideKey(company.id, p.sku)] ?? 0);
    return { p, qty, q };
  });

  const volumeDiscounts = tier.volumeTiers
    .filter((t) => t.discountBp > 0)
    .map((t) => `${t.label} −${formatBp(t.discountBp)}`)
    .join(", ");

  const th = "px-3 py-2.5 text-left text-xs font-medium text-dim whitespace-nowrap";

  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setAvailability("all");
  };

  // Autocomplete suggestions per Quick SKU Add
  const skuSuggestions = useMemo(() => {
    const query = quickSku.trim().toUpperCase();
    if (query.length < 2) return [];
    return PRODUCTS.filter(
      (p) => p.sku.toUpperCase().includes(query) || p.name.toUpperCase().includes(query)
    ).slice(0, 5);
  }, [quickSku]);

  const handleQuickAdd = (skuOverride?: string) => {
    const target = (skuOverride || quickSku).trim().toUpperCase();
    if (!target) return;
    const match = PRODUCTS.find((p) => p.sku.toUpperCase() === target || p.sku.toUpperCase().includes(target));
    if (!match) {
      setQuickFeedback({ type: "error", message: `Articolo SKU «${target}» non a catalogo.` });
      return;
    }
    if (!can(role, "cart:edit")) {
      setQuickFeedback({ type: "error", message: deniedReason(role, "cart:edit") ?? "Modifica carrello in sola consultazione." });
      return;
    }
    const addCount = Math.max(1, quickQty || 1);
    const existing = state.cart[match.sku] ?? 0;
    setQty(match.sku, existing + addCount);
    setQuickFeedback({ type: "success", message: `Aggiunto a carrello: ${match.sku} (+${addCount} pz)` });
    setQuickSku("");
    setQuickQty(1);
    setSuggestionsOpen(false);
    setTimeout(() => setQuickFeedback(null), 3500);
  };

  return (
    <>
      <section aria-labelledby="catalog-title" className="min-w-0 rounded-md border border-line bg-panel">
        <div className="border-b border-line p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="catalog-title" className="text-lg font-semibold tracking-tight text-fg">
              Catalogo
            </h2>
            <p className="text-[13px] text-dim">
              Listino <span className="text-muted">{tier.label}</span> (−{formatBp(tier.contractDiscountBp)}) · quantità {volumeDiscounts} · trasporto
              gratuito da <span className="num">{formatEUR(company.freeShippingThresholdCents)}</span>
            </p>
          </div>

          {/* Quick SKU Add Bar (Micro-feature B2B) */}
          <div className="mb-3 rounded border border-line-strong bg-panel-2/70 p-2.5 sm:p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5">
                <Zap aria-hidden className="size-4 text-amber" />
                <span className="text-xs font-semibold uppercase tracking-wider text-fg">
                  Aggiunta Rapida SKU
                </span>
                <span className="hidden text-[11px] text-dim sm:inline">
                  (inserisci codice o lettore barcode e premi <kbd className="rounded border border-line bg-panel px-1 text-[10px]">Invio</kbd>)
                </span>
              </div>
              {quickFeedback && (
                <div
                  role="status"
                  className={`flex items-center gap-1.5 text-xs font-medium ${
                    quickFeedback.type === "success" ? "text-ok" : "text-danger"
                  }`}
                >
                  {quickFeedback.type === "success" ? (
                    <Check className="size-3.5" />
                  ) : (
                    <AlertCircle className="size-3.5" />
                  )}
                  {quickFeedback.message}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleQuickAdd();
              }}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <div className="relative flex-1 min-w-[14rem]">
                <label htmlFor={quickSkuId} className="sr-only">
                  Codice SKU articolo
                </label>
                <input
                  id={quickSkuId}
                  type="text"
                  value={quickSku}
                  onChange={(e) => {
                    setQuickSku(e.target.value);
                    setSuggestionsOpen(true);
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  placeholder="Es. VLK-RAC-2353-12L o VLK-CT03"
                  className="h-9 w-full rounded border border-line bg-panel px-3 text-sm font-mono text-fg placeholder:text-dim placeholder:font-sans focus:border-fg focus:outline-none"
                />

                {/* Autocomplete suggestions dropdown */}
                {suggestionsOpen && skuSuggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-line-strong bg-panel shadow-xl">
                    {skuSuggestions.map((item) => (
                      <li key={item.sku}>
                        <button
                          type="button"
                          onClick={() => {
                            setQuickSku(item.sku);
                            setSuggestionsOpen(false);
                            handleQuickAdd(item.sku);
                          }}
                          className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-panel-2"
                        >
                          <span className="mono font-semibold text-amber">{item.sku}</span>
                          <span className="truncate text-fg flex-1 text-right">{item.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor={quickQtyId} className="sr-only">
                  Quantità da aggiungere
                </label>
                <input
                  id={quickQtyId}
                  type="number"
                  min={1}
                  max={100000}
                  value={quickQty}
                  onChange={(e) => setQuickQty(Math.max(1, Number(e.target.value || 1)))}
                  className="num h-9 w-18 rounded border border-line bg-panel px-2 text-center text-sm text-fg focus:border-fg focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!quickSku.trim()}
                  className="flex h-9 items-center gap-1 rounded bg-fg px-3.5 text-xs font-semibold text-panel hover:bg-fg/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="size-3.5" />
                  Aggiungi
                </button>
              </div>
            </form>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                Cerca per codice o descrizione
              </label>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dim" />
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca codice o descrizione (es. CETOP)"
                className="h-11 w-full rounded border border-line-strong bg-panel pl-9 pr-3 text-base text-fg placeholder:text-dim sm:h-9 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor={categoryId} className="sr-only">
                Categoria
              </label>
              <select
                id={categoryId}
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory | "all")}
                className="h-11 w-full rounded border border-line-strong bg-panel px-2.5 text-base text-fg sm:h-9 sm:w-auto sm:text-sm"
              >
                <option value="all">Tutte le categorie</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div
              role="group"
              aria-label="Disponibilità"
              className="grid grid-cols-3 rounded border border-line-strong bg-panel-2 p-0.5 sm:col-span-2 sm:flex lg:col-span-1"
            >
              {AVAILABILITY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={availability === o.id}
                  onClick={() => setAvailability(o.id)}
                  className={`h-10 whitespace-nowrap rounded-[3px] px-3 text-sm sm:h-8 ${
                    availability === o.id ? "bg-panel font-medium text-fg shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-fg"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-dim">
            <span className="num">{rows.length}</span> di <span className="num">{PRODUCTS.length}</span> articoli · prezzi netti IVA esclusa
            {qtyDisabledReason && <span className="text-warn"> · sola consultazione per questo ruolo</span>}
          </p>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-fg">Nessun articolo trovato.</p>
            <button type="button" onClick={resetFilters} className="mt-2 text-sm font-medium text-info underline-offset-2 hover:underline">
              Azzera filtri
            </button>
          </div>
        )}

        {/* UNICO TABLE semantico, accessibile e completamente reattivo (eliminata duplicazione UL) */}
        {rows.length > 0 && (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Catalogo componenti oleodinamici con specifiche, giacenze e prezzi per il ruolo attivo</caption>
              <thead className="hidden border-b border-line bg-panel-2 lg:table-header-group">
                <tr>
                  <th scope="col" className={th}>
                    Articolo
                  </th>
                  <th scope="col" className={th}>
                    Specifiche
                  </th>
                  <th scope="col" className={th}>
                    Disponibilità
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Prezzo netto
                  </th>
                  {showCost && (
                    <th scope="col" className={`${th} text-right`}>
                      Costo
                    </th>
                  )}
                  {showMargin && (
                    <th scope="col" className={`${th} text-right`}>
                      Margine · provv.
                    </th>
                  )}
                  {canOverride && (
                    <th scope="col" className={th}>
                      Sconto extra
                    </th>
                  )}
                  <th scope="col" className={th}>
                    Quantità
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    Totale
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line lg:divide-y-0">
                {priced.map(({ p, qty, q }) => (
                  <tr
                    key={p.sku}
                    className={`block p-3.5 sm:p-4 lg:table-row lg:border-b lg:border-line lg:p-0 lg:last:border-b-0 hover:bg-panel-2/70 ${
                      qty > 0 ? "bg-amber/[0.03]" : ""
                    }`}
                  >
                    {/* Articolo: codice SKU, nome, categoria, scheda tecnica */}
                    <th
                      scope="row"
                      className="block text-left font-normal lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:min-w-[16rem] lg:max-w-[22rem]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="mono text-xs font-semibold text-amber">{p.sku}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedProduct(p)}
                          className="inline-flex items-center gap-1 rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] font-medium text-dim hover:border-fg hover:text-fg"
                          title={`Visualizza scheda tecnica ${p.sku}`}
                        >
                          <FileText className="size-3 text-info" />
                          <span>Scheda</span>
                        </button>
                      </div>
                      <span className="mt-0.5 block font-medium leading-snug text-fg">{p.name}</span>
                      <span className="mt-0.5 block text-xs text-dim">
                        {p.category} · {p.certifications.join(", ")}
                      </span>
                    </th>

                    {/* Specifiche */}
                    <td className="mt-1 block num text-[13px] text-muted lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap">
                      <span className="block">
                        {p.maxPressureBar} bar{p.flowLpm !== null && <> · {p.flowLpm} L/min</>}
                      </span>
                      <span className="block text-xs text-dim">
                        {p.tempMinC}…{p.tempMaxC} °C · {nf.format(p.weightKg)} kg
                      </span>
                    </td>

                    {/* Disponibilità magazzini */}
                    <td className="mt-2 block lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap">
                      <Availability product={p} stock={state.stock[p.sku]} qty={qty} />
                    </td>

                    {/* Prezzo netto unitario esatto */}
                    <td className="mt-3 flex items-baseline justify-between lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap lg:text-right">
                      <span className="text-xs text-dim lg:hidden">Prezzo unitario netto:</span>
                      <div className="text-right">
                        <span className="block font-semibold text-fg">
                          {formatUnitPrice(q.exactNetUnitPriceCents)}
                        </span>
                        <span className="block text-xs text-dim">
                          <span className="line-through">{formatEUR(q.listUnitCents)}</span>{" "}
                          <span className="text-ok font-medium">{discountLabel(q)}</span>
                        </span>
                      </div>
                    </td>

                    {/* Costo industriale */}
                    {showCost && (
                      <td className="mt-1 flex items-center justify-between text-xs text-muted lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap lg:text-right">
                        <span className="text-dim lg:hidden">Costo industriale:</span>
                        <span className="num">{formatEUR(q.costUnitCents)}</span>
                      </td>
                    )}

                    {/* Margine e provvigione */}
                    {showMargin && (
                      <td className="mt-1 flex items-center justify-between text-xs lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap lg:text-right">
                        <span className="text-dim lg:hidden">Margine / Provvigione:</span>
                        <div className="text-right">
                          <span
                            className={`block font-medium ${
                              q.marginBp < MIN_MARGIN_BP ? "text-danger" : q.marginBp < 3_500 ? "text-warn" : "text-ok"
                            }`}
                          >
                            {formatBp(q.marginBp)}
                          </span>
                          <span className="block text-xs text-dim">
                            {formatBp(q.commissionRateBp)} · {formatEUR(q.commissionCents)}
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Override agente */}
                    {canOverride && (
                      <td className="mt-2 block lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top">
                        <span className="text-xs text-dim mb-1 block lg:hidden">Sconto extra agente:</span>
                        <OverrideInput product={p} tier={tier} quantity={qty} />
                      </td>
                    )}

                    {/* Quantità a carrello */}
                    <td className="mt-3 flex flex-wrap items-center justify-between gap-2 lg:mt-0 lg:table-cell lg:px-3 lg:py-3 lg:align-top">
                      <span className="text-xs text-dim block lg:hidden">Quantità a carrello:</span>
                      <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                        <QtyStepper product={p} disabledReason={qtyDisabledReason} />
                        <TierLine tier={tier} quantity={qty} />
                      </div>
                    </td>

                    {/* Totale riga */}
                    <td className="mt-2.5 flex items-baseline justify-between border-t border-line/60 pt-2 lg:mt-0 lg:border-t-0 lg:pt-3 lg:table-cell lg:px-3 lg:py-3 lg:align-top lg:whitespace-nowrap lg:text-right">
                      <span className="text-xs font-medium text-dim lg:hidden">Totale riga:</span>
                      <div className="text-right">
                        {qty > 0 ? (
                          <>
                            <span className="block font-semibold text-fg">{formatEUR(q.lineNetCents)}</span>
                            <span className="block text-xs text-ok">−{formatEUR(q.savingsCents)}</span>
                          </>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Datasheet Modal (Micro-feature B2B) */}
      <DatasheetModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}
