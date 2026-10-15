import Link from "next/link";
import { REPO_URL } from "@/lib/links";

export function Footer() {
  return (
    <footer className="border-t border-line bg-panel">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 py-5 text-[13px] text-dim sm:px-5 md:flex-row md:items-center md:justify-between">
        <p>
          Demo con dati fittizi: azienda, clienti, listini e pagamenti sono simulati.{" "}
          <span className="whitespace-nowrap">
            Progetto di{" "}
            <a href="https://www.techpyre.eu" className="font-medium text-muted underline-offset-2 hover:text-fg hover:underline">
              TechPYRE
            </a>
            .
          </span>
        </p>
        <nav aria-label="Link secondari" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/permessi" className="hover:text-fg">
            Permessi
          </Link>
          <Link href="/architettura" className="hover:text-fg">
            Architettura e API
          </Link>
          <a href={REPO_URL} className="hover:text-fg">
            Codice sorgente (MIT)
          </a>
        </nav>
      </div>
    </footer>
  );
}
