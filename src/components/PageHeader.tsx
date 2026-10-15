import type { ReactNode } from "react";

/** Intestazione sobria delle pagine secondarie: titolo + una riga di contesto. */
export function PageHeader({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {children && <p className="mt-0.5 max-w-2xl text-sm text-muted">{children}</p>}
      </div>
      {aside}
    </div>
  );
}
