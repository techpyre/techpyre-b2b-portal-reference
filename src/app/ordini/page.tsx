import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Ordini e fatture",
  alternates: { canonical: "/ordini" },
};

export default function OrdiniPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-3 pb-12 pt-5 sm:px-5">
      <PageHeader title="Ordini e fatture">Ordini inviati in questa sessione, fatture elettroniche e notifiche di pagamento.</PageHeader>
      <AdminPanel />
    </main>
  );
}
