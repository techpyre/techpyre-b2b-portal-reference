"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Lock, Repeat } from "lucide-react";
import type { Invoice, Permission, WebhookLogEntry } from "@/types";
import { formatEUR } from "@/lib/money";
import { can, ROLES } from "@/lib/rbac";
import { PAYMENT_METHODS } from "@/lib/orders";
import { buildFatturaPaXml, PAYMENT_CODES } from "@/lib/fatturapa";
import { signEvent } from "@/lib/stripe";
import { usePortal } from "@/components/PortalProvider";
import { GuardedButton, PermBadge } from "@/components/rbac/Guarded";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "medium" });
const dateOnly = new Intl.DateTimeFormat("it-IT", { dateStyle: "short" });

function Denied({ permission }: { permission: Permission }) {
  const { role } = usePortal();
  return (
    <div className="flex flex-col items-center gap-2 rounded border border-dashed border-line-strong px-4 py-8 text-center">
      <Lock aria-hidden className="size-5 text-dim" />
      <p className="text-sm font-medium text-fg">Riservato all&apos;Amministrazione</p>
      <p className="text-[13px] text-dim">Il ruolo {ROLES[role].shortLabel} non ha accesso. Il blocco vale anche lato server.</p>
      <PermBadge permission={permission} granted={false} />
    </div>
  );
}

function SdiStatus({ invoice }: { invoice: Invoice }) {
  const delivered = invoice.sdiStatus === "RC_CONSEGNATA";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${delivered ? "text-ok" : "text-warn"}`}>
      <span aria-hidden className={`size-2 rounded-full ${delivered ? "bg-ok" : "pulse-dot bg-warn"}`} />
      {delivered ? "Consegnata" : "In elaborazione"}
    </span>
  );
}

function downloadXml(invoice: Invoice) {
  const xml = buildFatturaPaXml(invoice);
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = invoice.sdiFileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function Section({ id, title, meta, children }: { id: string; title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-md border border-line bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
        <h2 id={id} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {meta && <div className="text-[13px] text-dim">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

function OrdersSection() {
  const { state } = usePortal();
  if (state.orders.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-fg">Nessun ordine in questa sessione.</p>
        <Link href="/" className="mt-1 inline-block text-sm font-medium text-info hover:underline">
          Vai al catalogo
        </Link>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {state.orders.map((o) => (
        <li key={o.orderCode} className="flash-row grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="min-w-0">
            <p className="text-sm">
              <span className="mono font-medium text-fg">{o.orderCode}</span>
              <span className="text-dim"> · {dateTime.format(new Date(o.createdAt))}</span>
            </p>
            <p className="truncate text-[13px] text-muted">
              {o.customer.legalName} · {o.totals.lines.length} {o.totals.lines.length === 1 ? "riga" : "righe"} ·{" "}
              {PAYMENT_METHODS.find((m) => m.id === o.paymentMethod)?.label} · inviato da {ROLES[o.role].shortLabel}
            </p>
          </div>
          <div className="flex items-baseline justify-between gap-4 sm:block sm:text-right">
            <p className="num text-sm font-semibold text-fg">{formatEUR(o.totals.grandTotalCents)}</p>
            <p className="num text-xs text-dim">Fattura {o.invoice.number}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function InvoicesSection() {
  const { role, state } = usePortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.invoices.find((i) => i.id === selectedId) ?? state.invoices[0] ?? null;
  const xml = useMemo(() => (selected ? buildFatturaPaXml(selected) : ""), [selected]);

  if (!can(role, "invoice:read"))
    return (
      <div className="p-4">
        <Denied permission="invoice:read" />
      </div>
    );

  if (state.invoices.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted">Nessuna fattura. Invia un ordine con un ruolo cliente o agente.</p>;
  }

  const xmlButton = (inv: Invoice) => (
    <GuardedButton
      permission="invoice:export_xml"
      onClick={() => downloadXml(inv)}
      className="inline-flex h-9 items-center gap-1.5 rounded border border-line-strong px-2.5 text-[13px] text-fg hover:border-fg"
      aria-label={`Scarica XML FatturaPA ${inv.number}`}
    >
      <Download aria-hidden className="size-4" /> XML
    </GuardedButton>
  );

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
        {/* Mobile: schede */}
        <ul className="divide-y divide-line md:hidden">
          {state.invoices.map((inv) => (
            <li key={inv.id} className={`flash-row px-4 py-3 ${selected?.id === inv.id ? "bg-panel-2" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedId(inv.id)}
                  aria-pressed={selected?.id === inv.id}
                  className="min-w-0 text-left"
                >
                  <span className="num block text-sm font-medium text-info">{inv.number}</span>
                  <span className="block truncate text-[13px] text-fg">{inv.customer.legalName}</span>
                  <span className="num block text-xs text-dim">
                    {dateOnly.format(new Date(inv.issueDate))} · scad. {dateOnly.format(new Date(inv.dueDate))}
                  </span>
                </button>
                <span className="num shrink-0 text-sm font-semibold text-fg">{formatEUR(inv.totalCents)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <SdiStatus invoice={inv} />
                {xmlButton(inv)}
              </div>
            </li>
          ))}
        </ul>

        {/* Desktop: tabella */}
        <div className="scrollbar-thin hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Fatture elettroniche emesse nella sessione</caption>
            <thead className="border-b border-line bg-panel-2 text-xs text-dim">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Numero
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Cliente
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  Pagamento
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Totale
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  SDI
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.invoices.map((inv) => (
                <tr key={inv.id} className={`flash-row border-b border-line last:border-b-0 ${selected?.id === inv.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(inv.id)}
                      aria-pressed={selected?.id === inv.id}
                      className="num text-left font-medium text-info hover:underline"
                    >
                      {inv.number}
                    </button>
                    <span className="num block text-xs text-dim">
                      {dateOnly.format(new Date(inv.issueDate))} · <span className="mono">{inv.orderCode}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-fg">{inv.customer.legalName}</span>
                    <span className="num block text-xs text-dim">
                      {inv.customer.vatNumber} · {inv.vatRegime === "esente_art8" ? "N3.5" : "IVA 22%"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-fg">{PAYMENT_CODES[inv.paymentMethod].label}</span>
                    <span className="num block text-xs text-dim">scad. {dateOnly.format(new Date(inv.dueDate))}</span>
                  </td>
                  <td className="num px-3 py-2.5 text-right font-medium text-fg">{formatEUR(inv.totalCents)}</td>
                  <td className="px-3 py-2.5">
                    <SdiStatus invoice={inv} />
                    <span className="mono block text-[11px] text-dim">{inv.sdiIdentifier}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{xmlButton(inv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="min-w-0 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-medium text-fg">
              XML FatturaPA <span className="mono break-all text-xs font-normal text-dim">{selected.sdiFileName}</span>
            </p>
            <CopyButton text={xml} label="Copia XML" />
          </div>
          <CodeBlock code={xml} language="text" label="Tracciato XML FatturaPA" className="max-h-[420px]" />
        </div>
      )}
    </div>
  );
}

function WebhookRow({ entry }: { entry: WebhookLogEntry }) {
  const { replayWebhook } = usePortal();
  const [busy, setBusy] = useState(false);

  async function replay() {
    setBusy(true);
    try {
      // Stripe ritrasmette lo stesso evento (stesso event.id) con una nuova firma.
      const resigned = await signEvent(entry.webhook.event, Math.floor(Date.now() / 1000));
      const res = await fetch("/api/webhooks/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Stripe-Signature": resigned.signatureHeader },
        body: resigned.payload,
      });
      replayWebhook({ ...resigned, verified: resigned.verified && res.status === 200 }, entry.orderCode, entry.companyId);
    } finally {
      setBusy(false);
    }
  }

  const processed = entry.outcome === "processed";

  return (
    <li className="flash-row px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="mono font-medium text-fg">{entry.type}</span>
            <span className={`text-[13px] font-medium ${processed ? "text-ok" : "text-warn"}`}>{processed ? "elaborato" : "duplicato ignorato"}</span>
            {entry.isReplay && <span className="text-[13px] text-dim">· replay</span>}
          </p>
          <p className="num mt-0.5 text-xs text-dim">
            {dateTime.format(new Date(entry.receivedAt))} · HTTP {entry.httpStatus} ·{" "}
            <span className={entry.signatureVerified ? "" : "text-danger"}>firma {entry.signatureVerified ? "valida" : "non valida"}</span> ·{" "}
            <span className="mono">{entry.orderCode}</span> · {formatEUR(entry.amountCents)}
          </p>
        </div>
        <GuardedButton
          permission="webhook:replay"
          blockedReason={busy ? "Ritrasmissione in corso" : null}
          onClick={replay}
          className="inline-flex h-9 items-center gap-1.5 rounded border border-line-strong px-2.5 text-[13px] text-fg hover:border-fg"
        >
          <Repeat aria-hidden className="size-4" /> Replay
        </GuardedButton>
      </div>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-xs text-dim hover:text-fg">Payload e firma</summary>
        <p className="mono mt-1 break-all text-[11px] text-dim">
          {entry.eventId} · Stripe-Signature: {entry.webhook.signatureHeader}
        </p>
        <div className="mt-1 flex justify-end">
          <CopyButton text={entry.webhook.payload} />
        </div>
        <CodeBlock code={entry.webhook.payload} language="json" label={`Payload ${entry.eventId}`} className="mt-1 max-h-72" />
      </details>
    </li>
  );
}

function WebhookSection() {
  const { role, state } = usePortal();
  if (!can(role, "webhook:read_log"))
    return (
      <div className="p-4">
        <Denied permission="webhook:read_log" />
      </div>
    );

  return state.webhookLog.length === 0 ? (
    <p className="px-4 py-8 text-center text-sm text-muted">Nessun evento ricevuto.</p>
  ) : (
    <ul className="divide-y divide-line">
      {state.webhookLog.map((e) => (
        <WebhookRow key={e.id} entry={e} />
      ))}
    </ul>
  );
}

function WebhookMeta() {
  const { role, state } = usePortal();
  if (!can(role, "webhook:read_log") || state.webhookLog.length === 0) return null;
  const processed = state.webhookLog.filter((e) => e.outcome === "processed").length;
  const duplicates = state.webhookLog.length - processed;
  return (
    <span className="num">
      {processed} elaborati · {duplicates} duplicati ignorati
    </span>
  );
}

export function AdminPanel() {
  const { state } = usePortal();
  return (
    <div className="grid gap-4">
      <Section id="orders-title" title="Ordini" meta={state.orders.length > 0 ? <span className="num">{state.orders.length} in sessione</span> : null}>
        <OrdersSection />
      </Section>
      <Section id="invoices-title" title="Fatture elettroniche" meta="FatturaPA FPR12 · download XML reale">
        <InvoicesSection />
      </Section>
      <Section id="webhooks-title" title="Notifiche Stripe" meta={<WebhookMeta />}>
        <details className="border-b border-line px-4 py-2 text-[13px] text-dim">
          <summary className="cursor-pointer hover:text-fg">Come funziona il replay</summary>
          <p className="mt-1 max-w-2xl">
            Ogni evento è deduplicato su <span className="mono">event.id</span>. Il replay ritrasmette lo stesso evento con una nuova firma: il server
            risponde 200 ma lo ignora.
          </p>
        </details>
        <WebhookSection />
      </Section>
    </div>
  );
}
