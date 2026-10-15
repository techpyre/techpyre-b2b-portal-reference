import type { Metadata } from "next";
import { ArchitecturePanel } from "@/components/architecture/ArchitecturePanel";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Architettura e API",
  alternates: { canonical: "/architettura" },
};

export default function ArchitetturaPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-3 pb-12 pt-5 sm:px-5">
      <PageHeader title="Architettura e API">Endpoint REST provabili dal vivo e schema del database.</PageHeader>
      <ArchitecturePanel />
    </main>
  );
}
