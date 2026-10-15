"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Lock, Repeat, Webhook } from "lucide-react";
import type { Invoice, Permission, WebhookLogEntry } from "@/types";
import { formatEUR } from "@/lib/money";
import { can, ROLES } from "@/lib/rbac";
import { buildFatturaPaXml, PAYMENT_CODES } from "@/lib/fatturapa";
import { signEvent } from "@/lib/stripe";
import { usePortal } from "@/components/PortalProvider";
import { GuardedButton, PermBadge } from "@/components/rbac/Guarded";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";

const dateTime = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "medium" });
const dateOnly = new Intl.DateTimeFormat("it-IT", { dateStyle: "short" });

function Denied({ permission, what }: { permission: Permission; what: string }) {
  const { role } = usePortal();
  return (
    <div className="grid-bg flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line px-4 py-10 text-center">
      <Lock aria-hidden className="size-5 text-danger" />
      <p className="text-sm font-medium text-fg">Permesso negato: ruolo {ROLES[role].label}</p>
      <p className="max-w-md text-xs text-muted">
        {what} è riservato al ruolo «Amministrazione &amp; Contabilità». La stessa verifica è applicata lato server (deny-by-default).
      </p>
      <PermBadge permission={permission} granted={false} />
    </div>
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

function InvoicesSection() {
  const { role, state } = usePortal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.invoices.find((i) => i.id === selectedId) ?? state.invoices[0] ?? null;
  const xml = useMemo(() => (selected ? buildFatturaPaXml(selected) : ""), [selected]);

  if (!can(role, "invoice:read")) return <Denied permission="invoice:read" what="Il registro fatture SDI" />;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 rounded-sm border border-line">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <caption className="sr-only">Fatture elettroniche emesse nella sessione</caption>
            <thead className="border-b border-line bg-panel-2 text-[10px] uppercase tracking-wider text-dim">
              <tr>
                <th scope="col" className="px-2.5 py-2 text-left font-medium">Numero · data</th>
                <th scope="col" className="px-2.5 py-2 text-left font-medium">Cliente</th>
                <th scope="col" className="px-2.5 py-2 text-left font-medium">Pagamento</th>
                <th scope="col" className="px-2.5 py-2 text-right font-medium">Totale</th>
                <th scope="col" className="px-2.5 py-2 text-left font-medium">Stato SDI</th>
                <th scope="col" className="px-2.5 py-2 text-right font-medium">XML</th>
              </tr>
            </thead>
            <tbody>
              {state.invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className={`flash-row border-b border-line/70 ${selected?.id === inv.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}
                >
                  <td className="px-2.5 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(inv.id)}
                      aria-pressed={selected?.id === inv.id}
                      className="num text-left text-amber hover:underline"
                    >
                      {inv.number}
                    </button>
                    <span className="num block text-[10.5px] text-dim">
                      {dateOnly.format(new Date(inv.issueDate))} · {inv.orderCode}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="block text-fg">{inv.customer.legalName}</span>
                    <span className="num block text-[10.5px] text-dim">
                      {inv.customer.vatNumber} · {inv.vatRegime === "esente_art8" ? "N3.5" : "IVA 22%"}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="num block text-fg">{PAYMENT_CODES[inv.paymentMethod].label}</span>
                    <span className="num block text-[10.5px] text-dim">scad. {dateOnly.format(new Date(inv.dueDate))}</span>
                  </td>
                  <td className="num px-2.5 py-2 text-right text-fg">{formatEUR(inv.totalCents)}</td>
                  <td className="px-2.5 py-2">
                    <span
                      className={`num inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] ${
                        inv.sdiStatus === "RC_CONSEGNATA" ? "border-ok/40 bg-ok/10 text-ok" : "border-warn/40 bg-warn/10 text-warn"
                      }`}
                    >
                      {inv.sdiStatus === "IN_ELABORAZIONE" && <span aria-hidden className="pulse-dot size-1.5 rounded-full bg-warn" />}
                      {inv.sdiStatus === "RC_CONSEGNATA" ? "RC · Consegnata" : "In elaborazione"}
                    </span>
                    <span className="num block text-[10px] text-dim">ID SdI {inv.sdiIdentifier}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <GuardedButton
                      permission="invoice:export_xml"
                      onClick={() => downloadXml(inv)}
                      className="inline-flex items-center gap-1 rounded-sm border border-line-strong px-2 py-1 text-[11px] text-fg hover:border-amber"
                      aria-label={`Scarica XML FatturaPA ${inv.number}`}
                    >
                      <Download aria-hidden className="size-3.5" /> FPR12
                    </GuardedButton>
                  </td>
                </tr>
              ))}
              {state.invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted">
                    Nessuna fattura in sessione. Emetti un ordine con i ruoli Buyer Tecnico, Key Account o Agente Commerciale: la fattura
                    comparirà qui con il relativo tracciato FatturaPA.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex min-w-0 flex-col rounded-sm border border-line p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
            <FileText aria-hidden className="size-3.5 text-amber" />
            Anteprima XML {selected ? <span className="num text-muted">{selected.sdiFileName}</span> : null}
          </p>
          {selected && <CopyButton text={xml} label="Copia XML" />}
        </div>
        {selected ? (
          <CodeBlock code={xml} language="text" label="Tracciato XML FatturaPA" className="max-h-[420px]" />
        ) : (
          <p className="grid-bg flex min-h-[180px] items-center justify-center rounded-sm border border-dashed border-line p-4 text-center text-xs text-muted">
            Il tracciato FPR12 della fattura selezionata viene generato lato client dalla funzione pura buildFatturaPaXml.
          </p>
        )}
      </div>
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

  return (
    <li className="flash-row border-b border-line/70 px-3 py-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="num rounded-sm bg-panel-2 px-1.5 py-0.5 text-info-soft">{entry.type}</span>
            <span
              className={`num rounded-sm border px-1.5 py-0.5 text-[10px] ${
                entry.outcome === "processed" ? "border-ok/40 bg-ok/10 text-ok" : "border-amber/50 bg-amber/10 text-amber-soft"
              }`}
            >
              {entry.outcome}
            </span>
            {entry.isReplay && <span className="num text-[10px] text-dim">replay manuale</span>}
            <span className="num text-[10px] text-muted">HTTP {entry.httpStatus}</span>
            <span className={`num text-[10px] ${entry.signatureVerified ? "text-ok" : "text-danger"}`}>
              firma {entry.signatureVerified ? "verificata" : "non valida"}
            </span>
          </p>
          <p className="num mt-1 truncate text-[11px] text-muted">
            {dateTime.format(new Date(entry.receivedAt))} · {entry.eventId} · {entry.orderCode} · {formatEUR(entry.amountCents)}
          </p>
        </div>
        <GuardedButton
          permission="webhook:replay"
          blockedReason={busy ? "Ritrasmissione in corso" : null}
          onClick={replay}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong px-2 py-1 text-[11px] text-fg hover:border-amber"
        >
          <Repeat aria-hidden className="size-3.5" /> Replay evento
        </GuardedButton>
      </div>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] text-dim hover:text-fg">Payload e Stripe-Signature</summary>
        <p className="num mt-1 break-all text-[10.5px] text-muted">Stripe-Signature: {entry.webhook.signatureHeader}</p>
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
  if (!can(role, "webhook:read_log")) return <Denied permission="webhook:read_log" what="Il log dei webhook Stripe" />;
  const processed = state.webhookLog.filter((e) => e.outcome === "processed").length;
  const duplicates = state.webhookLog.length - processed;

  return (
    <div className="rounded-sm border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-2">
        <p className="text-xs text-muted">
          Consumer idempotente: deduplica su <span className="num text-fg">event.id</span>, risposta 200 anche ai duplicati per fermare i
          retry di Stripe.
        </p>
        <p className="num text-[11px] text-muted">
          <span className="text-ok">{processed} processed</span> · <span className="text-amber-soft">{duplicates} duplicate_ignored</span> ·{" "}
          {state.processedEventIds.size} event.id univoci
        </p>
      </div>
      {state.webhookLog.length === 0 ? (
        <p className="px-3 py-10 text-center text-xs text-muted">
          Nessun evento ricevuto. Gli ordini emessi dagli altri ruoli generano qui gli eventi checkout.session.completed e invoice.created.
        </p>
      ) : (
        <ul>
          {state.webhookLog.map((e) => (
            <WebhookRow key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminPanel() {
  return (
    <div className="grid gap-4">
      <section aria-labelledby="invoices-title" className="rounded-sm border border-line bg-panel p-3">
        <h2 id="invoices-title" className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <FileText aria-hidden className="size-4 text-amber" /> Fatture elettroniche SDI
        </h2>
        <p className="mb-3 text-xs text-muted">
          Tracciato FatturaPA FPR12 con natura N3.5 per le dichiarazioni d&apos;intento, bollo virtuale e scadenze DFFM. Download reale del
          file XML generato nel browser.
        </p>
        <InvoicesSection />
      </section>
      <section aria-labelledby="webhooks-title" className="rounded-sm border border-line bg-panel p-3">
        <h2 id="webhooks-title" className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <Webhook aria-hidden className="size-4 text-amber" /> Log webhook Stripe
        </h2>
        <p className="mb-3 text-xs text-muted">
          Ogni consegna è registrata con esito e verifica firma. Il replay ritrasmette lo stesso evento con nuova firma: il consumer lo
          riconosce e lo ignora (<span className="num">duplicate_ignored</span>).
        </p>
        <WebhookSection />
      </section>
    </div>
  );
}
