"use client";

import { ExternalLink, Layers } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import type { CompanyId } from "@/types";
import { COMPANIES } from "@/data/companies";
import { ROLE_ORDER, ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

import { REPO_URL } from "@/lib/links";

/** Barra TechPYRE persistente, distinta dall'header aziendale: controlli della sandbox. */
export function TopBar() {
  const { role, company, setRole, setCompany } = usePortal();
  const canSwitch = ROLES[role].canSwitchCompany;

  return (
    <div className="sticky top-0 z-40 border-b border-info/25 bg-[#0B1020]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0B1020]/85">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <a
            href="https://www.techpyre.eu"
            className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tracking-tight text-fg hover:text-info-soft"
          >
            <Layers aria-hidden className="size-4 text-info" />
            Tech<span className="text-info-soft">PYRE</span>
          </a>
          <span className="hidden truncate rounded-sm border border-info/40 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info-soft sm:inline">
            TechPYRE Reference Architecture #1 — Live Interactive Sandbox
          </span>
          <span className="rounded-sm border border-info/40 bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info-soft sm:hidden">
            Ref. Arch. #1 · Sandbox
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <span id="role-switcher-label" className="text-[11px] font-medium uppercase tracking-wider text-dim">
            RBAC &amp; Tier Switcher
          </span>
          <div
            role="group"
            aria-labelledby="role-switcher-label"
            className="scrollbar-thin flex max-w-full overflow-x-auto rounded-sm border border-line-strong bg-ink p-0.5"
          >
            {ROLE_ORDER.map((r) => {
              const active = r === role;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  title={ROLES[r].description}
                  onClick={() => setRole(r)}
                  className={`whitespace-nowrap rounded-[2px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-amber text-ink" : "text-muted hover:bg-panel-2 hover:text-fg"
                  }`}
                >
                  <span className="hidden md:inline">{ROLES[r].label}</span>
                  <span className="md:hidden">{ROLES[r].shortLabel}</span>
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="whitespace-nowrap">Cliente attivo</span>
            <select
              value={company.id}
              disabled={!canSwitch}
              onChange={(e) => setCompany(e.target.value as CompanyId)}
              aria-describedby="company-hint"
              className="num max-w-[13rem] rounded-sm border border-line-strong bg-ink px-2 py-1.5 text-xs text-fg disabled:opacity-70"
            >
              {(Object.keys(COMPANIES) as CompanyId[]).map((id) => (
                <option key={id} value={id}>
                  {COMPANIES[id].vatNumber} · {COMPANIES[id].legalName}
                </option>
              ))}
            </select>
            <span id="company-hint" className="sr-only">
              {canSwitch
                ? "Il ruolo corrente può operare per conto di più clienti."
                : "Il ruolo corrente è vincolato alla propria partita IVA."}
            </span>
          </label>

          <div className="flex items-center gap-1">
            <a
              href={REPO_URL}
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs text-muted hover:bg-panel-2 hover:text-fg"
            >
              <GithubMark /> GitHub
            </a>
            <a
              href="https://www.techpyre.eu"
              className="inline-flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs text-muted hover:bg-panel-2 hover:text-fg"
            >
              techpyre.eu <ExternalLink aria-hidden className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
