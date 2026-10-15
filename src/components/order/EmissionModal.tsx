"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, LoaderCircle, Play, X } from "lucide-react";
import type {
  ApiErrorResponse,
  OrderAcceptedResponse,
  OrderEmissionResult,
  OrderRequestBody,
  SignedWebhook,
} from "@/types";
import { formatEUR } from "@/lib/money";
import { ROLES } from "@/lib/rbac";
import { authorizeOrder, PAYMENT_METHODS } from "@/lib/orders";
import { overrideKey } from "@/lib/checkout";
import { buildInvoice } from "@/lib/fatturapa";
import { buildStripeEvents, signEvent } from "@/lib/stripe";
import { usePortal } from "@/components/PortalProvider";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";

type StepStatus = "pending" | "running" | "done" | "error";

interface Step {
  id: string;
  title: string;
  detail: string;
  status: StepStatus;
  ms: number | null;
}

const STEP_DEFS: ReadonlyArray<Pick<Step, "id" | "title">> = [
  { id: "policy", title: "Verifica permessi" },
  { id: "server", title: "Ricalcolo sul server" },
  { id: "stock", title: "Impegno giacenze" },
  { id: "invoice", title: "Numerazione fattura" },
  { id: "events", title: "Eventi di pagamento" },
  { id: "sign", title: "Firma webhook" },
  { id: "deliver", title: "Consegna webhook" },
  { id: "log", title: "Registrazione" },
];

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

type PayloadTab = "session" | "invoice" | "headers" | "server";

export function EmissionModal({ onClose }: { onClose: () => void }) {
  const portal = usePortal();
  const { role, company, totals, effectivePayment, effectiveVatRegime, activeOverrides, state, commitEmission } = portal;
  const [steps, setSteps] = useState<Step[]>(() =>
    STEP_DEFS.map((s) => ({ ...s, detail: "In attesa", status: "pending", ms: null })),
  );
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [webhooks, setWebhooks] = useState<SignedWebhook[]>([]);
  const [serverResponse, setServerResponse] = useState<string>("");
  const [result, setResult] = useState<OrderEmissionResult | null>(null);
  const [tab, setTab] = useState<PayloadTab>("session");
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  const update = (id: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function timed<T>(id: string, work: () => Promise<T> | T): Promise<T> {
    update(id, { status: "running", detail: "In esecuzione…" });
    const t0 = performance.now();
    const [value] = await Promise.all([Promise.resolve().then(work), sleep(420)]);
    update(id, { ms: Math.round(performance.now() - t0) });
    return value;
  }

  async function run() {
    setPhase("running");
    // Snapshot immutabile dello stato al momento del click.
    const snapshot = { role, company, totals, paymentMethod: effectivePayment, vatRegime: effectiveVatRegime };
    const fail = (id: string, detail: string) => {
      update(id, { status: "error", detail });
      setPhase("error");
    };

    const auth = await timed("policy", () =>
      authorizeOrder(snapshot.role, snapshot.company, snapshot.paymentMethod, snapshot.vatRegime, snapshot.totals.lines.some((l) => l.quote.overrideDiscountBp > 0)),
    );
    if (!auth.ok) return fail("policy", `${auth.message} (${auth.permission})`);
    update("policy", { status: "done", detail: `Ruolo ${ROLES[snapshot.role].shortLabel} autorizzato (order:submit)` });

    const body: OrderRequestBody = {
      role: snapshot.role,
      companyId: snapshot.company.id,
      vatRegime: snapshot.vatRegime,
      paymentMethod: snapshot.paymentMethod,
      lines: snapshot.totals.lines.map((l) => ({
        sku: l.product.sku,
        quantity: l.quote.quantity,
        overrideDiscountBp: activeOverrides[overrideKey(snapshot.company.id, l.product.sku)] ?? 0,
      })),
    };
    const idempotencyKey = crypto.randomUUID();
    let accepted: OrderAcceptedResponse;
    try {
      const res = await timed("server", () =>
        fetch("/api/v1/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(body),
        }),
      );
      const json = (await res.json()) as OrderAcceptedResponse | ApiErrorResponse;
      setServerResponse(JSON.stringify({ httpStatus: res.status, body: json }, null, 2));
      if (json.status !== "accepted") return fail("server", `HTTP ${res.status} · ${json.message}`);
      accepted = json;
    } catch {
      return fail("server", "Endpoint non raggiungibile: verifica la connessione.");
    }
    if (accepted.totals.grandTotalCents !== snapshot.totals.grandTotalCents) {
      return fail("server", `Totali divergenti: server ${formatEUR(accepted.totals.grandTotalCents)} ≠ client ${formatEUR(snapshot.totals.grandTotalCents)}`);
    }
    update("server", {
      status: "done",
      detail: `HTTP 201 · ${accepted.orderCode} · totale verificato ${formatEUR(accepted.totals.grandTotalCents)}`,
    });

    const stockDecrements = await timed("stock", () =>
      snapshot.totals.lines.map((l) => ({ sku: l.product.sku, fromBG: l.allocation.fromBG, fromBS: l.allocation.fromBS })),
    );
    const backorders = snapshot.totals.lines.filter((l) => l.allocation.backorder > 0).length;
    update("stock", {
      status: "done",
      detail: `${stockDecrements.reduce((a, d) => a + d.fromBG + d.fromBS, 0)} pz impegnati${backorders ? ` · ${backorders} righe in backorder` : ""}`,
    });

    const issuedAt = new Date();
    const invoice = await timed("invoice", () =>
      buildInvoice({
        sequence: state.invoiceSequence,
        orderCode: accepted.orderCode,
        issuedAt,
        customer: snapshot.company,
        totals: snapshot.totals,
        vatRegime: snapshot.vatRegime,
        paymentMethod: snapshot.paymentMethod,
      }),
    );
    update("invoice", { status: "done", detail: `${invoice.number} · ${invoice.sdiFileName} · ID SdI ${invoice.sdiIdentifier}` });

    const createdSeconds = Math.floor(issuedAt.getTime() / 1000);
    const events = await timed("events", () =>
      buildStripeEvents({
        orderCode: accepted.orderCode,
        company: snapshot.company,
        totals: snapshot.totals,
        paymentMethod: snapshot.paymentMethod,
        vatRegime: snapshot.vatRegime,
        invoice,
        createdSeconds,
        idempotencyKey,
      }),
    );
    update("events", { status: "done", detail: `${events[0].id} · ${events[1].id}` });

    const signed = await timed("sign", () => Promise.all(events.map((e, i) => signEvent(e, createdSeconds + i))));
    setWebhooks(signed);
    update("sign", { status: "done", detail: `v1=${signed[0].signatureHeader.split("v1=")[1].slice(0, 16)}… · verifica locale ${signed.every((s) => s.verified) ? "OK" : "KO"}` });

    try {
      const deliveries = await timed("deliver", () =>
        Promise.all(
          signed.map((w) =>
            fetch("/api/webhooks/stripe", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Stripe-Signature": w.signatureHeader },
              body: w.payload,
            }).then((r) => r.status),
          ),
        ),
      );
      if (deliveries.some((s) => s !== 200)) return fail("deliver", `Risposte endpoint: ${deliveries.join(", ")}`);
      update("deliver", { status: "done", detail: `2 × HTTP 200 · firma verificata lato server (tolleranza 300 s)` });
    } catch {
      return fail("deliver", "Endpoint webhook non raggiungibile.");
    }

    const emission: OrderEmissionResult = {
      orderCode: accepted.orderCode,
      createdAt: issuedAt.toISOString(),
      role: snapshot.role,
      customer: snapshot.company,
      totals: snapshot.totals,
      paymentMethod: snapshot.paymentMethod,
      vatRegime: snapshot.vatRegime,
      webhooks: signed,
      invoice,
      stockDecrements,
    };
    await timed("log", () => commitEmission(emission));
    update("log", { status: "done", detail: "2 eventi processed · dedup su event.id attiva · fattura in coda SDI" });
    setResult(emission);
    setPhase("done");
  }

  const payment = PAYMENT_METHODS.find((m) => m.id === effectivePayment);
  const shownTotals = result?.totals ?? totals;
  const tabs: Array<{ id: PayloadTab; label: string }> = [
    { id: "session", label: "Pagamento" },
    { id: "invoice", label: "Fattura" },
    { id: "headers", label: "Header" },
    { id: "server", label: "Risposta API" },
  ];
  const payloadText =
    tab === "session"
      ? (webhooks[0]?.payload ?? "")
      : tab === "invoice"
        ? (webhooks[1]?.payload ?? "")
        : tab === "server"
          ? serverResponse
          : webhooks
              .map(
                (w) =>
                  `POST /api/webhooks/stripe HTTP/1.1\nContent-Type: application/json; charset=utf-8\nUser-Agent: Stripe/1.0 (+https://stripe.com/docs/webhooks)\nStripe-Signature: ${w.signatureHeader}\n# ${w.event.type} · firma verificata: ${w.verified ? "sì" : "no"}`,
              )
              .join("\n\n");

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emission-title"
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-xl bg-panel shadow-2xl sm:max-h-[90vh] sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="emission-title" className="text-base font-semibold text-fg">
              Invio ordine
            </h2>
            <p className="truncate text-[13px] text-dim">
              {company.legalName} · {payment?.label} · <span className="num font-medium text-fg">{formatEUR(shownTotals.grandTotalCents)}</span>
              {effectiveVatRegime === "esente_art8" && " · esente art. 8"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "running"}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded text-muted hover:bg-panel-2 hover:text-fg disabled:opacity-40"
            aria-label="Chiudi"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:overflow-hidden">
          <div className="scrollbar-thin border-b border-line p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <ol className="space-y-0" aria-live="polite">
              {steps.map((s, i) => (
                <li key={s.id} className={`relative flex gap-3 pb-3 ${s.status !== "pending" ? "step-enter" : ""}`}>
                  {i < steps.length - 1 && (
                    <span aria-hidden className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${s.status === "done" ? "bg-ok/50" : "bg-line"}`} />
                  )}
                  <span className="relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-panel">
                    {s.status === "done" && <CircleCheck aria-hidden className="size-[19px] text-ok" />}
                    {s.status === "running" && <LoaderCircle aria-hidden className="size-[19px] animate-spin text-info" />}
                    {s.status === "error" && <CircleX aria-hidden className="size-[19px] text-danger" />}
                    {s.status === "pending" && <span aria-hidden className="size-2.5 rounded-full border border-line-strong" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-baseline justify-between gap-2 text-sm ${s.status === "pending" ? "text-dim" : "font-medium text-fg"}`}>
                      <span>{s.title}</span>
                      {s.ms !== null && <span className="num shrink-0 text-xs font-normal text-dim">{s.ms} ms</span>}
                    </p>
                    {s.status !== "pending" && (
                      <p className={`mono mt-0.5 break-all text-[11px] leading-snug ${s.status === "error" ? "text-danger" : "text-dim"}`}>
                        <span className="sr-only">Stato: {s.status}. </span>
                        {s.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {phase === "idle" && (
              <button
                ref={startRef}
                type="button"
                onClick={run}
                className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded bg-amber px-4 text-sm font-semibold text-white hover:bg-amber-soft"
              >
                <Play aria-hidden className="size-4" /> Conferma e invia · <span className="num">{formatEUR(totals.grandTotalCents)}</span>
              </button>
            )}
            {phase === "done" && result && (
              <div className="mt-1 rounded border border-ok/30 bg-ok/5 p-3 text-sm text-fg">
                <p className="font-medium">
                  Ordine <span className="mono">{result.orderCode}</span> inviato.
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Fattura <span className="num">{result.invoice.number}</span> in coda SDI. Fatture e webhook sono visibili al ruolo Amministrazione.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/ordini"
                    onClick={onClose}
                    className="inline-flex h-10 items-center rounded bg-fg px-3.5 text-sm font-medium text-panel hover:bg-fg/90"
                  >
                    Vedi ordini
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-10 items-center rounded border border-line-strong px-3.5 text-sm text-fg hover:border-fg"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            )}
            {phase === "error" && (
              <p className="mt-1 rounded border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                Invio interrotto: nessuna modifica a giacenze, fatture o log.
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col p-4 lg:min-h-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label="Dettagli tecnici" className="no-scrollbar flex max-w-full overflow-x-auto rounded border border-line bg-panel-2 p-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`payload-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls="payload-panel"
                    onClick={() => setTab(t.id)}
                    className={`h-8 whitespace-nowrap rounded-[3px] px-2.5 text-[13px] ${
                      tab === t.id ? "bg-panel font-medium text-fg shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-fg"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {payloadText && <CopyButton text={payloadText} label={tab === "headers" ? "Copia header" : "Copia JSON"} />}
            </div>
            <div id="payload-panel" role="tabpanel" aria-labelledby={`payload-tab-${tab}`} className="min-h-0 flex-1">
              {payloadText ? (
                <CodeBlock code={payloadText} language={tab === "headers" ? "text" : "json"} label={`Payload ${tab}`} className="h-full max-h-[50vh] lg:max-h-none" />
              ) : (
                <div className="flex h-full min-h-[120px] items-center justify-center rounded border border-dashed border-line p-6 text-center text-[13px] text-dim lg:min-h-[240px]">
                  Payload e risposte compaiono qui durante l&apos;invio.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
