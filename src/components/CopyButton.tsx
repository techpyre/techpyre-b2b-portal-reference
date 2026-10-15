"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text, label = "Copia JSON" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_600);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded border border-line-strong bg-panel px-2.5 text-xs text-muted hover:border-fg hover:text-fg"
    >
      {copied ? <Check aria-hidden className="size-3.5 text-ok" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copiato" : label}</span>
    </button>
  );
}
