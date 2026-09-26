import { getImpactMetrics } from "@/lib/services/metrics";
import { tzs } from "@/lib/format";

export default async function ImpactPage() {
  const m = await getImpactMetrics();
  const rows = [
    {
      name: "High-risk payments flagged before money moved",
      value: m.highFlaggedBeforePayment.value == null ? "n/a" : `${m.highFlaggedBeforePayment.value}%`,
      detail: `${m.highFlaggedBeforePayment.numerator} of ${m.highFlaggedBeforePayment.denominator} high-risk purchases were flagged before payment. ${m.highFlaggedBeforePayment.stopped} never reached escrow.`,
    },
    {
      name: "Value of risky payments paused or stopped",
      value: tzs(m.valuePaused.tzs),
      detail: `${m.valuePaused.count} medium or high-risk purchases were cancelled, reported or held for verification.`,
    },
    {
      name: "False-positive rate",
      value: `${m.falsePositive.value}%`,
      detail: `Honest sellers wrongly rated high, across ${m.falsePositive.sample} synthetic test scenarios. ${m.falsePositive.legitWarned}% of honest sellers were asked for extra verification.`,
    },
    {
      name: "Protected purchases completed successfully",
      value: m.completedSuccessfully.value == null ? "n/a" : `${m.completedSuccessfully.value}%`,
      detail: `${m.completedSuccessfully.numerator} of ${m.completedSuccessfully.denominator} closed escrow purchases ended with the buyer releasing payment.`,
    },
    {
      name: "Average time to resolve a dispute",
      value: m.disputeResolution.avgHours == null ? "n/a" : `${m.disputeResolution.avgHours} h`,
      detail: `${m.disputeResolution.resolved} resolved by a reviewer, ${m.disputeResolution.open} still open.`,
    },
  ];

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-4xl font-bold">Impact indicators</h1>
        <p className="mt-3 text-lg text-ink-soft max-w-2xl">
          Simulated outcomes from {m.total} synthetic transactions in this demo, including any you
          create. These numbers show what we would measure in a pilot. They are not real-world results.
        </p>
      </div>
      <ol className="panel divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.name} className="grid gap-2 sm:grid-cols-[2.5rem_1fr_auto] items-baseline px-5 py-5">
            <span className="font-display text-xl font-bold text-ink-soft tabular">{i + 1}</span>
            <div>
              <p className="font-semibold text-lg">{r.name}</p>
              <p className="text-ink-soft">{r.detail}</p>
            </div>
            <p className="font-display text-4xl font-bold text-salama tabular sm:text-right">{r.value}</p>
          </li>
        ))}
      </ol>
      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Who could plug this in</h2>
          <p className="mt-2">
            Banks, mobile-money providers, telecoms and marketplaces could call the same trust check
            through an API just before a customer confirms a payment, and show &ldquo;Protected by
            SalamaPay&rdquo; at checkout. Licensed partners would hold the real funds.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">What a pilot needs</h2>
          <p className="mt-2">
            One licensed payment partner, one courier, verified merchants, limits on transaction
            size, and human-led fraud and dispute review, before any trained model replaces these
            rules.
          </p>
        </div>
      </section>
    </div>
  );
}
