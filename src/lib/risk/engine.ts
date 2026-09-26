import { MODEL_VERSION, RISK_CONFIG as C } from "./config";
import type { MessageFinding } from "./message";

export type VerificationStatus = "verified" | "partial" | "unverified";
export type RiskLevel = "low" | "medium" | "high";

export interface RiskInput {
  accountAgeDays: number;
  completedTransactions: number;
  unresolvedDisputes: number;
  verificationStatus: VerificationStatus;
  recentDeviceChange: boolean;
  paymentNameMatches: boolean;
  agreedPrice: number;
  expectedMin: number;
  expectedMax: number;
  messageFindings?: MessageFinding[];
}

export interface RiskReason {
  id: string;
  label: string;
  value: string; // the evidence, in plain words
  points: number; // + raises risk, - lowers risk
  whyItMatters: string;
}

export interface RecommendedAction {
  code: "continue_protected" | "request_verification" | "pause_and_verify";
  title: string;
  detail: string;
}

export interface Confidence {
  level: "high" | "moderate" | "low";
  explanation: string;
}

export interface RiskResult {
  score: number;
  rawScore: number;
  level: RiskLevel;
  reasons: RiskReason[]; // sorted strongest first, baseline last
  topSignals: RiskReason[];
  recommendedAction: RecommendedAction;
  confidence: Confidence;
  priceBelowPct: number;
  limitations: string[];
  modelVersion: string;
}

export const LIMITATIONS = [
  "This score is a risk estimate, not proof that anyone is committing fraud.",
  "It uses synthetic seller data and a simulated market-price range.",
  "Rules can be wrong. You decide what to do, and a human reviews any dispute.",
];

export function priceBelowPct(agreed: number, expectedMin: number): number {
  if (expectedMin <= 0 || agreed >= expectedMin) return 0;
  return Math.round(((expectedMin - agreed) / expectedMin) * 1000) / 10;
}

function describeAge(days: number): string {
  if (days >= 365) {
    const y = Math.floor(days / 365);
    return `${y} year${y > 1 ? "s" : ""} old`;
  }
  if (days >= 60) return `${Math.floor(days / 30)} months old`;
  return `${days} day${days === 1 ? "" : "s"} old`;
}

export function levelFor(score: number): RiskLevel {
  if (score >= C.levels.highFrom) return "high";
  if (score >= C.levels.mediumFrom) return "medium";
  return "low";
}

const ACTIONS: Record<RiskLevel, RecommendedAction> = {
  low: {
    code: "continue_protected",
    title: "Continue with SalamaPay protection",
    detail:
      "Signals look healthy. Pay through protected escrow so the seller is only paid after you confirm delivery.",
  },
  medium: {
    code: "request_verification",
    title: "Request extra verification before paying",
    detail:
      "Some signals need checking. Ask the seller for proof (e.g. a live video of the item or business registration) before continuing.",
  },
  high: {
    code: "pause_and_verify",
    title: "Pause. Verify independently or report",
    detail:
      "Several strong warning signs. Do not send money directly. Verify the seller through a channel you trust, or report the request. This is not a finding of fraud.",
  },
};

function confidenceFor(i: RiskInput): Confidence {
  if (i.completedTransactions >= 50 && i.accountAgeDays >= 365) {
    return {
      level: "high",
      explanation:
        "Long history and many completed trades give the engine plenty of evidence.",
    };
  }
  if (i.completedTransactions >= 5 || i.accountAgeDays >= 60) {
    return {
      level: "moderate",
      explanation:
        "Some history is available, but the picture could change as more trades complete.",
    };
  }
  return {
    level: "low",
    explanation:
      "Very little history exists for this seller, so this score is uncertain. That is itself a reason to use protection.",
  };
}

export function assessRisk(i: RiskInput): RiskResult {
  const reasons: RiskReason[] = [];
  const add = (r: RiskReason) => reasons.push(r);

  // Account age
  if (i.accountAgeDays < C.accountAge.veryNewDays) {
    add({
      id: "account_very_new",
      label: "Very new seller account",
      value: describeAge(i.accountAgeDays),
      points: C.accountAge.veryNewPoints,
      whyItMatters:
        "Scam accounts are often created shortly before they are used and abandoned afterwards.",
    });
  } else if (i.accountAgeDays < C.accountAge.newDays) {
    add({
      id: "account_new",
      label: "Fairly new seller account",
      value: describeAge(i.accountAgeDays),
      points: C.accountAge.newPoints,
      whyItMatters:
        "Newer accounts have less track record to judge. Not wrong in itself, but worth checking.",
    });
  }

  // Disputes
  if (i.unresolvedDisputes >= C.disputes.manyThreshold) {
    add({
      id: "disputes_many",
      label: "Several unresolved disputes",
      value: `${i.unresolvedDisputes} open disputes`,
      points: C.disputes.manyPoints,
      whyItMatters:
        "Multiple buyers currently report problems with this seller that haven't been resolved.",
    });
  } else if (i.unresolvedDisputes === 1) {
    add({
      id: "disputes_one",
      label: "One unresolved dispute",
      value: "1 open dispute",
      points: C.disputes.onePoints,
      whyItMatters:
        "Another buyer has an open complaint. It may be a misunderstanding, so ask the seller about it.",
    });
  }

  // Price vs expected range
  const below = priceBelowPct(i.agreedPrice, i.expectedMin);
  if (below > C.price.severePct) {
    add({
      id: "price_far_below",
      label: "Price far below the expected range",
      value: `${below}% below the lowest expected price`,
      points: C.price.severePoints,
      whyItMatters:
        "Prices that are too good to be true are the most common bait in social-commerce scams.",
    });
  } else if (below >= C.price.moderatePct) {
    add({
      id: "price_below",
      label: "Price well below the expected range",
      value: `${below}% below the lowest expected price`,
      points: C.price.moderatePoints,
      whyItMatters:
        "A big discount can be genuine (e.g. used item) but is also used to rush buyers.",
    });
  } else if (below >= C.price.slightPct) {
    add({
      id: "price_slightly_below",
      label: "Price slightly below the expected range",
      value: `${below}% below the lowest expected price`,
      points: C.price.slightPoints,
      whyItMatters: "Small discounts are normal, so this has only a minor effect.",
    });
  }

  // Verification
  if (i.verificationStatus === "unverified") {
    add({
      id: "identity_unverified",
      label: "Seller identity not verified",
      value: "No identity checks completed",
      points: C.verification.unverifiedPoints,
      whyItMatters:
        "Without verification there is no confirmed person or business behind the account.",
    });
  } else if (i.verificationStatus === "partial") {
    add({
      id: "identity_partial",
      label: "Seller only partially verified",
      value: "Phone verified, ID pending",
      points: C.verification.partialPoints,
      whyItMatters: "Some checks are done but the seller's identity is not fully confirmed.",
    });
  }

  if (!i.paymentNameMatches) {
    add({
      id: "payment_name_mismatch",
      label: "Payment account name doesn't match the seller",
      value: "Money would go to a different name",
      points: C.paymentNameMismatchPoints,
      whyItMatters:
        "If you pay someone other than the seller, it is very hard to trace or recover the money.",
    });
  }

  if (i.recentDeviceChange) {
    add({
      id: "device_change",
      label: "Recent phone number or device change",
      value: "Changed in the last 7 days",
      points: C.recentDeviceChangePoints,
      whyItMatters:
        "Can indicate a taken-over account. People also change phones for ordinary reasons.",
    });
  }

  if (i.completedTransactions < C.thinHistory.maxCompleted) {
    add({
      id: "thin_history",
      label: "Few completed sales",
      value: `${i.completedTransactions} completed transaction${i.completedTransactions === 1 ? "" : "s"}`,
      points: C.thinHistory.points,
      whyItMatters: "There is little evidence that past buyers received their goods.",
    });
  }

  if (
    i.verificationStatus === "verified" &&
    i.completedTransactions >= C.strongHistory.minCompleted &&
    i.unresolvedDisputes === 0
  ) {
    add({
      id: "strong_history",
      label: "Verified seller with strong history",
      value: `${i.completedTransactions} completed sales, no open disputes`,
      points: C.strongHistory.points,
      whyItMatters: "A long, clean, verified record lowers risk.",
    });
  }

  // Message language (capped)
  const findings = i.messageFindings ?? [];
  if (findings.length > 0) {
    let budget: number = C.message.cap;
    for (const f of [...findings].sort((a, b) => b.points - a.points)) {
      const pts = Math.min(f.points, budget);
      budget -= pts;
      add({
        id: `msg_${f.category}`,
        label: `Message: ${f.label}`,
        value: `"${f.matches.slice(0, 3).join('", "')}"${pts < f.points ? " (message limit reached)" : ""}`,
        points: pts,
        whyItMatters: f.whyItMatters,
      });
    }
  }

  const rawScore = C.base + reasons.reduce((s, r) => s + r.points, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const level = levelFor(score);

  const sorted = [...reasons].sort((a, b) => b.points - a.points);
  const topSignals = sorted.filter((r) => r.points > 0).slice(0, 3);
  sorted.push({
    id: "baseline",
    label: "Baseline risk",
    value: "Applies to every payment",
    points: C.base,
    whyItMatters: "Any payment to someone you haven't met carries some risk.",
  });

  return {
    score,
    rawScore,
    level,
    reasons: sorted,
    topSignals,
    recommendedAction: ACTIONS[level],
    confidence: confidenceFor(i),
    priceBelowPct: below,
    limitations: LIMITATIONS,
    modelVersion: MODEL_VERSION,
  };
}
