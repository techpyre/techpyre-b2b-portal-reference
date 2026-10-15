import type { Metadata } from "next";
import { PolicyPanel } from "@/components/rbac/PolicyPanel";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Permessi per ruolo",
  alternates: { canonical: "/permessi" },
};

export default function PermessiPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-3 pb-12 pt-5 sm:px-5">
      <PageHeader title="Permessi per ruolo">
        Cosa può vedere e fare ogni ruolo. Tutto ciò che non è concesso è negato, anche lato server.
      </PageHeader>
      <PolicyPanel />
    </main>
  );
}
