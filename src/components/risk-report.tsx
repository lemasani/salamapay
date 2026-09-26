import type { RiskResult } from "@/lib/risk/engine";
import { RISK_CONFIG } from "@/lib/risk/config";
import { LEVEL_STYLE, tzs } from "@/lib/format";

interface StoredInputs {
  accountAgeDays: number;
  completedTransactions: number;
  unresolvedDisputes: number;
  verificationStatus: string;
  recentDeviceChange: boolean;
  paymentNameMatches: boolean;
  agreedPrice: number;
  expectedMin: number;
  expectedMax: number;
  sellerRegisteredName: string;
  paymentAccountName: string;
  messageProvided: boolean;
  messageRedactions: number;
}

const VERIFICATION: Record<string, string> = {
  verified: "Verified",
  partial: "Partially verified",
  unverified: "Not verified",
};

export function RiskReport({
  result,
  inputs,
  compact = false,
}: {
  result: RiskResult;
  inputs: StoredInputs;
  compact?: boolean;
}) {
  const style = LEVEL_STYLE[result.level];
  const { mediumFrom, highFrom } = RISK_CONFIG.levels;

  return (
    <section aria-labelledby="trust-heading" className="panel overflow-hidden">
      <div className={`px-6 pt-6 pb-5 ${style.bg}`}>
        <h2 id="trust-heading" className="font-semibold text-ink">
          Trust check result
        </h2>
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className={`reveal-score font-display font-bold leading-none tabular ${style.text} text-7xl sm:text-8xl`}>
            {result.score}
            <span className="text-2xl text-ink-soft font-semibold">/100</span>
          </p>
          <div className="pb-2">
            <p className={`font-display text-3xl font-bold ${style.text}`}>{style.label}</p>
            <p className="text-ink-soft text-sm">
              Confidence: {result.confidence.level}. {result.confidence.explanation}
            </p>
          </div>
        </div>

        {/* Three-zone meter */}
        <div className="mt-6" aria-hidden="true">
          <div className="relative h-3 rounded-full flex overflow-visible">
            <div className="h-full rounded-l-full bg-salama" style={{ width: `${mediumFrom}%` }} />
            <div className="h-full bg-amber" style={{ width: `${highFrom - mediumFrom}%` }} />
            <div className="h-full rounded-r-full bg-crimson" style={{ width: `${100 - highFrom}%` }} />
            <span
              className="slide-marker absolute -top-1.5 h-6 w-1.5 -ml-0.75 rounded bg-ink ring-2 ring-paper"
              style={{ left: `${result.score}%` }}
            />
          </div>
          <div className="mt-1.5 flex text-xs text-ink-soft tabular">
            <span style={{ width: `${mediumFrom}%` }}>Low 0–{mediumFrom - 1}</span>
            <span style={{ width: `${highFrom - mediumFrom}%` }}>Medium {mediumFrom}–{highFrom - 1}</span>
            <span>High {highFrom}–100</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 border-t border-line">
        <p className="text-sm text-ink-soft">Recommended next step</p>
        <p className="font-display text-2xl font-bold mt-0.5">{result.recommendedAction.title}</p>
        <p className="mt-1 max-w-2xl">{result.recommendedAction.detail}</p>
      </div>

      {result.topSignals.length > 0 && (
        <div className="px-6 py-5 border-t border-line">
          <h3 className="font-semibold">Strongest signals</h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {result.topSignals.map((s) => (
              <li key={s.id} className={`rounded-lg p-4 ${style.bg}`}>
                <p className="font-semibold leading-snug">{s.label}</p>
                <p className="text-sm mt-1">{s.value}</p>
                <p className="text-sm text-ink-soft mt-2">{s.whyItMatters}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (
        <>
          <details className="px-6 py-4 border-t border-line">
            <summary className="cursor-pointer font-semibold">
              How the score adds up ({result.reasons.length} factors)
            </summary>
            <table className="mt-3 w-full text-[0.95rem]">
              <caption className="sr-only">Score breakdown</caption>
              <thead className="text-left text-sm text-ink-soft">
                <tr>
                  <th scope="col" className="py-1.5 font-medium">Signal</th>
                  <th scope="col" className="py-1.5 font-medium hidden sm:table-cell">Evidence</th>
                  <th scope="col" className="py-1.5 font-medium text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.reasons.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      {r.label}
                      <span className="block text-sm text-ink-soft sm:hidden">{r.value}</span>
                    </td>
                    <td className="py-2 pr-3 text-ink-soft hidden sm:table-cell">{r.value}</td>
                    <td className={`py-2 text-right font-semibold tabular ${r.points < 0 ? "text-salama" : ""}`}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-2" colSpan={2}>
                    Total{result.rawScore !== result.score ? ` (${result.rawScore}, capped to 0–100)` : ""}
                  </td>
                  <td className="py-2 text-right tabular sm:hidden">{result.score}</td>
                  <td className="py-2 text-right tabular hidden sm:table-cell">{result.score}</td>
                </tr>
              </tbody>
            </table>
          </details>

          <details className="px-6 py-4 border-t border-line">
            <summary className="cursor-pointer font-semibold">Data the engine received</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-[0.95rem]">
              <Item k="Seller account age" v={`${inputs.accountAgeDays} days`} />
              <Item k="Completed sales" v={String(inputs.completedTransactions)} />
              <Item k="Unresolved disputes" v={String(inputs.unresolvedDisputes)} />
              <Item k="Identity" v={VERIFICATION[inputs.verificationStatus]} />
              <Item k="Recent phone/device change" v={inputs.recentDeviceChange ? "Yes" : "No"} />
              <Item
                k="Payment name vs seller"
                v={`"${inputs.paymentAccountName}" vs "${inputs.sellerRegisteredName}": ${inputs.paymentNameMatches ? "match" : "no match"}`}
              />
              <Item k="Agreed price" v={tzs(inputs.agreedPrice)} />
              <Item k="Usual range (simulated)" v={`${tzs(inputs.expectedMin)} to ${tzs(inputs.expectedMax)}`} />
              <Item
                k="Seller message"
                v={
                  inputs.messageProvided
                    ? `Analysed, not stored${inputs.messageRedactions ? `; ${inputs.messageRedactions} secret(s) removed first` : ""}`
                    : "Not provided"
                }
              />
            </dl>
            <p className="field-hint mt-3">
              Something wrong here? Sellers can ask for their record to be corrected, and any
              dispute is decided by a person.
            </p>
          </details>
        </>
      )}

      <div className="px-6 py-4 border-t border-line bg-mist text-sm">
        <p className="font-semibold">Limits of this result</p>
        <ul className="mt-1 list-disc pl-5 text-ink-soft space-y-0.5">
          {result.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <p className="mt-2 text-ink-soft">Model: {result.modelVersion}</p>
      </div>
    </section>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
