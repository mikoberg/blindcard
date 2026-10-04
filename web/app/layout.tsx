import type { Metadata } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Blindcard", template: "Blindcard – %s" },
  description: "Which fights are worth watching, with no spoilers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between py-5">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide"
            >
              Blind<span className="text-[var(--accent)]">card</span>
            </Link>
            <nav aria-label="Main">
              <Link href="/events" className="inline-flex min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--text)]">
                All events
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
