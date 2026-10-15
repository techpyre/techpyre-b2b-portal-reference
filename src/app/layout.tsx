import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { PortalProvider } from "@/components/PortalProvider";
import { TopBar } from "@/components/TopBar";
import { CompanyHeader } from "@/components/CompanyHeader";
import { Footer } from "@/components/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = "https://b2b-demo.techpyre.eu";
const TITLE = "Valkiria Fluidodinamica · Portale ordini B2B";
const DESCRIPTION =
  "Demo di un portale ordini B2B per componenti oleodinamici: listini a scaglioni, ruoli e permessi, pagamenti Stripe e fattura elettronica. Azienda e dati fittizi.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1117",
  colorScheme: "light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · Valkiria B2B" },
  description: DESCRIPTION,
  applicationName: "TechPYRE Reference Architecture #1",
  authors: [{ name: "Riccardo Granza", url: "https://www.techpyre.eu" }],
  creator: "TechPYRE",
  keywords: ["portale B2B", "Next.js", "RBAC", "listini a scaglioni", "Stripe webhook", "FatturaPA", "SDI", "TechPYRE"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "/",
    siteName: "TechPYRE Reference Architecture",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="flex min-h-screen flex-col font-sans text-fg antialiased">
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-panel"
        >
          Vai al contenuto
        </a>
        {/* Il provider sta nel layout: carrello e ordini restano in memoria passando tra le pagine. */}
        <PortalProvider>
          <TopBar />
          <CompanyHeader />
          <div id="contenuto" className="flex-1">
            {children}
          </div>
          <Footer />
        </PortalProvider>
      </body>
    </html>
  );
}
