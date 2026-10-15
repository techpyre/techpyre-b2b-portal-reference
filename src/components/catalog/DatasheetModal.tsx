"use client";

import { useEffect, useRef } from "react";
import { Check, FileText, Printer, X } from "lucide-react";
import type { Product } from "@/types";
import { formatEUR } from "@/lib/money";

interface DatasheetModalProps {
  product: Product | null;
  onClose: () => void;
}

export function DatasheetModal({ product, onClose }: DatasheetModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [product, onClose]);

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="datasheet-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
    >
      <div
        aria-hidden
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-lg border border-line bg-panel shadow-2xl overflow-hidden"
      >
        {/* Header del documento tecnico */}
        <div className="flex items-start justify-between gap-4 border-b border-line bg-panel-2 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="mono text-xs font-bold text-amber">{product.sku}</span>
              <span className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info">
                Scheda Tecnica Ufficiale
              </span>
            </div>
            <h3 id="datasheet-title" className="mt-1 text-base font-semibold text-fg sm:text-lg">
              {product.name}
            </h3>
            <p className="text-xs text-dim">
              Valkiria Fluidodinamica S.r.l. · Divisione Componenti Oleodinamici Industriali
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded text-muted hover:bg-panel hover:text-fg"
            aria-label="Chiudi scheda tecnica"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corpo della scheda tecnica */}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-5 space-y-6 text-sm">
          {/* Panoramica articolo */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim">Descrizione Tecnica di Fornitura</h4>
            <p className="mt-1.5 text-fg leading-relaxed">{product.description}</p>
          </div>

          {/* Griglia parametri nominali */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim mb-2.5">Specifiche d&apos;Esercizio</h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Pressione Max d&apos;Esercizio</span>
                <span className="num text-base font-semibold text-fg">{product.maxPressureBar} bar</span>
                <span className="text-[11px] text-dim block mt-0.5">Test di scoppio 4:1</span>
              </div>
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Portata Nominale</span>
                <span className="num text-base font-semibold text-fg">
                  {product.flowLpm !== null ? `${product.flowLpm} L/min` : "Non applicabile"}
                </span>
                <span className="text-[11px] text-dim block mt-0.5">Δp nominale &lt; 3 bar</span>
              </div>
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Intervallo Termico</span>
                <span className="num text-base font-semibold text-fg">
                  {product.tempMinC}…{product.tempMaxC} °C
                </span>
                <span className="text-[11px] text-dim block mt-0.5">Fluido idraulico HLP</span>
              </div>
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Massa a Secco</span>
                <span className="num text-base font-semibold text-fg">{product.weightKg.toLocaleString("it-IT")} kg</span>
                <span className="text-[11px] text-dim block mt-0.5">Tolleranza ±2%</span>
              </div>
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Tempo di Riordino</span>
                <span className="num text-base font-semibold text-fg">{product.leadTimeDays} gg lav.</span>
                <span className="text-[11px] text-dim block mt-0.5">Fabbricazione BG/BS</span>
              </div>
              <div className="rounded border border-line bg-panel-2 p-3">
                <span className="text-xs text-dim block">Prezzo Listino Base</span>
                <span className="num text-base font-semibold text-fg">{formatEUR(product.listPriceCents)}</span>
                <span className="text-[11px] text-dim block mt-0.5">IVA e sconti esc.</span>
              </div>
            </div>
          </div>

          {/* Dettagli costruttivi e normativi */}
          <div className="rounded border border-line p-4 space-y-3 bg-panel">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-dim">Materiali e Conformità Industriale</h4>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-dim font-medium">Categoria Merceologica:</dt>
                <dd className="text-fg mt-0.5 font-medium">{product.category}</dd>
              </div>
              <div>
                <dt className="text-dim font-medium">Certificazioni di Prodotto:</dt>
                <dd className="text-fg mt-0.5 font-medium">
                  {product.certifications.length > 0 ? product.certifications.join(" · ") : "Standard CE / DIN"}
                </dd>
              </div>
              <div>
                <dt className="text-dim font-medium">Trattamento Superficiale:</dt>
                <dd className="text-fg mt-0.5">Zincatura elettrolitica Fe/Zn 8c (esente Cr VI) / Brunitura industriale</dd>
              </div>
              <div>
                <dt className="text-dim font-medium">Tenute e Guarnizioni:</dt>
                <dd className="text-fg mt-0.5">NBR 70 Shore A (FKM Viton su richiesta per alte temperature)</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-dim font-medium">Compatibilità Fluidi:</dt>
                <dd className="text-fg mt-0.5">
                  Oli idraulici a base minerale ISO VG 32 / 46 / 68 secondo DIN 51524. Per esteri sintetici HEES richiedere collaudo speciale.
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Footer azioni */}
        <div className="flex items-center justify-between border-t border-line bg-panel-2 px-5 py-3">
          <span className="text-xs text-dim">Rev. 2026.04 · Valkiria Engineering Dept.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-line-strong bg-panel px-3 text-xs font-medium text-fg hover:bg-panel-2"
            >
              <Printer className="size-3.5" />
              Stampa Scheda
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded bg-fg px-4 text-xs font-medium text-panel hover:bg-fg/90"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
