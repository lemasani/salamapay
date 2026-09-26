import { notFound } from "next/navigation";
import Link from "next/link";
import { getRole } from "@/lib/session";
import { getTransactionView, type TransactionView } from "@/lib/services/transactions";
import { availableActions, humanStatus, JOURNEY, type Status } from "@/lib/workflow/machine";
import { transactionAction } from "@/app/actions";
import { RiskReport } from "@/components/risk-report";
import { MoneyStrip } from "@/components/money-strip";
import { Notifications, Timeline } from "@/components/timeline";
import { ActionPanel } from "@/components/action-panel";
import { DISPUTE_REASONS, type DisputeReason, type DisputeSummary, type EvidenceMeta } from "@/lib/ai/dispute-summary";
import { LEVEL_STYLE, tzs, when } from "@/lib/format";

export default async function TransactionPage(props: PageProps<"/t/[id]">) {
  const { id } = await props.params;
  const [view, role] = await Promise.all([getTransactionView(id), getRole()]);
  if (!view) notFound();
  const { tx, seller, assessment, delivery, dispute } = view;

  const actions = availableActions(tx.status, role);
  const courierSlip =
    role === "buyer" ? view.notifications.find((n) => n.recipient === "courier")?.body ?? null : null;
  const level = assessment?.level as keyof typeof LEVEL_STYLE | undefined;
  const showFullReport = ["ASSESSED", "VERIFICATION_REQUESTED", "REPORTED", "CANCELLED"].includes(tx.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-ink-soft">
            <Link href="/" className="underline underline-offset-2">Transactions</Link> / {tx.id}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1">{tx.product_description}</h1>
          <p className="mt-1 text-ink-soft">
            {tzs(tx.price)} to {seller.display_name} ({seller.handle}), found on {tx.source_channel}.
            Buyer: {view.buyer.name.replace(/\.$/, "")}.
          </p>
        </div>
        <p className="rounded-full bg-paper border border-line px-4 py-1.5 font-semibold">
          {humanStatus(tx.status)}
        </p>
      </header>

      <Journey status={tx.status} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6 min-w-0">
          {assessment && showFullReport && (
            <RiskReport result={assessment.result} inputs={assessment.input_signals} />
          )}
          <ActionPanel
            role={role}
            status={tx.status}
            actions={actions}
            run={transactionAction.bind(null, tx.id)}
            price={tx.price}
            inspectionDays={tx.inspection_days}
            riskLevel={level ?? null}
            courierSlip={courierSlip}
            hasSellerResponse={Boolean(dispute?.seller_response)}
            trackingSuggestion={`KC-${tx.id.replace(/\D/g, "")}${tx.inspection_days}7`}
          />
          <WaitingNote status={tx.status} role={role} hasActions={actions.length > 0} />

          {dispute && <DisputeCard view={view} role={role} />}

          <MoneyStrip status={tx.status} amount={tx.price} />

          {assessment && !showFullReport && (
            <RiskReport result={assessment.result} inputs={assessment.input_signals} compact />
          )}

          {view.assessmentHistory.length > 1 && (
            <p className="text-sm text-ink-soft">
              Earlier checks for this purchase:{" "}
              {view.assessmentHistory.slice(1).map((a) => `${a.score} (${a.level}) on ${when(a.created_at)}`).join("; ")}.
            </p>
          )}

          <section className="panel p-5 grid gap-4 sm:grid-cols-3 text-[0.95rem]">
            <Fact k="Pay to" v={`${tx.payment_account}, ${tx.payment_account_name}`} />
            <Fact k="Inspection period" v={`${tx.inspection_days} day${tx.inspection_days > 1 ? "s" : ""} after delivery`} />
            <Fact k="Seller profile" v={seller.profile_label} />
            {delivery && <Fact k="Courier" v={`${delivery.courier}, ref ${delivery.tracking_ref}`} />}
            {delivery && (
              <Fact
                k="Delivery"
                v={delivery.delivered_at ? `Confirmed by code, ${when(delivery.delivered_at)}` : "In transit"}
              />
            )}
            {view.ledger.length > 0 && (
              <Fact
                k="Escrow ledger (simulated)"
                v={view.ledger.map((l) => `${l.entry_type.toLowerCase()} ${tzs(l.amount)}`).join(", ")}
              />
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Timeline events={view.audit} />
          <Notifications items={view.notifications.filter((n) => n.recipient !== "courier")} />
        </aside>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-sm text-ink-soft">{k}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}

/** Index of the journey step currently in progress (steps before it are done). */
const STEP: Record<Status, number> = {
  ASSESSED: 0, VERIFICATION_REQUESTED: 0, CANCELLED: 0, REPORTED: 0,
  AWAITING_SELLER: 1, SELLER_REJECTED: 1,
  ACCEPTED: 2, FUNDED: 3, SHIPPED: 4, DELIVERED: 5, DISPUTED: 5,
  RELEASED: 6, RESOLVED_REFUNDED: 5, RESOLVED_RELEASED: 6,
};

const OFF_PATH: Partial<Record<Status, string>> = {
  CANCELLED: "Stopped by the buyer before paying",
  REPORTED: "Reported before paying",
  SELLER_REJECTED: "Seller declined",
  DISPUTED: "In dispute, funds locked",
  RESOLVED_REFUNDED: "Dispute resolved: buyer refunded",
  RESOLVED_RELEASED: "Dispute resolved: seller paid",
};

function Journey({ status }: { status: Status }) {
  const at = STEP[status];
  const stopped = status in OFF_PATH;
  return (
    <nav aria-label="Purchase progress">
      <ol className="flex flex-wrap items-center gap-y-2 text-sm">
        {JOURNEY.map((step, i) => {
          const done = i < at;
          const current = i === at && !stopped;
          return (
            <li key={step.status} className="flex items-center">
              <span
                aria-current={current ? "step" : undefined}
                className={`rounded-full px-3 py-1 font-medium ${
                  current ? "bg-ink text-white" : done ? "bg-salama-tint text-salama" : "text-ink-soft"
                }`}
              >
                {step.label}
              </span>
              {i < JOURNEY.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-4 bg-line" />}
            </li>
          );
        })}
        {OFF_PATH[status] && (
          <li className="ml-2 rounded-full px-3 py-1 font-semibold bg-crimson-tint text-crimson">{OFF_PATH[status]}</li>
        )}
      </ol>
    </nav>
  );
}

function WaitingNote({ status, role, hasActions }: { status: Status; role: string; hasActions: boolean }) {
  if (hasActions) return null;
  const waitingOn: Partial<Record<Status, string>> = {
    VERIFICATION_REQUESTED: "Waiting for the seller to send verification. Switch to Seller to respond.",
    AWAITING_SELLER: "Waiting for the seller to accept. Switch to Seller to continue the demo.",
    ACCEPTED: "Waiting for the buyer to secure payment. Switch to Buyer.",
    FUNDED: "Waiting for the seller to ship. Switch to Seller.",
    SHIPPED: "Waiting for the buyer to confirm delivery. Switch to Buyer.",
    DELIVERED: "The buyer is inspecting the item.",
    DISPUTED: "A reviewer will decide. Switch to Reviewer (Asha) to continue the demo.",
    REPORTED: "Reported to the review team. Switch to Reviewer to see it.",
  };
  const msg = waitingOn[status];
  if (!msg) return null;
  return (
    <p className="panel px-5 py-4 text-ink-soft">
      {msg}
      {role === "admin" && status !== "DISPUTED" && status !== "REPORTED" && " Reviewers don't take part in normal trades."}
    </p>
  );
}

function DisputeCard({ view, role }: { view: TransactionView; role: string }) {
  const d = view.dispute;
  const summary = d.ai_summary as DisputeSummary | null;
  const evidence = (d.evidence ?? []) as EvidenceMeta[];
  return (
    <section aria-labelledby="dispute-heading" className="panel overflow-hidden">
      <div className="px-6 py-5">
        <h2 id="dispute-heading" className="font-display text-2xl font-bold">
          Dispute: {DISPUTE_REASONS[d.reason as DisputeReason]}
        </h2>
        <p className="text-sm text-ink-soft">Opened {when(d.opened_at)}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-gold-tint p-4">
            <p className="font-semibold">Buyer</p>
            <p className="mt-1">{d.details}</p>
          </div>
          <div className="rounded-lg bg-mist p-4">
            <p className="font-semibold">Seller</p>
            <p className="mt-1">{d.seller_response ?? <span className="text-ink-soft">No response yet.</span>}</p>
          </div>
        </div>
        {evidence.length > 0 && (
          <ul className="mt-3 text-sm text-ink-soft">
            {evidence.map((e, i) => (
              <li key={i}>
                {e.submittedBy === "buyer" ? "Buyer" : "Seller"} attached {e.name} ({e.type}, {e.sizeKb} KB)
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary && (role === "admin" || d.human_decision) && (
        <div className="px-6 py-5 border-t border-line bg-mist">
          <p className="font-semibold">Evidence summary for the reviewer</p>
          <p className="text-sm text-ink-soft">{summary.generatedBy}</p>
          <p className="mt-2 font-medium">{summary.headline}</p>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-[0.95rem]">
            {summary.keyFacts.map((f) => <li key={f}>{f}</li>)}
          </ul>
          {summary.consistencyChecks.length > 0 && (
            <>
              <p className="mt-3 font-semibold text-sm">Timing and consistency</p>
              <ul className="list-disc pl-5 space-y-1 text-[0.95rem]">
                {summary.consistencyChecks.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </>
          )}
          <p className="mt-3 font-semibold text-sm">Missing evidence</p>
          <ul className="list-disc pl-5 space-y-1 text-[0.95rem]">
            {summary.evidenceGaps.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p className="mt-3 text-sm font-semibold text-crimson">{summary.disclaimer}</p>
        </div>
      )}

      {d.human_decision && (
        <div className="px-6 py-5 border-t border-line">
          <p className="font-semibold">
            Human decision: {d.human_decision === "refund_buyer" ? "buyer refunded" : "payment released to seller"}
          </p>
          <p className="mt-1">&ldquo;{d.decision_rationale}&rdquo;</p>
          <p className="text-sm text-ink-soft mt-1">Decided {when(d.decided_at)} by a SalamaPay reviewer.</p>
        </div>
      )}
    </section>
  );
}
