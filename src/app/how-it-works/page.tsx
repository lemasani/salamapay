import { MODEL_VERSION, RISK_CONFIG as C } from "@/lib/risk/config";
import { evaluate } from "@/lib/risk/evaluation";

const RULES: [string, string][] = [
  ["Every payment starts at", `+${C.base}`],
  [`Seller account less than ${C.accountAge.veryNewDays} days old`, `+${C.accountAge.veryNewPoints}`],
  [`Seller account ${C.accountAge.veryNewDays} to ${C.accountAge.newDays - 1} days old`, `+${C.accountAge.newPoints}`],
  [`${C.disputes.manyThreshold} or more unresolved disputes`, `+${C.disputes.manyPoints}`],
  ["One unresolved dispute", `+${C.disputes.onePoints}`],
  [`Price more than ${C.price.severePct}% below the usual range`, `+${C.price.severePoints}`],
  [`Price ${C.price.moderatePct}% to ${C.price.severePct}% below`, `+${C.price.moderatePoints}`],
  [`Price ${C.price.slightPct}% to ${C.price.moderatePct}% below`, `+${C.price.slightPoints}`],
  ["Identity not verified", `+${C.verification.unverifiedPoints}`],
  ["Identity partially verified", `+${C.verification.partialPoints}`],
  ["Payment account name doesn't match the seller", `+${C.paymentNameMismatchPoints}`],
  ["Phone number or device changed recently", `+${C.recentDeviceChangePoints}`],
  [`Fewer than ${C.thinHistory.maxCompleted} completed sales`, `+${C.thinHistory.points}`],
  [`Verified, ${C.strongHistory.minCompleted}+ sales and no open disputes`, `${C.strongHistory.points}`],
  [`Warning patterns in the seller's message (combined, at most)`, `+${C.message.cap}`],
];

export default function HowItWorks() {
  const ev = evaluate();
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-4xl font-bold">How the trust score works</h1>
        <p className="mt-3 text-lg text-ink-soft">
          No black box. The score is a sum of the rules below, and every result shows which rules
          applied to that seller. The total is kept between 0 and 100.
        </p>
      </div>

      <section className="panel overflow-hidden">
        <table className="w-full">
          <caption className="sr-only">Scoring rules</caption>
          <thead className="bg-mist text-left text-sm text-ink-soft">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Rule</th>
              <th scope="col" className="px-5 py-2.5 font-medium text-right">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {RULES.map(([r, p]) => (
              <tr key={r}>
                <td className="px-5 py-2.5">{r}</td>
                <td className={`px-5 py-2.5 text-right font-semibold tabular ${p.startsWith("-") ? "text-salama" : ""}`}>{p}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid sm:grid-cols-3 border-t border-line text-center">
          <p className="p-4 bg-salama-tint"><strong className="block text-salama">0–{C.levels.mediumFrom - 1} low</strong>Continue with protection</p>
          <p className="p-4 bg-amber-tint"><strong className="block text-amber">{C.levels.mediumFrom}–{C.levels.highFrom - 1} medium</strong>Ask for verification</p>
          <p className="p-4 bg-crimson-tint"><strong className="block text-crimson">{C.levels.highFrom}–100 high</strong>Pause, verify or report</p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-bold">What it never uses</h2>
          <p className="mt-2">
            Gender, tribe, religion, age, location, income or type of phone. Low-cost phones and
            rural sellers are not signs of fraud.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">What it is never allowed to do</h2>
          <p className="mt-2">
            Move, release or refund money, block an account, call anyone a fraudster, or decide a
            dispute. It recommends; the buyer chooses; a person reviews.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Messages and secrets</h2>
          <p className="mt-2">
            A pasted seller message is checked for patterns such as pressure to pay now, requests
            to skip protection or to pay someone else. PINs, OTPs and passwords are removed first,
            and the message itself is not stored.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Getting it corrected</h2>
          <p className="mt-2">
            A high score is a prompt to check, not a verdict. Sellers can ask for wrong records to
            be fixed, and every dispute goes to a human reviewer.
          </p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-bold">How it performs on test scenarios</h2>
        <p className="mt-2 text-ink-soft">
          We ran the rules on {ev.total} synthetic scenarios we wrote ourselves ({ev.legit} honest
          sellers, {ev.scams} scam patterns). This checks that the rules behave as intended. It is
          not a measure of real-world accuracy, which would need real, representative data.
        </p>
        <table className="panel mt-4 w-full overflow-hidden tabular">
          <caption className="sr-only">Results by scenario type</caption>
          <thead className="bg-mist text-left text-sm text-ink-soft">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Scenario</th>
              <th scope="col" className="px-5 py-2.5 font-medium text-right">Low</th>
              <th scope="col" className="px-5 py-2.5 font-medium text-right">Medium</th>
              <th scope="col" className="px-5 py-2.5 font-medium text-right">High</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(["legit", "scam"] as const).map((k) => (
              <tr key={k}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium">{k === "legit" ? "Honest sellers" : "Scam patterns"}</th>
                <td className="px-5 py-2.5 text-right">{ev.byLevel[k].low}</td>
                <td className="px-5 py-2.5 text-right">{ev.byLevel[k].medium}</td>
                <td className="px-5 py-2.5 text-right">{ev.byLevel[k].high}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3">
          {ev.scamWarned}% of scam scenarios got a warning (medium or high), and {ev.scamFlaggedHigh}% were rated high.
          {" "}{ev.falsePositiveHigh}% of honest sellers were wrongly rated high. {ev.legitWarned}% of honest sellers
          were asked for extra verification, mostly new sellers with little history. That is the
          cost of caution, and why the result is a recommendation, not a block.
        </p>
      </section>

      <p className="text-sm text-ink-soft">Model version: {MODEL_VERSION}</p>
    </div>
  );
}
