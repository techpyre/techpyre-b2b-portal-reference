"use client";

import { RotateCcw } from "lucide-react";
import type { Role } from "@/types";
import { GithubMark } from "@/components/GithubMark";
import { ROLE_ORDER, ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";

import { REPO_URL } from "@/lib/links";

/**
 * Barra TechPYRE (controlli della demo), separata dall'header Valkiria.
 * Una sola riga: select su mobile, controllo segmentato da md in su.
 */
export function TopBar() {
  const { role, setRole, resetSandbox } = usePortal();

  return (
    <div className="dark-scope border-b border-black bg-[#0d1117] text-[13px]">
      <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
        <a href="https://www.techpyre.eu" className="flex shrink-0 items-center gap-2 font-semibold text-fg hover:text-info-soft">
          <span aria-hidden className="grid size-5 place-items-center rounded-[3px] bg-info/20 text-[10px] font-bold text-info-soft">
            T
          </span>
          <span>
            TechPYRE<span className="hidden font-normal text-dim lg:inline"> · demo portale B2B</span>
          </span>
        </a>

        <span aria-hidden className="hidden h-4 w-px bg-line-strong sm:block" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="role-select" className="shrink-0 text-dim">
            Ruolo
          </label>
          <select
            id="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-panel px-2 text-base text-fg md:hidden"
          >
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>
                {ROLES[r].shortLabel}
              </option>
            ))}
          </select>
          <div role="group" aria-label="Ruolo" className="hidden items-center gap-0.5 rounded border border-line bg-panel/60 p-0.5 md:flex">
            {ROLE_ORDER.map((r) => {
              const active = r === role;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={active}
                  title={ROLES[r].description}
                  onClick={() => setRole(r)}
                  className={`h-7 whitespace-nowrap rounded-[3px] px-2.5 transition-colors ${
                    active ? "bg-panel-2 font-medium text-fg ring-1 ring-line-strong" : "text-muted hover:text-fg"
                  }`}
                >
                  {ROLES[r].shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={resetSandbox}
            title="Ripristina carrello, giacenze e ordini"
            className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-muted hover:bg-panel-2 hover:text-fg"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Reset</span>
          </button>
          <a
            href={REPO_URL}
            className="hidden h-8 items-center gap-1.5 rounded px-2 text-muted hover:bg-panel-2 hover:text-fg sm:inline-flex"
          >
            <GithubMark /> <span className="hidden lg:inline">Codice</span>
            <span className="sr-only lg:hidden">Codice sorgente su GitHub</span>
          </a>
        </div>
      </div>
    </div>
  );
}
