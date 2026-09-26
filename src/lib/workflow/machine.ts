/**
 * The protected-transaction state machine. This is the ONLY place that decides
 * which role may do what, and in which state. The service layer calls
 * `nextStatus` inside a row-locked DB transaction, so the rules hold even if
 * the UI is bypassed with direct requests.
 */

export type Role = "buyer" | "seller" | "admin";

export const STATUSES = [
  "ASSESSED",
  "VERIFICATION_REQUESTED",
  "AWAITING_SELLER",
  "SELLER_REJECTED",
  "ACCEPTED",
  "FUNDED",
  "SHIPPED",
  "DELIVERED",
  "RELEASED",
  "DISPUTED",
  "RESOLVED_REFUNDED",
  "RESOLVED_RELEASED",
  "CANCELLED",
  "REPORTED",
] as const;
export type Status = (typeof STATUSES)[number];

export type ActionType =
  | "continue"
  | "request_verification"
  | "provide_verification"
  | "cancel"
  | "report"
  | "amend_price"
  | "seller_accept"
  | "seller_reject"
  | "pay"
  | "ship"
  | "confirm_delivery"
  | "release"
  | "open_dispute"
  | "seller_respond"
  | "resolve_refund"
  | "resolve_release"
  | "review_report";

interface Rule {
  roles: Role[];
  from: Status[];
  to: Status | null; // null = stays in the same status
  label: string;
}

const PRE_PAYMENT: Status[] = ["ASSESSED", "VERIFICATION_REQUESTED", "AWAITING_SELLER", "ACCEPTED"];

export const RULES: Record<ActionType, Rule> = {
  continue: { roles: ["buyer"], from: ["ASSESSED", "VERIFICATION_REQUESTED"], to: "AWAITING_SELLER", label: "Continue with protected payment" },
  request_verification: { roles: ["buyer"], from: ["ASSESSED"], to: "VERIFICATION_REQUESTED", label: "Request seller verification" },
  provide_verification: { roles: ["seller"], from: ["VERIFICATION_REQUESTED"], to: null, label: "Provide verification" },
  cancel: { roles: ["buyer"], from: PRE_PAYMENT, to: "CANCELLED", label: "Pause / cancel" },
  report: { roles: ["buyer"], from: PRE_PAYMENT, to: "REPORTED", label: "Report suspicious request" },
  amend_price: { roles: ["buyer"], from: PRE_PAYMENT, to: "ASSESSED", label: "Change agreed price" },
  seller_accept: { roles: ["seller"], from: ["AWAITING_SELLER"], to: "ACCEPTED", label: "Accept purchase details" },
  seller_reject: { roles: ["seller"], from: ["AWAITING_SELLER"], to: "SELLER_REJECTED", label: "Reject purchase details" },
  pay: { roles: ["buyer"], from: ["ACCEPTED"], to: "FUNDED", label: "Secure payment in escrow" },
  ship: { roles: ["seller"], from: ["FUNDED"], to: "SHIPPED", label: "Mark as shipped" },
  confirm_delivery: { roles: ["buyer"], from: ["SHIPPED"], to: "DELIVERED", label: "Confirm delivery with OTP" },
  release: { roles: ["buyer"], from: ["DELIVERED"], to: "RELEASED", label: "Release payment to seller" },
  open_dispute: { roles: ["buyer"], from: ["SHIPPED", "DELIVERED"], to: "DISPUTED", label: "Report a problem" },
  seller_respond: { roles: ["seller"], from: ["DISPUTED"], to: null, label: "Respond to dispute" },
  resolve_refund: { roles: ["admin"], from: ["DISPUTED"], to: "RESOLVED_REFUNDED", label: "Refund buyer" },
  resolve_release: { roles: ["admin"], from: ["DISPUTED"], to: "RESOLVED_RELEASED", label: "Release to seller" },
  review_report: { roles: ["admin"], from: ["REPORTED"], to: null, label: "Record report review" },
};

export class WorkflowError extends Error {
  constructor(
    public code: "FORBIDDEN_ROLE" | "INVALID_STATE" | "VALIDATION" | "NOT_FOUND" | "OTP_INVALID" | "OTP_LOCKED",
    message: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

export function nextStatus(current: Status, role: Role, action: ActionType): Status {
  const rule = RULES[action];
  if (!rule) throw new WorkflowError("VALIDATION", `Unknown action "${action}"`);
  if (!rule.roles.includes(role)) {
    throw new WorkflowError(
      "FORBIDDEN_ROLE",
      `A ${role} cannot "${rule.label}". Only: ${rule.roles.join(", ")}.`,
    );
  }
  if (!rule.from.includes(current)) {
    throw new WorkflowError(
      "INVALID_STATE",
      `"${rule.label}" is not allowed while the transaction is ${humanStatus(current)}.`,
    );
  }
  return rule.to ?? current;
}

export function availableActions(current: Status, role: Role): ActionType[] {
  return (Object.keys(RULES) as ActionType[]).filter(
    (a) => RULES[a].roles.includes(role) && RULES[a].from.includes(current),
  );
}

const HUMAN: Record<Status, string> = {
  ASSESSED: "trust-checked, awaiting buyer decision",
  VERIFICATION_REQUESTED: "waiting for seller verification",
  AWAITING_SELLER: "waiting for seller to accept",
  SELLER_REJECTED: "rejected by seller",
  ACCEPTED: "accepted, awaiting payment",
  FUNDED: "paid into escrow",
  SHIPPED: "shipped",
  DELIVERED: "delivered, in inspection",
  RELEASED: "completed, payment released",
  DISPUTED: "under dispute (funds locked)",
  RESOLVED_REFUNDED: "resolved, buyer refunded",
  RESOLVED_RELEASED: "resolved, released to seller",
  CANCELLED: "cancelled by buyer",
  REPORTED: "reported for review",
};

export function humanStatus(s: Status): string {
  return HUMAN[s];
}

export const TERMINAL: Status[] = [
  "SELLER_REJECTED",
  "RELEASED",
  "RESOLVED_REFUNDED",
  "RESOLVED_RELEASED",
  "CANCELLED",
];

/** Main path shown in the progress stepper. */
export const JOURNEY: { status: Status; label: string }[] = [
  { status: "ASSESSED", label: "Trust check" },
  { status: "AWAITING_SELLER", label: "Seller confirms" },
  { status: "FUNDED", label: "Escrow secured" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
  { status: "RELEASED", label: "Released" },
];
