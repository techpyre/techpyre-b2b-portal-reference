import { useMemo } from "react";
import { highlightJson, highlightPrisma, TOKEN_CLASS } from "@/lib/highlight";

export function CodeBlock({
  code,
  language,
  label,
  className = "",
}: {
  code: string;
  language: "json" | "prisma" | "text";
  label: string;
  className?: string;
}) {
  const tokens = useMemo(
    () => (language === "json" ? highlightJson(code) : language === "prisma" ? highlightPrisma(code) : null),
    [code, language],
  );
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={`scrollbar-thin num overflow-auto rounded-sm border border-line bg-ink p-3 text-[11.5px] leading-relaxed ${className}`}
    >
      <code>
        {tokens
          ? tokens.map((t, i) => (
              <span key={i} className={TOKEN_CLASS[t.kind]}>
                {t.text}
              </span>
            ))
          : <span className="text-fg">{code}</span>}
      </code>
    </pre>
  );
}
