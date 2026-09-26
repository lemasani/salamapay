import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { getRole, ROLE_LABELS } from "@/lib/session";
import { resetDemoAction, setRoleAction } from "./actions";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["wdth"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SalamaPay: check the seller before you pay",
  description:
    "Hackathon prototype: explainable trust checks and protected payments for social commerce in Tanzania.",
};

const NAV: Record<string, { href: string; label: string }[]> = {
  buyer: [
    { href: "/", label: "My purchases" },
    { href: "/check/new", label: "New trust check" },
  ],
  seller: [{ href: "/", label: "Orders" }],
  admin: [
    { href: "/review", label: "Review queue" },
    { href: "/", label: "All transactions" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const role = await getRole();
  return (
    <html lang="en" className={`${bricolage.variable} ${publicSans.variable}`}>
      <body className="min-h-screen flex flex-col">
        <div className="bg-ink text-white text-sm">
          <p className="mx-auto max-w-6xl px-4 py-2">
            <strong className="font-semibold text-gold">Prototype.</strong> All sellers are
            synthetic, payments and deliveries are simulated, and no real money moves.
          </p>
        </div>

        <header className="border-b border-line bg-paper">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/" className="font-display text-2xl font-bold text-ink flex items-center gap-2">
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path d="M13 1.5 23 5.5v7c0 6-4.2 10.3-10 12-5.8-1.7-10-6-10-12v-7z" fill="var(--salama)" />
                <circle cx="13" cy="12.5" r="4.2" fill="var(--gold)" />
              </svg>
              SalamaPay
            </Link>
            <nav aria-label="Main" className="flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem]">
              {NAV[role].map((n) => (
                <Link key={n.href + n.label} href={n.href} className="text-ink-soft hover:text-ink font-medium">
                  {n.label}
                </Link>
              ))}
              <Link href="/how-it-works" className="text-ink-soft hover:text-ink font-medium">
                How scoring works
              </Link>
              <Link href="/impact" className="text-ink-soft hover:text-ink font-medium">
                Impact
              </Link>
            </nav>
            <form action={setRoleAction} className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-ink-soft">Viewing as</span>
              <div role="group" aria-label="Switch demo role" className="flex rounded-lg border border-line overflow-hidden">
                {(["buyer", "seller", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    name="role"
                    value={r}
                    aria-pressed={role === r}
                    className={`px-3 py-1.5 font-semibold ${
                      role === r ? "bg-ink text-white" : "bg-paper text-ink-soft hover:text-ink"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-soft flex flex-wrap gap-4 items-center justify-between">
            <p className="max-w-2xl">
              SalamaPay is a hackathon prototype (GirlCode Hackathon Tanzania 2026). It does not make
              fraud determinations, hold real funds or replace regulated financial institutions or
              human reviewers.
            </p>
            {process.env.DEMO_RESET_ENABLED === "true" && (
              <form action={resetDemoAction}>
                <button className="btn btn-quiet text-sm">Reset demo data</button>
              </form>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
