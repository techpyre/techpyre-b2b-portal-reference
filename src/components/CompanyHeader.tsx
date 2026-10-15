"use client";

import { Factory, Warehouse } from "lucide-react";
import { PRICE_LIST_TIERS, SUPPLIER } from "@/data/companies";
import { formatBp, formatEUR } from "@/lib/money";
import { ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

function ValkiriaLogo() {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" className="shrink-0">
      <rect x="0.5" y="0.5" width="39" height="39" rx="3" fill="#11131A" stroke="#2E3345" />
      <path d="M8 10h6l6 15 6-15h6L23 31h-6L8 10z" fill="#F97316" />
      <circle cx="20" cy="20" r="2.2" fill="#090A0F" />
      <path d="M6 34h28" stroke="#3B82F6" strokeWidth="1.5" />
    </svg>
  );
}

/** Header aziendale Valkiria (il «prodotto» demo) con anagrafica del cliente attivo. */
export function CompanyHeader() {
  const { role, company } = usePortal();
  const tier = PRICE_LIST_TIERS[company.priceListTier];

  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto grid max-w-[1600px] gap-4 px-3 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center">
        <div className="flex items-center gap-3">
          <ValkiriaLogo />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-fg">
              Valkiria <span className="font-normal text-muted">Fluidodinamica S.r.l.</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Factory aria-hidden className="size-3.5 text-amber" /> Portale Ordini B2B · Oleodinamica industriale
              </span>
              <span className="inline-flex items-center gap-1">
                <Warehouse aria-hidden className="size-3.5 text-dim" /> Magazzini Bergamo (BG) · Brescia (BS)
              </span>
              <span className="num text-dim">P.IVA {SUPPLIER.vatNumber}</span>
            </p>
          </div>
        </div>

        <dl
          aria-label="Cliente attivo e condizioni contrattuali"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line text-xs sm:grid-cols-4"
        >
          <div className="col-span-2 bg-ink px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-dim">Cliente · {ROLES[role].label}</dt>
            <dd className="truncate font-medium text-fg">{company.legalName}</dd>
            <dd className="num text-muted">
              {company.vatNumber} · SDI {company.sdiRecipientCode}
            </dd>
          </div>
          <div className="bg-ink px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-dim">Listino</dt>
            <dd className="font-medium text-fg">{tier.label}</dd>
            <dd className="num text-muted">
              {tier.contractCode} · −{formatBp(tier.contractDiscountBp)}
            </dd>
          </div>
          <div className="bg-ink px-3 py-2">
            <dt className="text-[10px] uppercase tracking-wider text-dim">Scaglioni volume</dt>
            <dd className="num text-fg">
              {tier.volumeTiers
                .filter((t) => t.discountBp > 0)
                .map((t) => `${t.label} −${formatBp(t.discountBp)}`)
                .join(" · ")}
            </dd>
            <dd className="num text-muted">Franco destino ≥ {formatEUR(company.freeShippingThresholdCents)}</dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
