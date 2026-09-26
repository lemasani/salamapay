import Link from "next/link";
import { getRole } from "@/lib/session";
import { getReviewQueue } from "@/lib/services/metrics";
import { DISPUTE_REASONS, type DisputeReason } from "@/lib/ai/dispute-summary";
import { tzs, when } from "@/lib/format";

export default async function ReviewPage() {
  const role = await getRole();
  if (role !== "admin") {
    return (
      <p className="panel p-6 max-w-xl">
        The review queue is for SalamaPay reviewers. Switch to <strong>Reviewer (Asha)</strong> at
        the top of the page.
      </p>
    );
  }
  const { disputes, reports } = await getReviewQueue();
  const openDisputes = disputes.filter((d) => !d.decided_at);
  const openReports = reports.filter((r) => !r.reviewed_at);

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h1 className="font-display text-4xl font-bold">Review queue</h1>
        <p className="mt-2 text-ink-soft text-lg max-w-2xl">
          The trust engine flags and summarises. People decide. Refunds, releases and any action on
          a seller&apos;s account need a named reviewer and a written reason.
        </p>
      </div>

      <section>
        <h2 className="font-display text-2xl font-bold">Disputes waiting for a decision ({openDisputes.length})</h2>
        <Queue
          empty="No open disputes."
          rows={openDisputes.map((d) => ({
            id: d.transaction_id,
            title: `${DISPUTE_REASONS[d.reason as DisputeReason]}: ${d.product_description}`,
            meta: `${tzs(d.price)} held in escrow, seller ${d.seller_name}, ${d.seller_responded ? "seller responded" : "no seller response yet"}`,
            when: d.opened_at,
          }))}
        />
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold">Buyer reports ({openReports.length})</h2>
        <Queue
          empty="No unreviewed reports."
          rows={openReports.map((r) => ({
            id: r.transaction_id,
            title: `${r.seller_name}: "${r.reason}"`,
            meta: `${r.product_description}, ${tzs(r.price)}, no money moved`,
            when: r.created_at,
          }))}
        />
      </section>

      <section>
        <h2 className="font-display text-xl font-bold text-ink-soft">Closed</h2>
        <Queue
          empty="Nothing closed yet."
          rows={[
            ...disputes.filter((d) => d.decided_at).map((d) => ({
              id: d.transaction_id,
              title: `${DISPUTE_REASONS[d.reason as DisputeReason]}: ${d.human_decision === "refund_buyer" ? "buyer refunded" : "released to seller"}`,
              meta: `${d.product_description}, ${tzs(d.price)}`,
              when: d.decided_at,
            })),
            ...reports.filter((r) => r.reviewed_at).map((r) => ({
              id: r.transaction_id,
              title: `Report reviewed: ${r.seller_name}`,
              meta: `"${r.review_note}"`,
              when: r.reviewed_at,
            })),
          ]}
        />
      </section>
    </div>
  );
}

function Queue({ rows, empty }: { rows: { id: string; title: string; meta: string; when: Date }[]; empty: string }) {
  if (rows.length === 0) return <p className="panel p-5 mt-3 text-ink-soft">{empty}</p>;
  return (
    <ul className="panel mt-3 divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id + r.title}>
          <Link href={`/t/${r.id}`} className="block px-5 py-4 hover:bg-mist">
            <span className="font-semibold">{r.title}</span>
            <span className="block text-sm text-ink-soft">
              {r.id}. {r.meta}. {when(r.when)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
