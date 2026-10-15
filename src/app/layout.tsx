import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
const TITLE = "Valkiria Fluidodinamica · Portale B2B — TechPYRE Reference Architecture #1";
const DESCRIPTION =
  "Live sandbox di un portale ordini B2B per componenti oleodinamici: RBAC tipizzato, listini dinamici a scaglioni in centesimi interi, simulazione webhook Stripe firmati HMAC e fatturazione elettronica FatturaPA/SDI. Azienda fittizia, dati simulati.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090A0F",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
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
      <body className="font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
