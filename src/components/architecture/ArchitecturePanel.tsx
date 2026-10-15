"use client";

import { useState } from "react";
import { ArrowRight, Database, FileCode, Play, Server } from "lucide-react";
import type { ApiEndpointDoc, OrderRequestBody } from "@/types";
import { API_ENDPOINTS } from "@/data/api-docs";
import { PRISMA_SCHEMA } from "@/data/prisma-schema.generated";
import { ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";

const FLOW: ReadonlyArray<{ title: string; detail: string }> = [
  { title: "Next.js App Router", detail: "RSC + Client Components mirati" },
  { title: "RBAC Middleware", detail: "Sessione firmata · deny-by-default" },
  { title: "Pricing Engine", detail: "Funzione pura · centesimi interi" },
  { title: "PostgreSQL / Prisma", detail: "Transazioni · optimistic locking" },
  { title: "Stripe Webhook & SDI", detail: "Firma HMAC · dedup event.id · FPR12" },
];

const METHOD_CLASS = {
  GET: "border-info/50 bg-info/15 text-info-soft",
  POST: "border-amber/50 bg-amber/15 text-amber-soft",
} as const;

interface LiveResult {
  status: number;
  ms: number;
  body: string;
  url: string;
}

function EndpointCard({ doc }: { doc: ApiEndpointDoc }) {
  const { role, company, state, effectivePayment } = usePortal();
  const [result, setResult] = useState<LiveResult | null>(null);
  const [running, setRunning] = useState(false);

  async function execute() {
    if (!doc.liveUrl) return;
    setRunning(true);
    let url = doc.liveUrl;
    let init: RequestInit = { method: doc.method, cache: "no-store" };
    if (doc.method === "GET") {
      const sep = url.includes("?") ? "&" : "?";
      url = `${url}${sep}role=${role}${ROLES[role].canSwitchCompany ? `&company=${company.id}` : ""}`;
    } else {
      const cartLines = Object.entries(state.cart).map(([sku, quantity]) => ({ sku, quantity, overrideDiscountBp: 0 }));
      const body: OrderRequestBody = {
        role,
        companyId: company.id,
        vatRegime: "ordinaria",
        paymentMethod: effectivePayment,
        lines: cartLines.length > 0 ? cartLines : [{ sku: "VLK-VMP-350", quantity: 60, overrideDiscountBp: 0 }],
      };
      init = {
        ...init,
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
      };
    }
    const t0 = performance.now();
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      const ms = Math.round(performance.now() - t0);
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text) as unknown, null, 2);
      } catch {
        pretty = text;
      }
      setResult({ status: res.status, ms, body: pretty, url: `${doc.method} ${url}` });
    } catch {
      setResult({ status: 0, ms: Math.round(performance.now() - t0), body: "Errore di rete: endpoint non raggiungibile.", url });
    } finally {
      setRunning(false);
    }
  }

  return (
    <article className="rounded-sm border border-line bg-ink/40" aria-labelledby={`ep-${doc.id}`}>
      <header className="flex flex-col gap-2 border-b border-line px-3 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 id={`ep-${doc.id}`} className="flex flex-wrap items-center gap-2">
            <span className={`num rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold ${METHOD_CLASS[doc.method]}`}>{doc.method}</span>
            <span className="num text-xs text-fg">{doc.path}</span>
            <span className="text-xs text-muted">— {doc.summary}</span>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px] text-dim">
            Autorizzati:
            {doc.roles === "stripe" ? (
              <span className="num rounded-sm border border-line-strong px-1 text-muted">Stripe (firma HMAC)</span>
            ) : (
              doc.roles.map((r) => (
                <span key={r} className={`num rounded-sm border px-1 ${r === role ? "border-amber/60 text-amber-soft" : "border-line-strong text-muted"}`}>
                  {r}
                </span>
              ))
            )}
          </p>
        </div>
        {doc.liveUrl ? (
          <button
            type="button"
            onClick={execute}
            disabled={running}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-sm bg-amber px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-amber-soft disabled:opacity-60 md:self-auto"
          >
            <Play aria-hidden className="size-3" /> {running ? "Esecuzione…" : `Esegui richiesta live · ruolo ${ROLES[role].shortLabel}`}
          </button>
        ) : (
          <span className="shrink-0 text-[10.5px] text-dim">
            {doc.id === "webhook" ? "Eseguito dalla pipeline di emissione ordine" : "Generato lato client nella sandbox"}
          </span>
        )}
      </header>
      <div className="grid gap-3 p-3 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <p className="text-xs leading-relaxed text-muted">{doc.description}</p>
          <table className="w-full text-[11px]">
            <caption className="sr-only">Parametri di {doc.path}</caption>
            <thead className="text-[10px] uppercase tracking-wider text-dim">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">Parametro</th>
                <th scope="col" className="py-1 text-left font-medium">In</th>
                <th scope="col" className="py-1 text-left font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {doc.parameters.map((p) => (
                <tr key={p.name} className="border-t border-line/60 align-top">
                  <td className="num py-1 pr-2 text-fg">
                    {p.name}
                    {p.required && <span className="text-amber">*</span>}
                    <span className="block font-sans text-[10.5px] text-dim">{p.description}</span>
                  </td>
                  <td className="num py-1 pr-2 text-muted">{p.location}</td>
                  <td className="num py-1 text-info-soft">{p.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {doc.requestExample && <CodeBlock code={doc.requestExample} language="json" label={`Esempio richiesta ${doc.path}`} className="max-h-56" />}
        </div>
        <div className="min-w-0 space-y-2">
          {result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="num text-[11px]">
                  <span className={result.status >= 200 && result.status < 300 ? "text-ok" : "text-danger"}>HTTP {result.status || "ERR"}</span>
                  <span className="text-dim"> · </span>
                  <span className="text-fg">{result.ms} ms</span>
                  <span className="text-dim"> · misurato nel browser</span>
                </p>
                <CopyButton text={result.body} />
              </div>
              <p className="num break-all text-[10.5px] text-dim">{result.url}</p>
              <CodeBlock code={result.body} language="json" label={`Risposta live ${doc.path}`} className="max-h-80" />
            </>
          ) : (
            <>
              <p className="num text-[11px] text-muted">
                Esempio risposta <span className="text-ok">HTTP {doc.responseStatus}</span>
              </p>
              <CodeBlock
                code={doc.responseExample}
                language={doc.responseExample.startsWith("<") ? "text" : "json"}
                label={`Esempio risposta ${doc.path}`}
                className="max-h-80"
              />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function ArchitecturePanel() {
  return (
    <div className="grid gap-4">
      <section aria-labelledby="flow-title" className="rounded-sm border border-line bg-panel p-3">
        <h2 id="flow-title" className="mb-3 text-sm font-semibold text-fg">
          Flusso architetturale target
        </h2>
        <ol className="grid gap-2 md:grid-cols-5">
          {FLOW.map((f, i) => (
            <li key={f.title} className="relative flex items-center gap-2">
              <div className="grid-bg w-full rounded-sm border border-line-strong bg-ink px-3 py-2.5">
                <p className="num text-[10px] text-amber">{String(i + 1).padStart(2, "0")}</p>
                <p className="text-xs font-medium text-fg">{f.title}</p>
                <p className="text-[10.5px] text-muted">{f.detail}</p>
              </div>
              {i < FLOW.length - 1 && <ArrowRight aria-hidden className="hidden size-4 shrink-0 text-dim md:block" />}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="api-title" className="rounded-sm border border-line bg-panel p-3">
        <h2 id="api-title" className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          <Server aria-hidden className="size-4 text-amber" /> Endpoint REST · stile OpenAPI 3.1
        </h2>
        <p className="mb-3 text-xs text-muted">
          GET /api/v1/catalog, GET /api/v1/pricing/quote e POST /api/v1/orders sono Route Handler reali che riusano il pricing engine e la
          matrice RBAC del client. La risposta cambia in base al ruolo selezionato nella barra superiore.
        </p>
        <div className="grid gap-3">
          {API_ENDPOINTS.map((doc) => (
            <EndpointCard key={doc.id} doc={doc} />
          ))}
        </div>
      </section>

      <section aria-labelledby="schema-title" className="rounded-sm border border-line bg-panel p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="schema-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Database aria-hidden className="size-4 text-amber" /> prisma/schema.prisma · PostgreSQL
            </h2>
            <p className="text-xs text-muted">
              Modelli Company, PriceListTier, Product, B2BOrder, OrderLine, WebhookLog, enum Role: indici, vincoli di unicità per
              idempotenza e versione per l&apos;optimistic locking. Sincronizzato via <span className="num">npm run sync:schema</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10.5px] text-dim">
              <FileCode aria-hidden className="size-3.5" /> {PRISMA_SCHEMA.split("\n").length} righe
            </span>
            <CopyButton text={PRISMA_SCHEMA} label="Copia schema" />
          </div>
        </div>
        <CodeBlock code={PRISMA_SCHEMA} language="prisma" label="Schema Prisma" className="max-h-[560px]" />
      </section>
    </div>
  );
}
