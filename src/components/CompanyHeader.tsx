"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CompanyId } from "@/types";
import { COMPANIES, PRICE_LIST_TIERS } from "@/data/companies";
import { ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

function ValkiriaLogo() {
  return (
    <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" className="shrink-0">
      <rect width="40" height="40" rx="4" fill="#14181F" />
      <path d="M8 10h6l6 15 6-15h6L23 31h-6L8 10z" fill="#EA580C" />
    </svg>
  );
}

const PRIMARY_NAV = [
  { href: "/", label: "Catalogo" },
  { href: "/ordini", label: "Ordini e fatture" },
] as const;

const SECONDARY_NAV = [
  { href: "/permessi", label: "Permessi" },
  { href: "/architettura", label: "Architettura e API" },
] as const;

function CustomerSwitch() {
  const { role, company, setCompany } = usePortal();
  const tier = PRICE_LIST_TIERS[company.priceListTier];
  const canSwitch = ROLES[role].canSwitchCompany;

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="shrink-0 text-dim">{canSwitch ? "Ordina per" : "Cliente"}</span>
      {canSwitch ? (
        <>
          <label htmlFor="company-select" className="sr-only">
            Cliente per cui ordinare
          </label>
          <select
            id="company-select"
            value={company.id}
            onChange={(e) => setCompany(e.target.value as CompanyId)}
            className="h-9 min-w-0 max-w-full flex-1 truncate rounded border border-line-strong bg-panel px-2 text-base font-medium text-fg sm:h-8 sm:max-w-[18rem] sm:text-sm"
          >
            {(Object.keys(COMPANIES) as CompanyId[]).map((id) => (
              <option key={id} value={id}>
                {COMPANIES[id].legalName}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="truncate font-medium text-fg" title={`${company.legalName} · ${company.vatNumber}`}>
          {company.legalName}
        </span>
      )}
      <span className="hidden shrink-0 text-dim lg:inline">
        · <span className="num">{company.vatNumber}</span> · {tier.label}
      </span>
    </div>
  );
}

/** Header aziendale Valkiria (il «prodotto» demo): marchio, cliente attivo, navigazione. */
export function CompanyHeader() {
  const pathname = usePathname();
  const { state } = usePortal();
  const orders = state.orders.length;

  const linkClass = (href: string, secondary = false) => {
    const active = pathname === href;
    return `relative -mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-1 whitespace-nowrap ${
      active ? "border-amber font-medium text-fg" : `border-transparent hover:text-fg ${secondary ? "text-dim" : "text-muted"}`
    }`;
  };

  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-5">
        <div className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <ValkiriaLogo />
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-fg">Valkiria Fluidodinamica</span>
              <span className="block text-xs text-dim">Portale ordini · oleodinamica industriale</span>
            </span>
          </Link>
          <CustomerSwitch />
        </div>

        <nav aria-label="Sezioni del portale" className="no-scrollbar -mx-3 flex items-center gap-5 overflow-x-auto px-3 text-sm sm:mx-0 sm:px-0">
          {PRIMARY_NAV.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
              {l.href === "/ordini" && orders > 0 && (
                <span className="num rounded-full bg-fg px-1.5 text-[11px] font-medium leading-5 text-panel">{orders}</span>
              )}
            </Link>
          ))}
          <span aria-hidden className="ml-auto hidden md:block" />
          {SECONDARY_NAV.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href, true)} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
