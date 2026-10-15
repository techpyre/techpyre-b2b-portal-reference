import { GithubMark } from "@/components/GithubMark";
import { REPO_URL } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto grid max-w-[1600px] gap-3 px-3 py-5 text-xs text-muted sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="space-y-1.5">
          <p className="rounded-sm border border-warn/30 bg-warn/5 px-2.5 py-1.5 text-warn">
            Azienda fittizia a scopo dimostrativo — dati simulati in memoria / nessun dato reale. Valkiria Fluidodinamica S.r.l., i clienti,
            le partite IVA, i listini e gli eventi Stripe sono inventati; nessun pagamento viene eseguito.
          </p>
          <p>
            Reference Architecture progettata da{" "}
            <a href="https://www.techpyre.eu" className="font-medium text-fg underline decoration-line-strong underline-offset-2 hover:decoration-amber">
              TechPYRE
            </a>{" "}
            — Studio di Ingegneria del Software B2B ·{" "}
            <a href="https://www.techpyre.eu" className="num text-fg hover:text-amber">
              https://www.techpyre.eu
            </a>{" "}
            · Head of Studio: Riccardo Granza
          </p>
        </div>
        <a
          href={REPO_URL}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-sm border border-line-strong px-2.5 py-1.5 text-fg hover:border-amber md:justify-self-end"
        >
          <GithubMark /> Codice sorgente (MIT)
        </a>
      </div>
    </footer>
  );
}
