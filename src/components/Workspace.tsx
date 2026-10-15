"use client";

import { useState, type KeyboardEvent } from "react";
import { Boxes, FileText, Network, RotateCcw, ShieldCheck } from "lucide-react";
import { can, ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";
import { CatalogPanel } from "@/components/catalog/CatalogPanel";
import { CartPanel } from "@/components/cart/CartPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { PolicyPanel } from "@/components/rbac/PolicyPanel";
import { ArchitecturePanel } from "@/components/architecture/ArchitecturePanel";

type TabId = "catalog" | "admin" | "policy" | "architecture";

const TABS: ReadonlyArray<{ id: TabId; label: string; Icon: typeof Boxes }> = [
  { id: "catalog", label: "Catalogo & Ordine rapido", Icon: Boxes },
  { id: "admin", label: "Fatture SDI & Webhook", Icon: FileText },
  { id: "policy", label: "Policy RBAC", Icon: ShieldCheck },
  { id: "architecture", label: "Ispezione Architettura & OpenAPI", Icon: Network },
];

export function Workspace() {
  const { role, state, resetSandbox } = usePortal();
  const [tab, setTab] = useState<TabId>("catalog");
  const pendingInvoices = state.invoices.length;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const idx = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(idx + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <main id="contenuto" className="mx-auto max-w-[1600px] px-3 pb-24 pt-3 sm:px-5 lg:pb-10">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div
          role="tablist"
          aria-label="Sezioni del portale"
          onKeyDown={onKeyDown}
          className="scrollbar-thin flex max-w-full overflow-x-auto border-b border-line"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(id)}
                className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  active ? "border-amber text-fg" : "border-transparent text-muted hover:text-fg"
                }`}
              >
                <Icon aria-hidden className={`size-3.5 ${active ? "text-amber" : ""}`} />
                {label}
                {id === "admin" && pendingInvoices > 0 && (
                  <span className="num rounded-full bg-amber px-1.5 text-[10px] font-semibold text-ink">{pendingInvoices}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-dim">
          <span>
            Vista: <span className="text-muted">{ROLES[role].label}</span>
            {!can(role, "order:submit") && <span className="text-danger"> · emissione ordini non consentita</span>}
          </span>
          <button
            type="button"
            onClick={resetSandbox}
            className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-muted hover:border-line-strong hover:text-fg"
          >
            <RotateCcw aria-hidden className="size-3" /> Reset sandbox
          </button>
        </div>
      </div>

      <div id="panel-catalog" role="tabpanel" aria-labelledby="tab-catalog" hidden={tab !== "catalog"}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <CatalogPanel />
          <CartPanel />
        </div>
      </div>
      <div id="panel-admin" role="tabpanel" aria-labelledby="tab-admin" hidden={tab !== "admin"}>
        {tab === "admin" && <AdminPanel />}
      </div>
      <div id="panel-policy" role="tabpanel" aria-labelledby="tab-policy" hidden={tab !== "policy"}>
        {tab === "policy" && <PolicyPanel />}
      </div>
      <div id="panel-architecture" role="tabpanel" aria-labelledby="tab-architecture" hidden={tab !== "architecture"}>
        {tab === "architecture" && <ArchitecturePanel />}
      </div>
    </main>
  );
}
