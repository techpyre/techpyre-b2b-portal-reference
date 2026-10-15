"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronUp, Download, Lock, Printer, Send, ShoppingCart, Trash2, TriangleAlert, Truck, X } from "lucide-react";
import { centsToDecimal, formatBp, formatEUR, formatUnitPrice } from "@/lib/money";
import { can, deniedReason } from "@/lib/rbac";
import { PAYMENT_METHODS } from "@/lib/orders";
import { STAMP_DUTY_THRESHOLD_CENTS } from "@/lib/checkout";
import { usePortal } from "@/components/PortalProvider";
import { GuardedButton } from "@/components/rbac/Guarded";
import { EmissionModal } from "@/components/order/EmissionModal";

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className={strong ? "text-sm font-semibold text-fg" : "text-[13px] text-muted"}>{label}</dt>
      <dd className={`num text-right ${strong ? "text-lg font-semibold text-fg" : tone === "ok" ? "text-[13px] text-ok" : "text-[13px] text-fg"}`}>
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  const blockedReason = lineCount === 0 ? "Carrello vuoto" : null;
  const rowsLabel = `${lineCount} ${lineCount === 1 ? "riga" : "righe"}`;

  const exportCsv = () => {
    if (totals.lines.length === 0) return;
    const header = [
      "Codice SKU",
      "Descrizione Articolo",
      "Quantità",
      "Listino Unitario",
      "Sconto Totale %",
      "Prezzo Netto Unitario",
      "Totale Riga Netto",
      "Allocazione Magazzino",
    ];

    const csvRows: string[] = [header.map((h) => `"${h}"`).join(";")];

    for (const { product, quote, allocation } of totals.lines) {
      const allocText =
        allocation.status === "single"
          ? `BG ${allocation.fromBG} (Pronta consegna)`
          : allocation.status === "split"
          ? `BG ${allocation.fromBG} + BS ${allocation.fromBS} (${allocation.leadTimeDays} gg)`
          : `BG ${allocation.fromBG} + BS ${allocation.fromBS} (${allocation.backorder} pz riordino, ${allocation.leadTimeDays} gg)`;

      csvRows.push(
        [
          `"${product.sku}"`,
          `"${product.name.replace(/"/g, '""')}"`,
          quote.quantity,
          `"${centsToDecimal(quote.listUnitCents)} €"`,
          `"-${formatBp(quote.compoundDiscountBp)}"`,
          `"${centsToDecimal(Math.round(quote.exactNetUnitPriceCents * 10) / 10)} €"`,
          `"${centsToDecimal(quote.lineNetCents)} €"`,
          `"${allocText}"`,
        ].join(";")
      );
    }

    csvRows.push("");
    csvRows.push(`"Riepilogo Preventivo / Ordine";"";"";"";"";"";"";""`);
    csvRows.push(`"Cliente: ${company.legalName} (P.IVA ${company.vatNumber})";"";"";"";"";"";"";""`);
    csvRows.push(`"Totale Merce Listino";"";"";"";"";"";"${centsToDecimal(totals.listTotalCents)} €";""`);
    csvRows.push(`"Totale Sconti";"";"";"";"";"";"-${centsToDecimal(totals.savingsCents)} €";""`);
    csvRows.push(`"Imponibile Merce";"";"";"";"";"";"${centsToDecimal(totals.taxableGoodsCents)} €";""`);
    csvRows.push(
      `"Trasporto";"";"";"";"";"";"${totals.freeShipping ? "Gratuito" : centsToDecimal(totals.shippingCents) + " €"}";""`
    );
    csvRows.push(`"IVA";"";"";"";"";"";"${centsToDecimal(totals.vatCents)} €";""`);
    if (totals.stampDutyCents > 0) {
      csvRows.push(`"Imposta di Bollo";"";"";"";"";"";"${centsToDecimal(totals.stampDutyCents)} €";""`);
    }
    csvRows.push(`"TOTALE DOCUMENTO";"";"";"";"";"";"${centsToDecimal(totals.grandTotalCents)} €";""`);

    const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `preventivo_valkiria_${company.id}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Barra riepilogo fissa (sotto xl) */}
      <div id="cart-bar" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 shadow-[0_-4px_16px_rgb(0_0_0/0.06)] backdrop-blur xl:hidden">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 pt-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-dim">
              {rowsLabel} · totale documento
            </p>
            <p className="num text-lg font-semibold leading-tight text-fg">{formatEUR(totals.grandTotalCents)}</p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 items-center gap-2 rounded bg-fg px-4 text-sm font-medium text-panel hover:bg-fg/90"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="cart-panel"
          >
            <ShoppingCart aria-hidden className="size-4" />
            Carrello
            <ChevronUp aria-hidden className="size-4 opacity-70" />
          </button>
        </div>
      </div>

      {drawerOpen && <div aria-hidden className="fixed inset-0 z-40 bg-black/40 xl:hidden" onClick={() => setDrawerOpen(false)} />}

      <aside
        id="cart-panel"
        aria-labelledby="cart-title"
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-xl border border-b-0 border-line bg-panel shadow-2xl transition-transform duration-200 xl:visible xl:sticky xl:inset-auto xl:top-4 xl:z-0 xl:max-h-[calc(100dvh-2rem)] xl:max-w-none xl:translate-y-0 xl:self-start xl:rounded-md xl:border-b xl:shadow-none ${
          drawerOpen ? "visible translate-y-0" : "invisible translate-y-full"
        }`}
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong xl:hidden" />
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div>
            <h2 id="cart-title" className="text-base font-semibold text-fg">
              Carrello
            </h2>
            <p className="text-xs text-dim">{rowsLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            {lineCount > 0 && canEdit && (
              <button type="button" onClick={clearCart} className="h-10 rounded px-2.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg xl:h-8">
                Svuota
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="grid size-11 place-items-center rounded text-muted hover:bg-panel-2 hover:text-fg xl:hidden"
              aria-label="Chiudi carrello"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {lineCount === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Il carrello è vuoto. Imposta le quantità dal catalogo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {totals.lines.map(({ product, quote, allocation }) => (
                <li key={product.sku} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="mono text-xs text-amber">{product.sku}</p>
                      <p className="truncate text-sm text-fg" title={product.name}>
                        {product.name}
                      </p>
                      <p className="num text-xs text-dim">
                        {quote.quantity} × {formatUnitPrice(quote.exactNetUnitPriceCents)} · {quote.volumeTier.label}
                        {quote.overrideDiscountBp > 0 && <span className="text-info"> · extra −{formatBp(quote.overrideDiscountBp)}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <span className="num pt-0.5 text-sm font-medium text-fg">{formatEUR(quote.lineNetCents)}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeLine(product.sku)}
                          className="-mr-2 -mt-1.5 grid size-10 place-items-center rounded text-dim hover:bg-panel-2 hover:text-danger xl:size-8"
                          aria-label={`Rimuovi ${product.sku}`}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {allocation.status !== "single" && (
                    <p className={`num mt-1.5 flex items-start gap-1.5 text-xs leading-snug ${allocation.status === "backorder" ? "text-warn" : "text-muted"}`}>
                      {allocation.status === "backorder" ? (
                        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                      ) : (
                        <Truck aria-hidden className="mt-px size-3.5 shrink-0" />
                      )}
                      <span>
                        {allocation.status === "backorder"
                          ? `Disponibili BG ${allocation.fromBG} + BS ${allocation.fromBS} · ${allocation.backorder} pz in backorder (${allocation.leadTimeDays} gg)`
                          : `Spedizione da BG ${allocation.fromBG} + BS ${allocation.fromBS} · ${allocation.leadTimeDays} gg`}
                      </span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pb-safe border-t border-line px-4 pt-3 xl:pb-3">
          <fieldset className="mb-3">
            <legend className="mb-1.5 text-xs font-medium text-dim">Pagamento</legend>
            <div className="grid gap-1">
              {PAYMENT_METHODS.map((m) => {
                const allowed = can(role, m.permission);
                const checked = effectivePayment === m.id && allowed;
                return (
                  <label
                    key={m.id}
                    title={allowed ? m.detail : deniedReason(role, m.permission)}
                    className={`flex min-h-11 items-center gap-2.5 rounded border px-2.5 py-1.5 text-[13px] xl:min-h-0 ${
                      checked ? "border-fg bg-panel-2" : "border-line"
                    } ${allowed ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={m.id}
                      checked={checked}
                      disabled={!allowed}
                      onChange={() => setPaymentMethod(m.id)}
                      className="size-4 accent-[#14181f]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-fg">{m.label}</span>
                      <span className="block truncate text-xs text-dim">{allowed ? m.detail : "Non abilitato per questo ruolo"}</span>
                    </span>
                    {!allowed && <Lock aria-hidden className="size-3.5 shrink-0 text-dim" />}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="tip mb-3 flex w-full">
            <label
              htmlFor={exemptId}
              className={`flex w-full items-start gap-2.5 text-[13px] leading-snug ${exemptAvailable ? "cursor-pointer text-fg" : "cursor-not-allowed text-dim"}`}
            >
              <input
                id={exemptId}
                type="checkbox"
                className="mt-0.5 size-4 accent-[#14181f]"
                checked={effectiveVatRegime === "esente_art8"}
                aria-disabled={!exemptAvailable}
                onChange={(e) => {
                  if (!exemptAvailable) return;
                  setVatRegime(e.target.checked ? "esente_art8" : "ordinaria");
                }}
              />
              <span>
                Esenzione IVA art. 8 (dichiarazione d&apos;intento)
                <span className="num block text-xs text-dim">
                  {company.intentDeclarationProtocol ? `Prot. ${company.intentDeclarationProtocol}` : "Nessuna dichiarazione registrata"}
                </span>
              </span>
            </label>
            {!exemptAvailable && (
              <span role="tooltip" className="tip-body rounded border border-line bg-panel px-2.5 py-2 text-xs text-fg shadow-lg">
                {canExempt ? "Il cliente non ha una dichiarazione d'intento" : deniedReason(role, "tax:exemption_declare")}
              </span>
            )}
          </div>

          <dl className="border-t border-line pt-2">
            <Row label="Merce a listino" value={formatEUR(totals.listTotalCents)} />
            <Row label="Sconto" value={`− ${formatEUR(totals.savingsCents)}`} tone="ok" />
            <Row label="Imponibile" value={formatEUR(totals.taxableGoodsCents)} />
            <Row
              label={totals.freeShipping ? "Trasporto" : `Trasporto (gratis da ${formatEUR(company.freeShippingThresholdCents)})`}
              value={totals.freeShipping ? "gratuito" : formatEUR(totals.shippingCents)}
            />
            <Row
              label={effectiveVatRegime === "esente_art8" ? "IVA (non imponibile N3.5)" : `IVA ${formatBp(totals.vatRateBp)}`}
              value={formatEUR(totals.vatCents)}
            />
            {totals.stampDutyCents > 0 && (
              <Row label={`Bollo (imponibile > ${formatEUR(STAMP_DUTY_THRESHOLD_CENTS)})`} value={formatEUR(totals.stampDutyCents)} />
            )}
            {can(role, "price:view_margin") && <Row label="Provvigione agente" value={formatEUR(totals.commissionCents)} />}
            <div className="mt-1.5 border-t border-line pt-1.5">
              <Row label="Totale" value={formatEUR(totals.grandTotalCents)} strong />
            </div>
          </dl>

          <GuardedButton
            permission="order:submit"
            blockedReason={blockedReason}
            onClick={() => {
              setEmitOpen(true);
              setDrawerOpen(false);
            }}
            wrapperClassName="mt-3 w-full"
            className="flex h-12 w-full items-center justify-center gap-2 rounded bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-soft xl:h-11"
          >
            <Send aria-hidden className="size-4" />
            Invia ordine
          </GuardedButton>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={lineCount === 0}
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-line-strong bg-panel px-2 text-xs font-medium text-fg hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
              title="Scarica preventivo in formato CSV compatibile Excel / ERP"
            >
              <Download className="size-3.5 text-muted" />
              Esporta CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={lineCount === 0}
              className="flex h-9 items-center justify-center gap-1.5 rounded border border-line-strong bg-panel px-2 text-xs font-medium text-fg hover:bg-panel-2 disabled:cursor-not-allowed disabled:opacity-40"
              title="Stampa preventivo d'ordine"
            >
              <Printer className="size-3.5 text-muted" />
              Stampa Preventivo
            </button>
          </div>
          {state.orders.length > 0 && (
            <p className="mt-2 text-center text-xs text-dim">
              {state.orders.length} {state.orders.length === 1 ? "ordine inviato" : "ordini inviati"} ·{" "}
              <Link href="/ordini" onClick={() => setDrawerOpen(false)} className="font-medium text-info hover:underline">
                Vedi ordini
              </Link>
            </p>
          )}
        </div>
      </aside>

      {emitOpen && <EmissionModal onClose={() => setEmitOpen(false)} />}
    </>
  );
}
