/**
 * AI-assisted dispute evidence summary. Deterministic and template-based so it
 * cannot hallucinate and never sees secrets. It organises the evidence for a
 * human reviewer. It deliberately has no "verdict" or "recommendation" field.
 */

export type DisputeReason = "not_received" | "wrong_item" | "damaged" | "counterfeit" | "other";

export const DISPUTE_REASONS: Record<DisputeReason, string> = {
  not_received: "Item not received",
  wrong_item: "Wrong item received",
  damaged: "Item damaged",
  counterfeit: "Item appears fake / not as described",
  other: "Other problem",
};

export interface EvidenceMeta {
  name: string;
  type: string;
  sizeKb: number;
  submittedBy: "buyer" | "seller";
}

export interface DisputeSummaryInput {
  reason: DisputeReason;
  details: string;
  sellerResponse: string | null;
  deliveryStatus: "in_transit" | "delivered" | null;
  otpVerified: boolean;
  deliveredAt: string | null;
  openedAt: string;
  inspectionDays: number;
  evidence: EvidenceMeta[];
  preTradeRiskLevel: "low" | "medium" | "high" | null;
  amount: number;
}

export interface DisputeSummary {
  headline: string;
  keyFacts: string[];
  consistencyChecks: string[];
  evidenceGaps: string[];
  disclaimer: string;
  generatedBy: string;
}

function firstSentence(text: string, max = 160): string {
  const t = text.trim().replace(/\s+/g, " ");
  const cut = t.split(/(?<=[.!?])\s/)[0] ?? t;
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

export function summarizeDispute(i: DisputeSummaryInput): DisputeSummary {
  const reasonLabel = DISPUTE_REASONS[i.reason];
  const keyFacts: string[] = [
    `Buyer's complaint: ${reasonLabel}. "${firstSentence(i.details)}"`,
    i.sellerResponse
      ? `Seller's response: "${firstSentence(i.sellerResponse)}"`
      : "Seller has not responded yet.",
    i.otpVerified
      ? `Delivery confirmed with a one-time code${i.deliveredAt ? ` at ${new Date(i.deliveredAt).toLocaleString("en-GB")}` : ""}.`
      : `Delivery not confirmed by code (courier status: ${i.deliveryStatus ?? "unknown"}).`,
    `Funds held in escrow: TZS ${i.amount.toLocaleString("en-US")}.`,
  ];
  if (i.preTradeRiskLevel) {
    keyFacts.push(`Pre-payment trust check rated this trade ${i.preTradeRiskLevel} risk.`);
  }

  const consistencyChecks: string[] = [];
  if (i.reason === "not_received" && i.otpVerified) {
    consistencyChecks.push(
      "Complaint says item not received, but the delivery code was entered. Ask both parties how the code was shared.",
    );
  }
  if (i.reason !== "not_received" && !i.otpVerified) {
    consistencyChecks.push(
      "Complaint is about the item's condition, but delivery was never confirmed by code.",
    );
  }
  if (i.deliveredAt) {
    const hours = (new Date(i.openedAt).getTime() - new Date(i.deliveredAt).getTime()) / 36e5;
    consistencyChecks.push(
      hours <= i.inspectionDays * 24
        ? `Dispute opened ${Math.max(0, Math.round(hours))}h after delivery, inside the ${i.inspectionDays}-day inspection window.`
        : `Dispute opened after the ${i.inspectionDays}-day inspection window.`,
    );
  }

  const buyerFiles = i.evidence.filter((e) => e.submittedBy === "buyer");
  const sellerFiles = i.evidence.filter((e) => e.submittedBy === "seller");
  const evidenceGaps: string[] = [];
  if (buyerFiles.length === 0 && i.reason !== "not_received") {
    evidenceGaps.push("Buyer has not attached photos of the item received.");
  }
  if (!i.sellerResponse) evidenceGaps.push("Waiting for the seller's side of the story.");
  if (sellerFiles.length === 0 && i.sellerResponse) {
    evidenceGaps.push("Seller has not attached proof (e.g. packing photo, courier receipt).");
  }
  if (evidenceGaps.length === 0) evidenceGaps.push("Both parties have submitted a statement and evidence.");

  return {
    headline: `${reasonLabel}: ${buyerFiles.length} buyer file(s), ${sellerFiles.length} seller file(s), seller ${i.sellerResponse ? "has responded" : "has not responded"}.`,
    keyFacts,
    consistencyChecks,
    evidenceGaps,
    disclaimer:
      "This summary organises the evidence. It does not decide the case. A human reviewer makes the refund or release decision.",
    generatedBy: "SalamaPay evidence summariser v1 (template-based)",
  };
}
