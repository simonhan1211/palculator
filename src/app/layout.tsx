import type { Metadata } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const chakra = Chakra_Petch({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-chakra",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Palcalc — Palworld 1.0 Calculator",
  description:
    "Recursive crafting breakdowns and breeding combinations for Palworld 1.0.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/crafting", label: "Crafting" },
  { href: "/breeding", label: "Breeding" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${chakra.variable} ${inter.variable} ${jetbrains.variable}`}
      >
        <header className="sticky top-0 z-20 border-b border-border bg-bg backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-lg font-bold text-primary">
                PALCALC
              </span>
              <span className="eyebrow hidden sm:inline">v1.0 field data</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-1.5 text-fg-muted transition-colors hover:bg-panel hover:text-fg"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 py-10">
          <p className="eyebrow">
            Unofficial fan tool · data currently mocked · not affiliated with
            Pocketpair
          </p>
        </footer>
      </body>
    </html>
  );
}
