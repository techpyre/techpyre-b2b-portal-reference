"use client";

import { useId, useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import type { AvailabilityFilter, PriceListTier, Product, ProductCategory } from "@/types";
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

function TierChips({ tier, quantity }: { tier: PriceListTier; quantity: number }) {
  const q = Math.max(1, quantity);
  return (
    <div className="flex gap-0.5" aria-label="Scaglioni quantità">
      {tier.volumeTiers.map((t) => {
        const active = q >= t.minQty && (t.maxQty === null || q <= t.maxQty);
        return (
          <span
            key={t.id}
            aria-current={active ? "true" : undefined}
            className={`num whitespace-nowrap rounded-[2px] border px-1 py-px text-[10px] leading-tight ${
              active ? "border-amber bg-amber/15 text-amber-soft" : "border-line text-dim"
            }`}
          >
            {t.label}
            {t.discountBp > 0 ? ` −${formatBp(t.discountBp)}` : ""}
          </span>
        );
      })}
    </div>
  );
}

function QtyStepper({ product, disabledReason }: { product: Product; disabledReason: string | null }) {
  const { state, setQty } = usePortal();
  const qty = state.cart[product.sku] ?? 0;
  const inputId = useId();
  const disabled = disabledReason !== null;
  const btn =
    "flex size-7 items-center justify-center rounded-[2px] border border-line-strong text-muted hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-1" title={disabledReason ?? undefined}>
      <button
        type="button"
        className={btn}
        disabled={disabled || qty === 0}
        onClick={() => setQty(product.sku, qty - 1)}
        aria-label={`Riduci quantità ${product.sku}`}
      >
        <Minus aria-hidden className="size-3" />
      </button>
      <label htmlFor={inputId} className="sr-only">
        Quantità ordine rapido {product.sku}
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
        className={`num h-7 w-16 rounded-[2px] border bg-ink px-1.5 text-right text-xs text-fg disabled:opacity-40 ${
          qty > 0 ? "border-amber/70" : "border-line-strong"
        }`}
      />
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => setQty(product.sku, qty + 1)}
        aria-label={`Aumenta quantità ${product.sku}`}
      >
        <Plus aria-hidden className="size-3" />
      </button>
    </div>
  );
}

function OverrideInput({ product, tier, quantity }: { product: Product; tier: PriceListTier; quantity: number }) {
  const { overrideFor, setOverride } = usePortal();
  const bp = overrideFor(product.sku);
  const inputId = useId();
  const validation = bp > 0 ? validateOverride(product, tier, Math.max(1, quantity), bp) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={inputId} className="sr-only">
        Sconto extra agente su {product.sku} (percentuale)
      </label>
      <div className="flex items-center gap-1">
        <input
          id={inputId}
          type="number"
          step={0.5}
          min={0}
          max={MAX_OVERRIDE_BP / 100}
          value={bp === 0 ? "" : bp / 100}
          placeholder="0"
          onChange={(e) => setOverride(product.sku, Math.round(Number(e.target.value || 0) * 100))}
          aria-invalid={validation !== null && !validation.valid}
          aria-describedby={`${inputId}-msg`}
          className={`num h-7 w-14 rounded-[2px] border bg-ink px-1.5 text-right text-xs text-fg ${
            validation && !validation.valid ? "border-danger" : bp > 0 ? "border-info" : "border-line-strong"
          }`}
        />
        <span className="text-[10px] text-dim">%</span>
      </div>
      <span id={`${inputId}-msg`} className={`max-w-[9rem] text-[10px] leading-tight ${validation && !validation.valid ? "text-danger" : "text-dim"}`}>
        {validation && !validation.valid ? validation.reason : validation?.valid ? "Override applicato" : `max ${MAX_OVERRIDE_BP / 100}% · margine ≥ ${MIN_MARGIN_BP / 100}%`}
      </span>
    </div>
  );
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

  const th = "px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dim whitespace-nowrap";
  const td = "px-2.5 py-2 align-top";

  return (
    <section aria-labelledby="catalog-title" className="min-w-0 rounded-sm border border-line bg-panel">
      <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 id="catalog-title" className="text-sm font-semibold text-fg">
            Catalogo tecnico · ordine rapido
          </h2>
          <p className="text-xs text-muted">
            {rows.length} di {PRODUCTS.length} componenti · prezzi netti {tier.label} per {company.vatNumber}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor={searchId} className="text-[10px] uppercase tracking-wider text-dim">
              Ricerca SKU / descrizione
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-dim" />
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="es. CETOP, VLK-PPA, 350 bar"
                className="num h-8 w-full rounded-sm border border-line-strong bg-ink pl-7 pr-2 text-xs text-fg placeholder:text-dim sm:w-56"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={categoryId} className="text-[10px] uppercase tracking-wider text-dim">
              Categoria
            </label>
            <select
              id={categoryId}
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategory | "all")}
              className="h-8 rounded-sm border border-line-strong bg-ink px-2 text-xs text-fg"
            >
              <option value="all">Tutte le categorie</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span id="availability-label" className="text-[10px] uppercase tracking-wider text-dim">
              Disponibilità
            </span>
            <div role="group" aria-labelledby="availability-label" className="flex rounded-sm border border-line-strong bg-ink p-0.5">
              {AVAILABILITY_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={availability === o.id}
                  onClick={() => setAvailability(o.id)}
                  className={`h-7 whitespace-nowrap rounded-[2px] px-2.5 text-xs ${
                    availability === o.id ? "bg-panel-2 text-fg ring-1 ring-line-strong" : "text-muted hover:text-fg"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-xs">
          <caption className="sr-only">
            Catalogo componenti oleodinamici con specifiche tecniche, giacenze e prezzi per il ruolo attivo
          </caption>
          <thead className="border-b border-line bg-panel-2">
            <tr>
              <th scope="col" className={`${th} sticky left-0 z-10 bg-panel-2`}>
                Articolo
              </th>
              <th scope="col" className={`${th} text-right`}>
                P max
              </th>
              <th scope="col" className={`${th} text-right`}>
                Portata
              </th>
              <th scope="col" className={th}>
                T esercizio
              </th>
              <th scope="col" className={`${th} text-right`}>
                Peso
              </th>
              <th scope="col" className={`${th} text-right`}>
                Giacenza BG · BS
              </th>
              <th scope="col" className={`${th} text-right`}>
                Listino / Netto
              </th>
              {showCost && (
                <th scope="col" className={`${th} text-right text-info-soft`}>
                  Costo ind.
                </th>
              )}
              {showMargin && (
                <th scope="col" className={`${th} text-right text-info-soft`}>
                  Margine · Provv.
                </th>
              )}
              {canOverride && (
                <th scope="col" className={`${th} text-info-soft`}>
                  Override
                </th>
              )}
              <th scope="col" className={th}>
                Quantità · scaglione
              </th>
              <th scope="col" className={`${th} text-right`}>
                Netto riga
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const qty = state.cart[p.sku] ?? 0;
              const q = quote(p, tier, Math.max(1, qty), activeOverrides[overrideKey(company.id, p.sku)] ?? 0);
              const stock = state.stock[p.sku] ?? { BG: 0, BS: 0 };
              const total = stock.BG + stock.BS;
              const shortage = qty > total;
              return (
                <tr key={p.sku} className="group border-b border-line/70 hover:bg-panel-2/60">
                  <th scope="row" className={`${td} sticky left-0 z-10 w-[19rem] max-w-[19rem] bg-panel text-left font-normal group-hover:bg-[#14161e]`}>
                    <span className="num block text-[11px] font-medium text-amber">{p.sku}</span>
                    <span className="block text-[12.5px] leading-snug text-fg">{p.name}</span>
                    <span className="mt-0.5 block text-[10.5px] text-dim">
                      {p.category} · {p.certifications.join(" · ")}
                    </span>
                  </th>
                  <td className={`${td} num text-right text-fg`}>
                    {p.maxPressureBar}
                    <span className="text-dim"> bar</span>
                  </td>
                  <td className={`${td} num text-right text-fg`}>
                    {p.flowLpm === null ? <span className="text-dim">—</span> : <>{p.flowLpm}<span className="text-dim"> L/min</span></>}
                  </td>
                  <td className={`${td} num whitespace-nowrap text-muted`}>
                    {p.tempMinC}…{p.tempMaxC} °C
                  </td>
                  <td className={`${td} num text-right text-muted`}>{nf.format(p.weightKg)} kg</td>
                  <td className={`${td} num whitespace-nowrap text-right`}>
                    <span className={stock.BG > 0 ? "text-fg" : "text-dim"}>{nf.format(stock.BG)}</span>
                    <span className="text-dim"> · </span>
                    <span className={stock.BS > 0 ? "text-fg" : "text-dim"}>{nf.format(stock.BS)}</span>
                    <span className={`mt-0.5 block text-[10px] ${total > 0 ? "text-ok" : "text-warn"}`}>
                      {total > 0 ? "Pronta consegna" : `Su ordinazione · ${p.leadTimeDays} gg lav.`}
                    </span>
                    {shortage && total > 0 && (
                      <span className="block text-[10px] text-warn">Residuo in backorder · {p.leadTimeDays} gg</span>
                    )}
                  </td>
                  <td className={`${td} num whitespace-nowrap text-right`}>
                    <span className="block text-[11px] text-dim line-through decoration-dim/70">{formatEUR(q.listUnitCents)}</span>
                    <span className="block font-medium text-fg">{formatEUR(q.netUnitCents)}</span>
                    <span className="block text-[10px] text-ok">
                      −{formatBp(10_000 - Math.round((q.netUnitCents * 10_000) / q.listUnitCents))}
                    </span>
                  </td>
                  {showCost && <td className={`${td} num text-right text-info-soft`}>{formatEUR(q.costUnitCents)}</td>}
                  {showMargin && (
                    <td className={`${td} num whitespace-nowrap text-right`}>
                      <span className={`block ${q.marginBp < MIN_MARGIN_BP ? "text-danger" : q.marginBp < 3_500 ? "text-warn" : "text-ok"}`}>
                        {formatBp(q.marginBp)}
                      </span>
                      <span className="block text-[10px] text-muted">
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
                    <div className="flex flex-col gap-1">
                      <QtyStepper product={p} disabledReason={qtyDisabledReason} />
                      <TierChips tier={tier} quantity={qty} />
                    </div>
                  </td>
                  <td className={`${td} num whitespace-nowrap text-right`}>
                    {qty > 0 ? (
                      <>
                        <span className="block font-medium text-fg">{formatEUR(q.lineNetCents)}</span>
                        <span className="block text-[10px] text-ok">risparmio {formatEUR(q.savingsCents)}</span>
                      </>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-sm text-muted">
                  Nessun componente corrisponde ai filtri impostati.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
