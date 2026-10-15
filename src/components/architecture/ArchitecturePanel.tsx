"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { ApiEndpointDoc, OrderRequestBody } from "@/types";
import { API_ENDPOINTS } from "@/data/api-docs";
import { PRISMA_SCHEMA } from "@/data/prisma-schema.generated";
import { ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";
import { CodeBlock } from "@/components/CodeBlock";
import { CopyButton } from "@/components/CopyButton";

const FLOW: ReadonlyArray<{ title: string; detail: string }> = [
  { title: "Next.js App Router", detail: "Server e Client Components" },
  { title: "Controllo permessi", detail: "Sessione firmata, deny-by-default" },
  { title: "Calcolo prezzi", detail: "Funzione pura in centesimi" },
  { title: "PostgreSQL / Prisma", detail: "Transazioni, optimistic locking" },
  { title: "Stripe e SDI", detail: "Webhook firmati, FatturaPA" },
];

const METHOD_CLASS = {
  GET: "text-info",
  POST: "text-amber",
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
    <article className="border-b border-line last:border-b-0" aria-labelledby={`ep-${doc.id}`}>
      <header className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={`ep-${doc.id}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`mono text-xs font-semibold ${METHOD_CLASS[doc.method]}`}>{doc.method}</span>
            <span className="mono break-all text-sm text-fg">{doc.path}</span>
          </h3>
          <p className="mt-0.5 text-sm text-muted">{doc.summary}</p>
          <p className="mt-1 text-xs text-dim">
            Accesso:{" "}
            {doc.roles === "stripe" ? (
              "Stripe (firma HMAC)"
            ) : (
              <span className="mono">
                {doc.roles.map((r, i) => (
                  <span key={r} className={r === role ? "font-medium text-fg" : undefined}>
                    {i > 0 && ", "}
                    {r}
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
        {doc.liveUrl ? (
          <button
            type="button"
            onClick={execute}
            disabled={running}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded bg-fg px-3 text-[13px] font-medium text-panel hover:bg-fg/90 disabled:opacity-60 sm:h-9"
          >
            <Play aria-hidden className="size-3.5" /> {running ? "In corso…" : `Prova come ${ROLES[role].shortLabel}`}
          </button>
        ) : (
          <span className="shrink-0 text-xs text-dim">{doc.id === "webhook" ? "Chiamato all'invio ordine" : "Generato nel browser"}</span>
        )}
      </header>

      <details className="group px-4 pb-3" open={result !== null}>
        <summary className="cursor-pointer text-[13px] text-dim hover:text-fg">{result ? "Risposta" : "Parametri ed esempi"}</summary>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <p className="text-[13px] leading-relaxed text-muted">{doc.description}</p>
            <table className="w-full text-[13px]">
              <caption className="sr-only">Parametri di {doc.path}</caption>
              <thead className="text-xs text-dim">
                <tr>
                  <th scope="col" className="py-1 text-left font-medium">
                    Parametro
                  </th>
                  <th scope="col" className="py-1 text-left font-medium">
                    In
                  </th>
                  <th scope="col" className="py-1 text-left font-medium">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody>
                {doc.parameters.map((p) => (
                  <tr key={p.name} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      <span className="mono text-xs text-fg">
                        {p.name}
                        {p.required && <span className="text-amber">*</span>}
                      </span>
                      <span className="block text-xs text-dim">{p.description}</span>
                    </td>
                    <td className="mono py-1.5 pr-2 text-xs text-muted">{p.location}</td>
                    <td className="mono py-1.5 text-xs text-info">{p.type}</td>
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
                  <p className="num text-[13px]">
                    <span className={`font-medium ${result.status >= 200 && result.status < 300 ? "text-ok" : "text-danger"}`}>HTTP {result.status || "ERR"}</span>
                    <span className="text-dim"> · {result.ms} ms</span>
                  </p>
                  <CopyButton text={result.body} />
                </div>
                <p className="mono break-all text-[11px] text-dim">{result.url}</p>
                <CodeBlock code={result.body} language="json" label={`Risposta live ${doc.path}`} className="max-h-80" />
              </>
            ) : (
              <>
                <p className="text-[13px] text-dim">
                  Esempio risposta <span className="num text-ok">HTTP {doc.responseStatus}</span>
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
      </details>
    </article>
  );
}

export function ArchitecturePanel() {
  return (
    <div className="grid gap-4">
      <section aria-labelledby="flow-title" className="rounded-md border border-line bg-panel p-4">
        <h2 id="flow-title" className="mb-3 text-base font-semibold text-fg">
          Flusso
        </h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((f, i) => (
            <li key={f.title} className="rounded border border-line bg-panel-2 px-3 py-2.5">
              <p className="num text-xs text-dim">{i + 1}</p>
              <p className="text-sm font-medium text-fg">{f.title}</p>
              <p className="text-xs text-muted">{f.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Policy di Calcolo Prezzi B2B e Arrotondamento FatturaPA */}
      <section aria-labelledby="pricing-policy-title" className="rounded-md border border-line bg-panel">
        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber">
              Regole Contabili ERP
            </span>
            <h2 id="pricing-policy-title" className="text-base font-semibold text-fg">
              Policy di Calcolo Prezzi: Sconto a Cascata e Sub-Cent FatturaPA
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-dim">
            Come il portale elimina gli errori di troncamento e garantisce la quadratura al centesimo con l&apos;Agenzia delle Entrate (SDI).
          </p>
        </div>

        <div className="p-4 space-y-4 text-sm leading-relaxed text-muted">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-line bg-panel-2 p-3.5 space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
                1. Sconto a Cascata (Compound Discount)
              </h3>
              <p className="text-xs text-muted">
                Nel commercio B2B gli sconti non si sommano aritmeticamente, ma si applicano in cascata moltiplicando i coefficienti netti:
              </p>
              <div className="mono rounded bg-panel p-2.5 text-xs text-fg">
                Moltiplicatore = (1 − scontoContratto) × (1 − scontoVolume) × (1 − scontoOverride)
              </div>
              <p className="text-xs text-dim">
                Es. Contratto 10% + Scaglione 50+ pz al 15%: <br />
                <span className="text-fg font-medium">(1 − 0,10) × (1 − 0,15) = 0,90 × 0,85 = 0,765 → Sconto combinato −23,5%</span> (non arrotondamenti arbitrari).
              </p>
            </div>

            <div className="rounded border border-line bg-panel-2 p-3.5 space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
                2. Preservazione Sub-Cent e Totale Riga
              </h3>
              <p className="text-xs text-muted">
                I prezzi unitari intermedi conservano la precisione a virgola mobile senza arrotondamenti prematuri ai 2 decimali:
              </p>
              <div className="mono rounded bg-panel p-2.5 text-xs text-fg">
                totaleRigaCents = Math.round(prezzoUnitarioEsattoCents × quantita)
              </div>
              <p className="text-xs text-dim">
                L&apos;arrotondamento (half-up) avviene <strong>una sola volta per riga d&apos;ordine</strong>, prevenendo il disallineamento nei lotti industriali.
              </p>
            </div>
          </div>

          <div className="rounded border border-line-strong bg-panel p-3.5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
              Verifica Contabile Certificata: 60 pz di VLK-RAC-2353-12L
            </h3>
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div className="rounded bg-panel-2 p-2">
                <span className="text-dim block">Listino Unitario</span>
                <span className="num text-sm font-semibold text-fg">6,80 €</span>
              </div>
              <div className="rounded bg-panel-2 p-2">
                <span className="text-dim block">Prezzo Netto Esatto</span>
                <span className="num text-sm font-semibold text-fg">5,202 €</span>
                <span className="text-[10px] text-dim block">6,80 × 0,765</span>
              </div>
              <div className="rounded bg-panel-2 p-2">
                <span className="text-dim block">Totale Riga (60 pz)</span>
                <span className="num text-sm font-semibold text-ok">312,12 €</span>
                <span className="text-[10px] text-dim block">round(5,202 × 60)</span>
              </div>
              <div className="rounded bg-panel-2 p-2">
                <span className="text-dim block">Risparmio Netto</span>
                <span className="num text-sm font-semibold text-fg">95,88 €</span>
                <span className="text-[10px] text-dim block">408,00 − 312,12</span>
              </div>
            </div>
            <p className="text-[11px] text-dim">
              <strong>Nota tecnica SDI:</strong> Se il prezzo unitario fosse stato troncato o arrotondato a 5,20 €, il totale sarebbe risultato 312,00 €, generando una discrepanza di 0,12 € rispetto al calcolo del gestionale centrale e ai requisiti del tracciato XML FatturaPA (dove <code className="mono">&lt;PrezzoUnitario&gt;</code> ammette fino a 8 cifre decimali e <code className="mono">&lt;PrezzoTotale&gt;</code> è a 2 cifre).
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="api-title" className="rounded-md border border-line bg-panel">
        <div className="border-b border-line px-4 py-3">
          <h2 id="api-title" className="text-base font-semibold text-fg">
            Endpoint REST
          </h2>
          <p className="text-[13px] text-dim">Route Handler reali: la risposta cambia con il ruolo scelto in alto.</p>
        </div>
        {API_ENDPOINTS.map((doc) => (
          <EndpointCard key={doc.id} doc={doc} />
        ))}
      </section>

      <section aria-labelledby="schema-title" className="rounded-md border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id="schema-title" className="text-base font-semibold text-fg">
              Schema database
            </h2>
            <p className="text-[13px] text-dim">
              <span className="mono">prisma/schema.prisma</span> · PostgreSQL · <span className="num">{PRISMA_SCHEMA.split("\n").length}</span> righe
            </p>
          </div>
          <CopyButton text={PRISMA_SCHEMA} label="Copia schema" />
        </div>
        <div className="p-4">
          <CodeBlock code={PRISMA_SCHEMA} language="prisma" label="Schema Prisma" className="max-h-[560px]" />
        </div>
      </section>
    </div>
  );
}
