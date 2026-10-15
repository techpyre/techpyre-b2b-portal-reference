"use client";

import { useEffect, useId, useState } from "react";
import { Send, ShoppingCart, Trash, TriangleAlert, Truck, X } from "lucide-react";
import { formatBp, formatEUR } from "@/lib/money";
import { can, deniedReason } from "@/lib/rbac";
import { PAYMENT_METHODS } from "@/lib/orders";
import { STAMP_DUTY_THRESHOLD_CENTS } from "@/lib/checkout";
import { usePortal } from "@/components/PortalProvider";
import { GuardedButton, PermBadge } from "@/components/rbac/Guarded";
import { EmissionModal } from "@/components/order/EmissionModal";

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={`text-xs ${strong ? "font-medium text-fg" : "text-muted"}`}>{label}</dt>
      <dd className={`num text-right ${strong ? "text-base font-semibold text-fg" : tone === "ok" ? "text-xs text-ok" : "text-xs text-fg"}`}>
        {value}
      </dd>
    </div>
  );
}

export function CartPanel() {
  const {
    role,
    company,
    totals,
    state,
    removeLine,
    clearCart,
    setVatRegime,
    setPaymentMethod,
    effectivePayment,
    effectiveVatRegime,
  } = usePortal();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emitOpen, setEmitOpen] = useState(false);
  const exemptId = useId();
  const lineCount = totals.lines.length;
  const canEdit = can(role, "cart:edit");
  const canExempt = can(role, "tax:exemption_declare");
  const exemptAvailable = canExempt && company.intentDeclarationProtocol !== null;

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const blockedReason = lineCount === 0 ? "Carrello vuoto: aggiungi almeno una riga" : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-sm border border-amber bg-amber px-3.5 py-2.5 text-sm font-semibold text-ink shadow-lg shadow-black/50 lg:hidden"
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-controls="cart-panel"
      >
        <ShoppingCart aria-hidden className="size-4" />
        Carrello · {lineCount}
        <span className="num">{formatEUR(totals.grandTotalCents)}</span>
      </button>

      {drawerOpen && (
        <div aria-hidden className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        id="cart-panel"
        aria-labelledby="cart-title"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-panel transition-transform duration-200 lg:sticky lg:top-[4.25rem] lg:z-0 lg:h-[calc(100vh-5.5rem)] lg:max-w-none lg:translate-x-0 lg:rounded-sm lg:border ${
          drawerOpen ? "visible translate-x-0" : "invisible translate-x-full lg:visible"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <div>
            <h2 id="cart-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <ShoppingCart aria-hidden className="size-4 text-amber" /> Carrello ordine rapido
            </h2>
            <p className="num text-[11px] text-muted">
              {company.vatNumber} · {lineCount} {lineCount === 1 ? "riga" : "righe"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {lineCount > 0 && canEdit && (
              <button type="button" onClick={clearCart} className="rounded-sm px-2 py-1 text-[11px] text-muted hover:bg-panel-2 hover:text-fg">
                Svuota
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-sm p-1.5 text-muted hover:bg-panel-2 hover:text-fg lg:hidden"
              aria-label="Chiudi carrello"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto">
          {lineCount === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted">
              Nessuna riga. Imposta le quantità dalla colonna «Quantità» del catalogo.
            </p>
          ) : (
            <ul className="divide-y divide-line/70">
              {totals.lines.map(({ product, quote, allocation }) => (
                <li key={product.sku} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="num text-[11px] text-amber">{product.sku}</p>
                      <p className="truncate text-xs text-fg" title={product.name}>
                        {product.name}
                      </p>
                      <p className="num text-[11px] text-muted">
                        {quote.quantity} × {formatEUR(quote.netUnitCents)} · {quote.volumeTier.label}
                        {quote.overrideDiscountBp > 0 && <span className="text-info-soft"> · override −{formatBp(quote.overrideDiscountBp)}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <span className="num text-xs font-medium text-fg">{formatEUR(quote.lineNetCents)}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeLine(product.sku)}
                          className="rounded-sm p-1 text-dim hover:bg-panel-2 hover:text-danger"
                          aria-label={`Rimuovi ${product.sku}`}
                        >
                          <Trash aria-hidden className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {allocation.status !== "single" && (
                    <p
                      className={`mt-1 flex items-start gap-1.5 rounded-[2px] border px-2 py-1 text-[11px] leading-snug ${
                        allocation.status === "backorder" ? "border-warn/40 bg-warn/10 text-warn" : "border-info/40 bg-info/10 text-info-soft"
                      }`}
                    >
                      {allocation.status === "backorder" ? (
                        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                      ) : (
                        <Truck aria-hidden className="mt-px size-3.5 shrink-0" />
                      )}
                      <span className="num">
                        {allocation.status === "backorder"
                          ? `Giacenza insufficiente: BG ${allocation.fromBG} + BS ${allocation.fromBS}, ${allocation.backorder} pz in backorder · lead time ${allocation.leadTimeDays} gg lav.`
                          : `Split spedizione: BG ${allocation.fromBG} + BS ${allocation.fromBS} · consolidamento ${allocation.leadTimeDays} gg lav.`}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line px-3 py-2.5">
          <fieldset className="mb-2">
            <legend className="mb-1 text-[10px] uppercase tracking-wider text-dim">Regime IVA</legend>
            <div className="tip flex w-full">
              <label
                htmlFor={exemptId}
                className={`flex w-full items-start gap-2 rounded-sm border px-2 py-1.5 text-[11px] leading-snug ${
                  effectiveVatRegime === "esente_art8" ? "border-amber/60 bg-amber/10 text-fg" : "border-line text-muted"
                } ${exemptAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
              >
                <input
                  id={exemptId}
                  type="checkbox"
                  className="mt-0.5 accent-[#F97316]"
                  checked={effectiveVatRegime === "esente_art8"}
                  aria-disabled={!exemptAvailable}
                  onChange={(e) => {
                    if (!exemptAvailable) return;
                    setVatRegime(e.target.checked ? "esente_art8" : "ordinaria");
                  }}
                />
                <span>
                  Esente Art. 8 c.1 lett. c) DPR 633/72 — Dichiarazione d&apos;Intento
                  <span className="num block text-dim">
                    {company.intentDeclarationProtocol ? `Prot. ${company.intentDeclarationProtocol}` : "Nessuna dichiarazione registrata per il cliente"}
                  </span>
                </span>
              </label>
              {!exemptAvailable && (
                <span role="tooltip" className="tip-body rounded-sm border border-line-strong bg-panel-2 px-2.5 py-2 text-xs text-fg shadow-xl">
                  {canExempt ? "Il cliente non ha una dichiarazione d'intento" : deniedReason(role, "tax:exemption_declare")}
                  {!canExempt && (
                    <span className="mt-1 block">
                      <PermBadge permission="tax:exemption_declare" granted={false} />
                    </span>
                  )}
                </span>
              )}
            </div>
          </fieldset>

          <fieldset className="mb-2">
            <legend className="mb-1 text-[10px] uppercase tracking-wider text-dim">Modalità di pagamento</legend>
            <div className="grid gap-1">
              {PAYMENT_METHODS.map((m) => {
                const allowed = can(role, m.permission);
                const checked = effectivePayment === m.id && allowed;
                return (
                  <label
                    key={m.id}
                    title={allowed ? m.detail : deniedReason(role, m.permission)}
                    className={`flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-[11px] ${
                      checked ? "border-amber/60 bg-amber/10 text-fg" : "border-line text-muted"
                    } ${allowed ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="payment"
                        value={m.id}
                        checked={checked}
                        disabled={!allowed}
                        onChange={() => setPaymentMethod(m.id)}
                        className="accent-[#F97316]"
                      />
                      <span>
                        <span className="block text-fg">{m.label}</span>
                        <span className="block text-dim">{allowed ? m.detail : "Permesso negato"}</span>
                      </span>
                    </span>
                    {!allowed && <PermBadge permission={m.permission} granted={false} />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <dl className="border-t border-line pt-1.5">
            <Row label="Totale a listino pubblico" value={formatEUR(totals.listTotalCents)} />
            <Row label="Risparmio vs listino" value={`− ${formatEUR(totals.savingsCents)}`} tone="ok" />
            <Row label="Imponibile merce" value={formatEUR(totals.taxableGoodsCents)} />
            <Row
              label={totals.freeShipping ? "Trasporto · franco destino" : `Trasporto (franco ≥ ${formatEUR(company.freeShippingThresholdCents)})`}
              value={totals.freeShipping ? "incluso" : formatEUR(totals.shippingCents)}
            />
            <Row
              label={effectiveVatRegime === "esente_art8" ? "IVA · non imponibile N3.5" : `IVA ${formatBp(totals.vatRateBp)}`}
              value={formatEUR(totals.vatCents)}
            />
            {totals.stampDutyCents > 0 && (
              <Row label={`Bollo virtuale (imponibile > ${formatEUR(STAMP_DUTY_THRESHOLD_CENTS)})`} value={formatEUR(totals.stampDutyCents)} />
            )}
            {can(role, "price:view_margin") && <Row label="Provvigione agente maturata" value={formatEUR(totals.commissionCents)} />}
            <div className="mt-1 border-t border-line pt-1">
              <Row label="Totale documento" value={formatEUR(totals.grandTotalCents)} strong />
            </div>
          </dl>

          <GuardedButton
            permission="order:submit"
            blockedReason={blockedReason}
            onClick={() => {
              setEmitOpen(true);
              setDrawerOpen(false);
            }}
            wrapperClassName="mt-2 w-full"
            className="flex w-full items-center justify-center gap-2 rounded-sm bg-amber px-3 py-2.5 text-xs font-semibold text-ink hover:bg-amber-soft"
          >
            <Send aria-hidden className="size-3.5" />
            Simula Emissione Ordine &amp; Trigger Stripe Webhook
          </GuardedButton>
          {state.orders.length > 0 && (
            <p className="mt-1.5 text-center text-[10.5px] text-dim">
              {state.orders.length} {state.orders.length === 1 ? "ordine emesso" : "ordini emessi"} in questa sessione · visibili al ruolo Amministrazione
            </p>
          )}
        </div>
      </aside>

      {emitOpen && <EmissionModal onClose={() => setEmitOpen(false)} />}
    </>
  );
}
