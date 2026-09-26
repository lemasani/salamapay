import Link from "next/link";
import { getRole } from "@/lib/session";
import { listTransactions, type TransactionListItem } from "@/lib/services/transactions";
import { humanStatus, TERMINAL } from "@/lib/workflow/machine";
import { LEVEL_STYLE, tzs, when } from "@/lib/format";

export default async function Home() {
  const role = await getRole();

  if (role === "buyer") {
    const items = await listTransactions({ buyerId: "buyer-neema" });
    return (
      <div className="space-y-12">
        <section className="grid gap-8 md:grid-cols-[1.2fr_1fr] items-center">
          <div>
            <h1 className="font-display text-4xl sm:text-6xl font-bold leading-[1.02] text-ink">
              Check the seller before you send the money.
            </h1>
            <p className="mt-5 text-lg text-ink-soft max-w-xl">
              Found something on Instagram or WhatsApp? SalamaPay looks at the seller, the price and
              the payment request, tells you what looks risky and why, and holds your money until
              the right item reaches you.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/check/new" className="btn btn-primary text-lg px-6">
                Start a trust check
              </Link>
              <Link href="/how-it-works" className="btn btn-quiet text-lg px-6">
                See how the score works
              </Link>
            </div>
          </div>
          <ol className="panel p-6 space-y-4" aria-label="How a protected purchase works">
            {[
              ["Check", "Get a risk score with the reasons behind it, before any money moves."],
              ["Decide", "Continue, ask the seller for proof, pause, or report. It's your call."],
              ["Protect", "Your payment waits with SalamaPay while the seller ships."],
              ["Confirm", "Enter the delivery code, inspect the item, then release or dispute."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="font-display text-2xl font-bold text-salama w-6 shrink-0 tabular">{i + 1}</span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-ink-soft text-[0.95rem]">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold mb-4">My purchases</h2>
          <TxList items={items} empty="No purchases yet. Start a trust check when you find something to buy." />
        </section>
      </div>
    );
  }

  if (role === "seller") {
    const items = await listTransactions({
      statuses: ["VERIFICATION_REQUESTED", "AWAITING_SELLER", "ACCEPTED", "FUNDED", "SHIPPED", "DELIVERED", "DISPUTED", "RELEASED", "RESOLVED_REFUNDED", "RESOLVED_RELEASED", "SELLER_REJECTED"],
    });
    const needsAction = items.filter((t) =>
      ["VERIFICATION_REQUESTED", "AWAITING_SELLER", "FUNDED", "DISPUTED"].includes(t.status),
    );
    return (
      <div className="space-y-10">
        <div>
          <h1 className="font-display text-4xl font-bold">Orders</h1>
          <p className="text-ink-soft mt-2 max-w-2xl">
            In this demo the seller view shows orders for all three synthetic sellers. Ship only
            once SalamaPay shows the payment is secured. You are paid when the buyer confirms delivery.
          </p>
        </div>
        <section>
          <h2 className="font-display text-xl font-bold mb-3">Waiting for you</h2>
          <TxList items={needsAction} empty="Nothing needs your attention right now." showSeller />
        </section>
        <section>
          <h2 className="font-display text-xl font-bold mb-3">All orders</h2>
          <TxList items={items} empty="No orders yet." showSeller />
        </section>
      </div>
    );
  }

  const items = await listTransactions();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-bold">All transactions</h1>
        <Link href="/review" className="btn btn-primary">
          Open review queue
        </Link>
      </div>
      <TxList items={items} empty="No transactions yet." showSeller />
    </div>
  );
}

function TxList({
  items,
  empty,
  showSeller = false,
}: {
  items: TransactionListItem[];
  empty: string;
  showSeller?: boolean;
}) {
  if (items.length === 0) return <p className="panel p-6 text-ink-soft">{empty}</p>;
  return (
    <ul className="panel divide-y divide-line">
      {items.map((t) => {
        const lvl = t.level ? LEVEL_STYLE[t.level as keyof typeof LEVEL_STYLE] : null;
        const done = TERMINAL.includes(t.status);
        return (
          <li key={t.id}>
            <Link
              href={`/t/${t.id}`}
              className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-4 hover:bg-mist"
            >
              <span className="font-semibold min-w-0 flex-1 basis-60">
                {t.product_description}
                <span className="block text-sm font-normal text-ink-soft">
                  {t.id}
                  {showSeller && `, sold by ${t.seller_name}`}
                </span>
              </span>
              <span className="tabular font-semibold">{tzs(t.price)}</span>
              {lvl && (
                <span className={`text-sm font-semibold rounded-full px-2.5 py-0.5 ${lvl.bg} ${lvl.text}`}>
                  {lvl.label} {t.score}
                </span>
              )}
              <span className={`text-sm w-56 ${done ? "text-ink-soft" : "text-ink font-medium"}`}>
                {humanStatus(t.status)}
                <span className="block text-ink-soft font-normal">{when(t.updated_at)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
