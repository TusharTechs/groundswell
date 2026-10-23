import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

const site = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Groundswell: rehearse your launch in a living model of the city", template: "%s · Groundswell" },
  description:
    "A team of AI agents rehearses your launch hundreds of times in a taste-accurate model of a real city, built from Qloo's taste graph, and hands you the plan that worked.",
  openGraph: {
    title: "Groundswell",
    description: "A flight simulator for culture. AI agents rehearse your launch in a living model of the city, built from Qloo's taste graph.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-ink text-text">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
