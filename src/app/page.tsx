import { PortalProvider } from "@/components/PortalProvider";
import { TopBar } from "@/components/TopBar";
import { CompanyHeader } from "@/components/CompanyHeader";
import { Workspace } from "@/components/Workspace";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-sm focus:bg-amber focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-ink"
      >
        Vai al contenuto
      </a>
      <PortalProvider>
        <TopBar />
        <CompanyHeader />
        <Workspace />
      </PortalProvider>
      <Footer />
    </>
  );
}
