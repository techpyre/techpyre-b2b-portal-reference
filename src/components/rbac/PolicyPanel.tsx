"use client";

import { Check, Minus } from "lucide-react";
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
    <div className="grid gap-4">
      <section aria-labelledby="policy-title" className="rounded-md border border-line bg-panel">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3">
          <h2 id="policy-title" className="text-base font-semibold text-fg">
            Matrice permessi
          </h2>
          <p className="text-[13px] text-dim">
            {ROLES[role].shortLabel}: <span className="num font-medium text-fg">{granted}</span> su <span className="num">{PERMISSIONS.length}</span>{" "}
            permessi
          </p>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <caption className="sr-only">Matrice dei permessi per ruolo</caption>
            <thead className="border-b border-line bg-panel-2">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-panel-2 px-4 py-2.5 text-left text-xs font-medium text-dim">
                  Permesso
                </th>
                {ROLE_ORDER.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    aria-current={r === role ? "true" : undefined}
                    className={`px-2 py-2.5 text-center text-xs font-medium ${r === role ? "bg-amber/10 text-fg" : "text-dim"}`}
                  >
                    {ROLES[r].shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="sticky left-0 z-10 bg-panel px-4 py-2 text-left font-normal">
                    <span className="block text-fg">{p.label}</span>
                    <span className="mono block text-[11px] text-dim">{p.id}</span>
                  </th>
                  {ROLE_ORDER.map((r) => {
                    const ok = can(r, p.id);
                    return (
                      <td key={r} className={`px-2 py-2 text-center ${r === role ? "bg-amber/[0.05]" : ""}`}>
                        {ok ? (
                          <Check aria-label="concesso" className="mx-auto size-4 text-ok" />
                        ) : (
                          <Minus aria-label="negato" className="mx-auto size-4 text-line-strong" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="rounded-md border border-line bg-panel px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-fg">Come viene applicato</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="grid content-start gap-2 text-sm text-muted">
            <li>
              <span className="font-medium text-fg">Interfaccia:</span> legge la stessa matrice per nascondere colonne e disabilitare azioni.
            </li>
            <li>
              <span className="font-medium text-fg">Server:</span> le API rifiltrano costo e margine e rispondono 403 alle azioni non autorizzate.
            </li>
            <li>
              <span className="font-medium text-fg">In produzione:</span> il ruolo arriva dalla sessione firmata, mai dal client.
            </li>
          </ul>
          <CodeBlock code={POLICY_SNIPPET} language="text" label="Helper can() e verifica server-side" />
        </div>
      </details>
    </div>
  );
}
