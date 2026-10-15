"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import type { AvailabilityFilter, PriceListTier, Product, ProductCategory, StockMap } from "@/types";
import { CATEGORIES, PRODUCTS } from "@/data/catalog";
import { PRICE_LIST_TIERS } from "@/data/companies";
import { formatBp, formatEUR } from "@/lib/money";
import { MAX_OVERRIDE_BP, MIN_MARGIN_BP, quote, validateOverride } from "@/lib/pricing";
import { overrideKey, totalStock } from "@/lib/checkout";
import { can, deniedReason } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

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
  return `−${formatBp(10_000 - Math.round((q.netUnitCents * 10_000) / q.listUnitCents))}`;
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

function specLine(p: Product): string {
  return [`${p.maxPressureBar} bar`, p.flowLpm === null ? null : `${p.flowLpm} L/min`, `${p.tempMinC}…${p.tempMaxC} °C`, `${nf.format(p.weightKg)} kg`]
    .filter(Boolean)
    .join(" · ");
}

export function CatalogPanel() {
  const { role, company, state, activeOverrides } = usePortal();
  const tier = PRICE_LIST_TIERS[company.priceListTier];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const searchId = useId();
  const categoryId = useId();

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
  const td = "px-3 py-3 align-top";

  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setAvailability("all");
  };

  return (
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

      {/* Mobile e tablet: lista a schede */}
      <ul className="divide-y divide-line lg:hidden">
        {priced.map(({ p, qty, q }) => (
          <li key={p.sku} className="px-3 py-3.5 sm:px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="mono text-xs font-medium text-amber">{p.sku}</p>
                <p className="mt-0.5 text-[15px] font-medium leading-snug text-fg">{p.name}</p>
                <p className="num mt-1 text-[13px] text-muted">{specLine(p)}</p>
              </div>
            </div>
            <div className="mt-2">
              <Availability product={p} stock={state.stock[p.sku]} qty={qty} />
            </div>

            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="num text-lg font-semibold leading-tight text-fg">{formatEUR(q.netUnitCents)}</p>
                <p className="num text-xs text-dim">
                  <span className="line-through">{formatEUR(q.listUnitCents)}</span> <span className="text-ok">{discountLabel(q)}</span>
                </p>
              </div>
              <QtyStepper product={p} disabledReason={qtyDisabledReason} />
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <TierLine tier={tier} quantity={qty} />
              {qty > 0 && (
                <p className="num shrink-0 text-sm font-medium text-fg">
                  <span className="sr-only">Totale riga </span>
                  {formatEUR(q.lineNetCents)}
                </p>
              )}
            </div>

            {(showCost || showMargin || canOverride) && (
              <div className="mt-3 grid gap-2 rounded border border-info/25 bg-info/[0.04] p-2.5 text-xs">
                {(showCost || showMargin) && (
                  <p className="num text-muted">
                    {showCost && <>Costo {formatEUR(q.costUnitCents)}</>}
                    {showMargin && (
                      <>
                        {showCost && " · "}Margine{" "}
                        <span className={q.marginBp < MIN_MARGIN_BP ? "text-danger" : q.marginBp < 3_500 ? "text-warn" : "text-ok"}>
                          {formatBp(q.marginBp)}
                        </span>{" "}
                        · Provv. {formatBp(q.commissionRateBp)} ({formatEUR(q.commissionCents)})
                      </>
                    )}
                  </p>
                )}
                {canOverride && <OverrideInput product={p} tier={tier} quantity={qty} />}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop: tabella densa */}
      {rows.length > 0 && (
        <div className="scrollbar-thin hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Catalogo componenti oleodinamici con specifiche, giacenze e prezzi per il ruolo attivo</caption>
            <thead className="border-b border-line bg-panel-2">
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
            <tbody>
              {priced.map(({ p, qty, q }) => (
                <tr key={p.sku} className={`border-b border-line last:border-b-0 hover:bg-panel-2/70 ${qty > 0 ? "bg-amber/[0.03]" : ""}`}>
                  <th scope="row" className={`${td} min-w-[16rem] max-w-[22rem] text-left font-normal`}>
                    <span className="mono block text-xs font-medium text-amber">{p.sku}</span>
                    <span className="block font-medium leading-snug text-fg">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-dim">
                      {p.category} · {p.certifications.join(", ")}
                    </span>
                  </th>
                  <td className={`${td} num whitespace-nowrap text-[13px] text-muted`}>
                    <span className="block">
                      {p.maxPressureBar} bar{p.flowLpm !== null && <> · {p.flowLpm} L/min</>}
                    </span>
                    <span className="block text-dim">
                      {p.tempMinC}…{p.tempMaxC} °C · {nf.format(p.weightKg)} kg
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Availability product={p} stock={state.stock[p.sku]} qty={qty} />
                  </td>
                  <td className={`${td} num whitespace-nowrap text-right`}>
                    <span className="block font-semibold text-fg">{formatEUR(q.netUnitCents)}</span>
                    <span className="block text-xs text-dim">
                      <span className="line-through">{formatEUR(q.listUnitCents)}</span> <span className="text-ok">{discountLabel(q)}</span>
                    </span>
                  </td>
                  {showCost && <td className={`${td} num whitespace-nowrap text-right text-muted`}>{formatEUR(q.costUnitCents)}</td>}
                  {showMargin && (
                    <td className={`${td} num whitespace-nowrap text-right`}>
                      <span className={`block font-medium ${q.marginBp < MIN_MARGIN_BP ? "text-danger" : q.marginBp < 3_500 ? "text-warn" : "text-ok"}`}>
                        {formatBp(q.marginBp)}
                      </span>
                      <span className="block text-xs text-dim">
                        {formatBp(q.commissionRateBp)} · {formatEUR(q.commissionCents)}
                      </span>
                    </td>
                  )}
                  {canOverride && (
                    <td className={td}>
                      <OverrideInput product={p} tier={tier} quantity={qty} />
                    </td>
                  )}
                  <td className={td}>
                    <div className="flex flex-col gap-1.5">
                      <QtyStepper product={p} disabledReason={qtyDisabledReason} />
                      <TierLine tier={tier} quantity={qty} />
                    </div>
                  </td>
                  <td className={`${td} num whitespace-nowrap text-right`}>
                    {qty > 0 ? (
                      <>
                        <span className="block font-semibold text-fg">{formatEUR(q.lineNetCents)}</span>
                        <span className="block text-xs text-ok">−{formatEUR(q.savingsCents)}</span>
                      </>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
