import { when } from "@/lib/format";
import type { TransactionView } from "@/lib/services/transactions";

const LABELS: Record<string, string> = {
  purchase_created: "Purchase details entered",
  risk_assessed: "Trust check completed",
  buyer_decision: "Buyer chose",
  status_changed: "Status changed",
  seller_verification_provided: "Seller provided verification",
  price_amended: "Price changed, approval restarted",
  seller_accepted: "Seller accepted details",
  seller_rejected: "Seller rejected details",
  escrow_funded: "Payment secured in escrow",
  shipped: "Shipped",
  delivery_otp_failed: "Wrong delivery code entered",
  delivery_confirmed: "Delivery confirmed with code",
  payment_released: "Payment released to seller",
  dispute_opened: "Dispute opened",
  dispute_seller_responded: "Seller responded to dispute",
  dispute_resolved_by_human: "Dispute decided by reviewer",
  report_reviewed: "Report reviewed",
};

const DECISIONS: Record<string, string> = {
  continue_protected: "continue with protection",
  request_verification: "ask the seller for verification",
  cancel: "pause and cancel",
  report: "report the request",
};

const ROLE_DOT: Record<string, string> = {
  buyer: "bg-gold",
  seller: "bg-ink",
  admin: "bg-crimson",
  system: "bg-salama",
};

function describe(e: TransactionView["audit"][number]): string | null {
  const d = e.detail as Record<string, unknown>;
  switch (e.action) {
    case "risk_assessed":
      return `Score ${d.score} (${d.level}).`;
    case "buyer_decision":
      return `${DECISIONS[String(d.decision)] ?? d.decision}${d.reason ? `: "${d.reason}"` : ""}`;
    case "status_changed":
      return `${d.from} to ${d.to}`;
    case "price_amended":
      return `TZS ${Number(d.from).toLocaleString("en-US")} to ${Number(d.to).toLocaleString("en-US")}`;
    case "shipped":
      return `${d.courier}, ref ${d.trackingRef}`;
    case "delivery_otp_failed":
      return `Attempt ${d.attempt} of ${d.max}`;
    case "dispute_opened":
      return String(d.reason);
    case "dispute_resolved_by_human":
      return `${d.decision === "refund_buyer" ? "Refund buyer" : "Release to seller"}: "${d.rationale}"`;
    case "seller_verification_provided":
    case "report_reviewed":
      return `"${d.note}"`;
    default:
      return null;
  }
}

export function Timeline({ events }: { events: TransactionView["audit"] }) {
  const shown = events.filter((e) => e.action !== "status_changed");
  return (
    <section aria-labelledby="audit-heading" className="panel p-5">
      <h2 id="audit-heading" className="font-display text-xl font-bold">Audit timeline</h2>
      <p className="text-sm text-ink-soft">Every important action, who did it and when.</p>
      <ol className="mt-4 space-y-4">
        {shown.map((e) => {
          const extra = describe(e);
          return (
            <li key={e.id} className="relative pl-6">
              <span aria-hidden="true" className={`absolute left-0 top-1.5 size-2.5 rounded-full ${ROLE_DOT[e.actor_role] ?? "bg-line"}`} />
              <p className="font-semibold leading-snug">{LABELS[e.action] ?? e.action}</p>
              {extra && <p className="text-sm">{extra}</p>}
              <p className="text-xs text-ink-soft">
                {e.actor} ({e.actor_role === "system" ? "automated" : e.actor_role}), {when(e.created_at)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Notifications({ items }: { items: TransactionView["notifications"] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="notif-heading" className="panel p-5">
      <h2 id="notif-heading" className="font-display text-xl font-bold">Simulated messages</h2>
      <p className="text-sm text-ink-soft">What each party would receive. Nothing is actually sent.</p>
      <ul className="mt-3 space-y-3">
        {items.map((n) => (
          <li key={n.id} className="text-sm rounded-lg bg-mist p-3">
            <p className="text-ink-soft">
              To {n.recipient} via {n.channel}, {when(n.created_at)}
            </p>
            <p className="mt-0.5">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
