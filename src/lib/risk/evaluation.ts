import { assessRisk, type RiskInput, type RiskLevel } from "./engine";

/**
 * Offline evaluation on a SYNTHETIC labelled scenario set. We generated these
 * scenarios ourselves, so results show the rules behave as designed. They are
 * not evidence of real-world accuracy.
 */

export interface LabelledScenario {
  label: "legit" | "scam";
  kind: string;
  input: RiskInput;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildScenarios(count = 200, seed = 2026): LabelledScenario[] {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (a: number, b: number) => Math.round(a + r() * (b - a));
  const out: LabelledScenario[] = [];

  for (let i = 0; i < count; i++) {
    const expectedMin = pick([35_000, 250_000, 900_000, 1_200_000]);
    const expectedMax = Math.round(expectedMin * 1.25);
    const scam = r() < 0.35;
    const kind = scam
      ? pick(["new-account bait", "account takeover", "fake reseller"])
      : pick(["established shop", "new honest seller", "occasional seller"]);

    let input: RiskInput;
    if (kind === "established shop") {
      input = {
        accountAgeDays: between(365, 2000),
        completedTransactions: between(60, 400),
        unresolvedDisputes: r() < 0.1 ? 1 : 0,
        verificationStatus: "verified",
        recentDeviceChange: r() < 0.05,
        paymentNameMatches: true,
        agreedPrice: Math.round(expectedMin * (1 - r() * 0.1)),
        expectedMin,
        expectedMax,
      };
    } else if (kind === "new honest seller") {
      input = {
        accountAgeDays: between(10, 150),
        completedTransactions: between(0, 15),
        unresolvedDisputes: r() < 0.15 ? 1 : 0,
        verificationStatus: pick(["verified", "partial", "partial", "unverified"]),
        recentDeviceChange: r() < 0.1,
        paymentNameMatches: r() < 0.9,
        agreedPrice: Math.round(expectedMin * (1 - r() * 0.3)),
        expectedMin,
        expectedMax,
      };
    } else if (kind === "occasional seller") {
      input = {
        accountAgeDays: between(200, 1500),
        completedTransactions: between(2, 30),
        unresolvedDisputes: 0,
        verificationStatus: pick(["verified", "partial"]),
        recentDeviceChange: r() < 0.1,
        paymentNameMatches: r() < 0.85,
        agreedPrice: Math.round(expectedMin * (1 - r() * 0.35)),
        expectedMin,
        expectedMax,
      };
    } else if (kind === "account takeover") {
      input = {
        accountAgeDays: between(300, 1500),
        completedTransactions: between(20, 200),
        unresolvedDisputes: between(0, 2),
        verificationStatus: pick(["verified", "partial"]),
        recentDeviceChange: true,
        paymentNameMatches: false,
        agreedPrice: Math.round(expectedMin * (1 - (0.3 + r() * 0.4))),
        expectedMin,
        expectedMax,
      };
    } else {
      input = {
        accountAgeDays: between(1, 60),
        completedTransactions: between(0, 4),
        unresolvedDisputes: between(0, 4),
        verificationStatus: pick(["unverified", "unverified", "partial"]),
        recentDeviceChange: r() < 0.5,
        paymentNameMatches: r() < 0.4,
        agreedPrice: Math.round(expectedMin * (1 - (0.25 + r() * 0.5))),
        expectedMin,
        expectedMax,
      };
    }
    out.push({ label: scam ? "scam" : "legit", kind, input });
  }
  return out;
}

export interface EvaluationReport {
  total: number;
  scams: number;
  legit: number;
  byLevel: Record<"legit" | "scam", Record<RiskLevel, number>>;
  /** High-risk flag rate on scams (recall at the "high" threshold). */
  scamFlaggedHigh: number;
  /** Scams flagged medium or high (i.e. user is warned). */
  scamWarned: number;
  /** Share of legitimate sellers rated HIGH (false positive rate). */
  falsePositiveHigh: number;
  /** Share of legitimate sellers rated medium or high (extra friction). */
  legitWarned: number;
}

export function evaluate(scenarios = buildScenarios()): EvaluationReport {
  const byLevel = {
    legit: { low: 0, medium: 0, high: 0 },
    scam: { low: 0, medium: 0, high: 0 },
  };
  for (const s of scenarios) byLevel[s.label][assessRisk(s.input).level] += 1;
  const scams = byLevel.scam.low + byLevel.scam.medium + byLevel.scam.high;
  const legit = byLevel.legit.low + byLevel.legit.medium + byLevel.legit.high;
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);
  return {
    total: scenarios.length,
    scams,
    legit,
    byLevel,
    scamFlaggedHigh: pct(byLevel.scam.high, scams),
    scamWarned: pct(byLevel.scam.high + byLevel.scam.medium, scams),
    falsePositiveHigh: pct(byLevel.legit.high, legit),
    legitWarned: pct(byLevel.legit.high + byLevel.legit.medium, legit),
  };
}
