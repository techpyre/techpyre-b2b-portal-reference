"use client";

import { Check, ShieldCheck, X } from "lucide-react";
import { can, PERMISSIONS, ROLE_ORDER, ROLE_PERMISSIONS, ROLES } from "@/lib/rbac";
import { usePortal } from "@/components/PortalProvider";
import { CodeBlock } from "@/components/CodeBlock";

const POLICY_SNIPPET = `// src/lib/rbac.ts — matrice deny-by-default
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

// Route Handler: la verifica è ripetuta lato server
if (!can(session.role, "order:submit")) {
  return apiError(403, "forbidden", "...", "order:submit");
}`;

export function PolicyPanel() {
  const { role } = usePortal();
  const granted = ROLE_PERMISSIONS[role].size;

  return (
    <section aria-labelledby="policy-title" className="rounded-sm border border-line bg-panel p-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="policy-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
            <ShieldCheck aria-hidden className="size-4 text-amber" /> Policy RBAC attiva
          </h2>
          <p className="text-xs text-muted">
            Ruolo «{ROLES[role].label}»: <span className="num text-ok">{granted}</span> permessi concessi su{" "}
            <span className="num">{PERMISSIONS.length}</span>. Tutto ciò che non è elencato è negato.
          </p>
        </div>
        <p className="num text-[11px] text-dim">type Permission = {PERMISSIONS.length} literal · Record&lt;Role, ReadonlySet&lt;Permission&gt;&gt;</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="scrollbar-thin overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[620px] text-xs">
            <caption className="sr-only">Matrice dei permessi per ruolo</caption>
            <thead className="border-b border-line bg-panel-2">
              <tr>
                <th scope="col" className="sticky left-0 bg-panel-2 px-2.5 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-dim">
                  Permesso
                </th>
                {ROLE_ORDER.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className={`px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider ${r === role ? "bg-amber/15 text-amber-soft" : "text-dim"}`}
                  >
                    {ROLES[r].shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.id} className="border-b border-line/60">
                  <th scope="row" className="sticky left-0 bg-panel px-2.5 py-1.5 text-left font-normal">
                    <span className="num block text-[11px] text-fg">{p.id}</span>
                    <span className="block text-[10.5px] text-dim">{p.label}</span>
                  </th>
                  {ROLE_ORDER.map((r) => {
                    const ok = can(r, p.id);
                    return (
                      <td key={r} className={`px-2 py-1.5 text-center ${r === role ? "bg-amber/[0.07]" : ""}`}>
                        {ok ? (
                          <Check aria-label="concesso" className="mx-auto size-3.5 text-ok" />
                        ) : (
                          <X aria-label="negato" className="mx-auto size-3.5 text-danger/70" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <CodeBlock code={POLICY_SNIPPET} language="text" label="Helper can() e verifica server-side" />
          <ul className="grid gap-1 text-xs text-muted">
            <li>
              <span className="text-fg">Client:</span> la UI legge la stessa matrice per nascondere colonne e disabilitare azioni (solo UX).
            </li>
            <li>
              <span className="text-fg">Server:</span> i Route Handler rifiltrano i campi (costo, margine) e rispondono 403 alle azioni non
              autorizzate: prova «Esegui richiesta live» su POST /api/v1/orders con il ruolo Amministrazione.
            </li>
            <li>
              <span className="text-fg">Produzione:</span> il ruolo deriva dalla sessione firmata (cookie httpOnly), mai da parametri del client.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
