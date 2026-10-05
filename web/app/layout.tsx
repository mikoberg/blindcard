import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Footer } from "@/components/Footer";
import { NavLinks } from "@/components/NavLinks";
import { Wordmark } from "@/components/Wordmark";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

// One family, two voices: the width axis gives the wide black display type and the normal text.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Blindcard", template: "Blindcard – %s" },
  description: "Which fights are worth watching, with no spoilers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-screen border-t-[6px] border-[var(--text)]">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3">
            <Wordmark />
            <NavLinks />
          </header>
          <main className="flex-1 pb-16 pt-4">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
