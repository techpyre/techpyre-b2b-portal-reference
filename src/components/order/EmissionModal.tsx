"use client";

import { useEffect, useRef, useState } from "react";
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
  { id: "policy", title: "Policy RBAC deny-by-default" },
  { id: "server", title: "POST /api/v1/orders · ricalcolo server-side" },
  { id: "stock", title: "Allocazione giacenze BG/BS" },
  { id: "invoice", title: "Progressivo fattura e identificativo SDI" },
  { id: "events", title: "Eventi checkout.session.completed + invoice.created" },
  { id: "sign", title: "Firma Stripe-Signature HMAC SHA-256 (Web Crypto)" },
  { id: "deliver", title: "Consegna a POST /api/webhooks/stripe" },
  { id: "log", title: "Consumer idempotente e log webhook" },
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
    update("policy", { status: "done", detail: `Ruolo «${ROLES[snapshot.role].shortLabel}»: order:submit e permessi di pagamento concessi` });

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
    { id: "session", label: "checkout.session.completed" },
    { id: "invoice", label: "invoice.created" },
    { id: "headers", label: "Header HTTP" },
    { id: "server", label: "Risposta /api/v1/orders" },
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emission-title"
        className="flex max-h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border border-line-strong bg-panel shadow-2xl shadow-black sm:max-h-[92vh] sm:rounded-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 id="emission-title" className="text-sm font-semibold text-fg">
              Simulazione emissione ordine &amp; webhook Stripe
            </h2>
            <p className="num text-[11px] text-muted">
              {company.legalName} · {company.vatNumber} · {payment?.label} · {effectiveVatRegime === "esente_art8" ? "N3.5 art. 8 c.1 lett. c)" : "IVA 22%"} ·{" "}
              {formatEUR(shownTotals.grandTotalCents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === "running"}
            className="rounded-sm p-1.5 text-muted hover:bg-panel-2 hover:text-fg disabled:opacity-40"
            aria-label="Chiudi simulazione"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden">
          <div className="scrollbar-thin border-b border-line p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <ol className="relative space-y-0" aria-live="polite">
              {steps.map((s, i) => (
                <li key={s.id} className={`relative flex gap-3 pb-3 ${s.status !== "pending" ? "step-enter" : ""}`}>
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden
                      className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${s.status === "done" ? "bg-amber/60" : "bg-line"}`}
                    />
                  )}
                  <span className="relative z-10 mt-0.5 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-panel">
                    {s.status === "done" && <CircleCheck aria-hidden className="size-[19px] text-amber" />}
                    {s.status === "running" && <LoaderCircle aria-hidden className="size-[19px] animate-spin text-info" />}
                    {s.status === "error" && <CircleX aria-hidden className="size-[19px] text-danger" />}
                    {s.status === "pending" && <span aria-hidden className="size-2.5 rounded-full border border-line-strong" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`flex items-baseline justify-between gap-2 text-xs font-medium ${s.status === "pending" ? "text-dim" : "text-fg"}`}>
                      <span>
                        <span className="num mr-1.5 text-dim">{String(i + 1).padStart(2, "0")}</span>
                        {s.title}
                      </span>
                      {s.ms !== null && <span className="num shrink-0 text-[10px] text-dim">{s.ms} ms</span>}
                    </p>
                    <p
                      className={`num mt-0.5 break-all text-[11px] leading-snug ${
                        s.status === "error" ? "text-danger" : s.status === "done" ? "text-muted" : "text-dim"
                      }`}
                    >
                      <span className="sr-only">Stato: {s.status}. </span>
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {phase === "idle" && (
              <button
                ref={startRef}
                type="button"
                onClick={run}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm bg-amber px-3 py-2.5 text-xs font-semibold text-ink hover:bg-amber-soft"
              >
                <Play aria-hidden className="size-3.5" /> Avvia pipeline ({totals.lines.length} righe · {formatEUR(totals.grandTotalCents)})
              </button>
            )}
            {phase === "done" && result && (
              <div className="mt-2 rounded-sm border border-ok/40 bg-ok/10 p-3 text-xs text-fg">
                <p className="font-medium">
                  Ordine <span className="num text-amber-soft">{result.orderCode}</span> emesso.
                </p>
                <p className="mt-1 text-muted">
                  Giacenze aggiornate nel catalogo, fattura <span className="num">{result.invoice.number}</span> e 2 eventi registrati: passa al
                  ruolo «Amministrazione &amp; Contabilità» per consultare fatture, XML FatturaPA e log webhook (con replay idempotente).
                </p>
              </div>
            )}
            {phase === "error" && (
              <p className="mt-2 rounded-sm border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                Pipeline interrotta: nessuna modifica a giacenze, fatture o log. Chiudi e verifica i dati dell&apos;ordine.
              </p>
            )}
          </div>

          <div className="flex min-h-[320px] min-w-0 flex-col p-4 lg:min-h-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label="Payload generati" className="scrollbar-thin flex max-w-full overflow-x-auto rounded-sm border border-line-strong bg-ink p-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`payload-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls="payload-panel"
                    onClick={() => setTab(t.id)}
                    className={`num whitespace-nowrap rounded-[2px] px-2 py-1 text-[11px] ${tab === t.id ? "bg-panel-2 text-fg ring-1 ring-line-strong" : "text-muted hover:text-fg"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {payloadText && <CopyButton text={payloadText} label={tab === "headers" ? "Copia header" : "Copia JSON"} />}
            </div>
            <div id="payload-panel" role="tabpanel" aria-labelledby={`payload-tab-${tab}`} className="min-h-0 flex-1">
              {payloadText ? (
                <CodeBlock code={payloadText} language={tab === "headers" ? "text" : "json"} label={`Payload ${tab}`} className="h-full max-h-[60vh] lg:max-h-none" />
              ) : (
                <div className="grid-bg flex h-full min-h-[240px] items-center justify-center rounded-sm border border-dashed border-line p-6 text-center text-xs text-muted">
                  I payload tipizzati compariranno qui durante l&apos;esecuzione della pipeline.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
