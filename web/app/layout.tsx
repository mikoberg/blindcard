import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Blindcard", template: "Blindcard – %s" },
  description: "Which fights are worth watching, with no spoilers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4">
          <header className="flex items-center gap-6 py-5">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide"
            >
              Blind<span className="text-[var(--accent)]">card</span>
            </Link>
            <nav aria-label="Main" className="flex gap-1">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center rounded-md px-3 text-[var(--muted)] hover:text-[var(--text)]"
              >
                Events
              </Link>
              <Link
                href="/fighters"
                className="inline-flex min-h-11 items-center rounded-md px-3 text-[var(--muted)] hover:text-[var(--text)]"
              >
                Fighters
              </Link>
              <Link
                href="/classics"
                className="inline-flex min-h-11 items-center rounded-md px-3 text-[var(--muted)] hover:text-[var(--text)]"
              >
                Classics
              </Link>
            </nav>
          </header>
          <main className="flex-1 pb-12">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
