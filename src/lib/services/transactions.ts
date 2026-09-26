import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, withTransaction, type Db } from "@/lib/db";
import { assessRisk, type RiskResult } from "@/lib/risk/engine";
import { analyzeMessage } from "@/lib/risk/message";
import { paymentNameMatches } from "@/lib/risk/name-match";
import { SOURCE_CHANNELS } from "@/lib/data/seed-data";
import {
  DISPUTE_REASONS,
  summarizeDispute,
  type DisputeReason,
  type EvidenceMeta,
} from "@/lib/ai/dispute-summary";
import { nextStatus, WorkflowError, type Role, type Status } from "@/lib/workflow/machine";

export interface Actor {
  role: Role;
  userId: string;
  name: string;
}

export const SYSTEM_ACTOR = { name: "SalamaPay Trust Engine", role: "system" } as const;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_HOURS = 72;
const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_EVIDENCE_KB = 5 * 1024;

// ---------------------------------------------------------------- rows

export interface TransactionRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  product_description: string;
  price: number;
  accepted_price: number | null;
  payment_account: string;
  payment_account_name: string;
  source_channel: string;
  inspection_days: number;
  status: Status;
  buyer_decision: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SellerRow {
  id: string;
  user_id: string;
  profile_label: string;
  display_name: string;
  handle: string;
  phone: string;
  registered_payment_name: string;
  account_age_days: number;
  completed_transactions: number;
  unresolved_disputes: number;
  verification_status: "verified" | "partial" | "unverified";
  recent_device_change: boolean;
}

export interface ProductRow {
  id: string;
  name: string;
  expected_min: number;
  expected_max: number;
}

// ---------------------------------------------------------------- helpers

function text(value: unknown, field: string, max: number, { optional = false } = {}): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v && !optional) throw new WorkflowError("VALIDATION", `${field} is required.`);
  if (v.length > max) throw new WorkflowError("VALIDATION", `${field} must be at most ${max} characters.`);
  return v;
}

function amount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,\s]/g, ""));
  if (!Number.isInteger(n) || n < 1_000 || n > 50_000_000) {
    throw new WorkflowError("VALIDATION", "Price must be a whole number between TZS 1,000 and 50,000,000.");
  }
  return n;
}

async function audit(
  db: Db,
  transactionId: string | null,
  actor: { name: string; role: string },
  action: string,
  detail: Record<string, unknown> = {},
) {
  await db.query(
    "INSERT INTO audit_events (transaction_id, actor, actor_role, action, detail) VALUES ($1,$2,$3,$4,$5)",
    [transactionId, actor.name, actor.role, action, JSON.stringify(detail)],
  );
}

async function notify(
  db: Db,
  transactionId: string,
  recipient: "buyer" | "seller" | "admin" | "courier",
  channel: string,
  body: string,
) {
  await db.query(
    "INSERT INTO notifications (transaction_id, recipient, channel, body) VALUES ($1,$2,$3,$4)",
    [transactionId, recipient, channel, body],
  );
}

function otpHash(transactionId: string, otp: string): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET is not set");
  return createHash("sha256").update(`${secret}:${transactionId}:${otp}`).digest("hex");
}

function validateEvidence(raw: unknown, submittedBy: "buyer" | "seller"): EvidenceMeta[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 5) {
    throw new WorkflowError("VALIDATION", "Attach at most 5 evidence files.");
  }
  return raw.map((e) => {
    const name = text(e?.name, "File name", 100).replace(/[^\w.\- ]/g, "_");
    const type = String(e?.type ?? "");
    const sizeKb = Math.ceil(Number(e?.sizeKb));
    if (!ALLOWED_EVIDENCE_TYPES.includes(type)) {
      throw new WorkflowError("VALIDATION", `${name}: only JPG, PNG, WEBP or PDF files are accepted.`);
    }
    if (!Number.isFinite(sizeKb) || sizeKb <= 0 || sizeKb > MAX_EVIDENCE_KB) {
      throw new WorkflowError("VALIDATION", `${name}: files must be under 5 MB.`);
    }
    return { name, type, sizeKb, submittedBy };
  });
}

// ---------------------------------------------------------------- assessment

async function runAssessment(
  db: Db,
  tx: Pick<TransactionRow, "id" | "price" | "payment_account_name">,
  seller: SellerRow,
  product: ProductRow,
  message: string | null,
): Promise<RiskResult> {
  const msg = message ? analyzeMessage(message) : null;
  const nameMatches = paymentNameMatches(seller.registered_payment_name, tx.payment_account_name);
  const input = {
    accountAgeDays: seller.account_age_days,
    completedTransactions: seller.completed_transactions,
    unresolvedDisputes: seller.unresolved_disputes,
    verificationStatus: seller.verification_status,
    recentDeviceChange: seller.recent_device_change,
    paymentNameMatches: nameMatches,
    agreedPrice: tx.price,
    expectedMin: product.expected_min,
    expectedMax: product.expected_max,
    messageFindings: msg?.findings ?? [],
  };
  const result = assessRisk(input);
  // Stored for explainability. The raw message is NOT stored, only what was found in it.
  const storedInput = {
    ...input,
    sellerRegisteredName: seller.registered_payment_name,
    paymentAccountName: tx.payment_account_name,
    messageProvided: Boolean(message),
    messageRedactions: msg?.redactions ?? 0,
  };
  await db.query(
    `INSERT INTO risk_assessments
       (transaction_id, input_signals, score, level, reasons, recommended_action, result, model_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      tx.id,
      JSON.stringify(storedInput),
      result.score,
      result.level,
      JSON.stringify(result.reasons),
      result.recommendedAction.code,
      JSON.stringify(result),
      result.modelVersion,
    ],
  );
  await audit(db, tx.id, SYSTEM_ACTOR, "risk_assessed", {
    score: result.score,
    level: result.level,
    recommendation: result.recommendedAction.code,
    topSignals: result.topSignals.map((s) => s.label),
  });
  return result;
}

async function loadSeller(db: Db, id: string): Promise<SellerRow> {
  const { rows } = await db.query<SellerRow>("SELECT * FROM seller_profiles WHERE id = $1", [id]);
  if (!rows[0]) throw new WorkflowError("NOT_FOUND", "Seller not found.");
  return rows[0];
}

async function loadProduct(db: Db, id: string): Promise<ProductRow> {
  const { rows } = await db.query<ProductRow>("SELECT * FROM products WHERE id = $1", [id]);
  if (!rows[0]) throw new WorkflowError("NOT_FOUND", "Product not found.");
  return rows[0];
}

// ---------------------------------------------------------------- create

export interface CreatePurchaseInput {
  sellerId: string;
  productId: string;
  productDescription: string;
  price: number | string;
  paymentAccount: string;
  paymentAccountName: string;
  sourceChannel: string;
  inspectionDays: number | string;
  message?: string | null;
  consent: boolean;
}

export async function createPurchase(input: CreatePurchaseInput, actor: Actor) {
  if (actor.role !== "buyer") {
    throw new WorkflowError("FORBIDDEN_ROLE", "Only a buyer can start a protected purchase.");
  }
  if (!input.consent) {
    throw new WorkflowError("VALIDATION", "Please confirm you understand what data the trust check analyses.");
  }
  const price = amount(input.price);
  const inspectionDays = Number(input.inspectionDays);
  if (!Number.isInteger(inspectionDays) || inspectionDays < 1 || inspectionDays > 14) {
    throw new WorkflowError("VALIDATION", "Inspection period must be 1 to 14 days.");
  }
  const sourceChannel = text(input.sourceChannel, "Source", 40);
  if (!(SOURCE_CHANNELS as readonly string[]).includes(sourceChannel)) {
    throw new WorkflowError("VALIDATION", "Choose where you found the offer.");
  }
  const productDescription = text(input.productDescription, "Product description", 300);
  const paymentAccount = text(input.paymentAccount, "Payment account", 80);
  const paymentAccountName = text(input.paymentAccountName, "Payment account name", 80);
  const message = text(input.message, "Message", 2000, { optional: true }) || null;

  return withTransaction(async (db) => {
    const seller = await loadSeller(db, input.sellerId);
    const product = await loadProduct(db, input.productId);
    const { rows } = await db.query<TransactionRow>(
      `INSERT INTO transactions
         (buyer_id, seller_id, product_id, product_description, price, payment_account,
          payment_account_name, source_channel, inspection_days, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ASSESSED') RETURNING *`,
      [
        actor.userId,
        seller.id,
        product.id,
        productDescription,
        price,
        paymentAccount,
        paymentAccountName,
        sourceChannel,
        inspectionDays,
      ],
    );
    const tx = rows[0];
    await audit(db, tx.id, actor, "purchase_created", {
      product: productDescription,
      price,
      seller: seller.display_name,
      source: sourceChannel,
      inspectionDays,
    });
    const result = await runAssessment(db, tx, seller, product, message);
    return { id: tx.id, result };
  });
}

// ---------------------------------------------------------------- actions

export type ActionInput =
  | { type: "continue" }
  | { type: "request_verification" }
  | { type: "provide_verification"; note: string }
  | { type: "cancel"; reason?: string }
  | { type: "report"; reason: string }
  | { type: "amend_price"; price: number | string }
  | { type: "seller_accept" }
  | { type: "seller_reject"; reason?: string }
  | { type: "pay" }
  | { type: "ship"; courier: string; trackingRef: string }
  | { type: "confirm_delivery"; otp: string }
  | { type: "release" }
  | { type: "open_dispute"; reason: DisputeReason; details: string; evidence?: unknown }
  | { type: "seller_respond"; response: string; evidence?: unknown }
  | { type: "resolve_refund"; rationale: string; confirm: boolean }
  | { type: "resolve_release"; rationale: string; confirm: boolean }
  | { type: "review_report"; note: string };

export type ActResult =
  | { ok: true; status: Status }
  | { ok: false; code: WorkflowError["code"]; message: string };

/** Failure that should still COMMIT (e.g. counting a wrong OTP attempt). */
class CommittedFailure {
  constructor(public error: WorkflowError) {}
}

export async function act(transactionId: string, actor: Actor, action: ActionInput): Promise<ActResult> {
  try {
    const outcome = await withTransaction(async (db) => {
      const { rows } = await db.query<TransactionRow>(
        "SELECT * FROM transactions WHERE id = $1 FOR UPDATE",
        [transactionId],
      );
      const tx = rows[0];
      if (!tx) throw new WorkflowError("NOT_FOUND", "Transaction not found.");
      const seller = await loadSeller(db, tx.seller_id);

      // Ownership: roles are enforced by the state machine; identities here.
      if (actor.role === "buyer" && actor.userId !== tx.buyer_id) {
        throw new WorkflowError("FORBIDDEN_ROLE", "This is not your transaction.");
      }
      if (actor.role === "seller" && actor.userId !== seller.user_id) {
        throw new WorkflowError("FORBIDDEN_ROLE", "Only this transaction's seller can do that.");
      }

      const to = nextStatus(tx.status, actor.role, action.type);
      const result = await apply(db, tx, seller, actor, action);
      if (result instanceof CommittedFailure) return result;

      await db.query("UPDATE transactions SET status = $2, updated_at = now() WHERE id = $1", [tx.id, to]);
      if (to !== tx.status) {
        await audit(db, tx.id, actor, "status_changed", { from: tx.status, to });
      }
      return to;
    });
    if (outcome instanceof CommittedFailure) {
      return { ok: false, code: outcome.error.code, message: outcome.error.message };
    }
    return { ok: true, status: outcome };
  } catch (err) {
    if (err instanceof WorkflowError) return { ok: false, code: err.code, message: err.message };
    // Unique constraints on the escrow ledger are the last line of defence against double payouts.
    if ((err as { code?: string }).code === "23505") {
      return { ok: false, code: "INVALID_STATE", message: "This payment action has already been processed." };
    }
    throw err;
  }
}

async function apply(
  db: PoolClient,
  tx: TransactionRow,
  seller: SellerRow,
  actor: Actor,
  action: ActionInput,
): Promise<void | CommittedFailure> {
  const tzs = (n: number) => `TZS ${n.toLocaleString("en-US")}`;

  switch (action.type) {
    case "continue":
      await db.query("UPDATE transactions SET buyer_decision = 'continue' WHERE id = $1", [tx.id]);
      await audit(db, tx.id, actor, "buyer_decision", { decision: "continue_protected" });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `New SalamaPay protected order ${tx.id}: ${tx.product_description} for ${tzs(tx.price)}. Review and accept to proceed.`);
      return;

    case "request_verification":
      await db.query("UPDATE transactions SET buyer_decision = 'verify' WHERE id = $1", [tx.id]);
      await audit(db, tx.id, actor, "buyer_decision", { decision: "request_verification" });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `A buyer asked for extra verification before paying for ${tx.id}. Please share proof via SalamaPay.`);
      return;

    case "provide_verification": {
      const note = text(action.note, "Verification details", 500);
      await audit(db, tx.id, actor, "seller_verification_provided", { note });
      await notify(db, tx.id, "buyer", "SMS (simulated)",
        `${seller.display_name} responded to your verification request for ${tx.id}. Review it before deciding.`);
      return;
    }

    case "cancel": {
      const reason = text(action.reason, "Reason", 300, { optional: true });
      await db.query("UPDATE transactions SET buyer_decision = 'cancel' WHERE id = $1", [tx.id]);
      await audit(db, tx.id, actor, "buyer_decision", { decision: "cancel", reason });
      return;
    }

    case "report": {
      const reason = text(action.reason, "Report reason", 500);
      await db.query("UPDATE transactions SET buyer_decision = 'report' WHERE id = $1", [tx.id]);
      await db.query("INSERT INTO reports (transaction_id, reason) VALUES ($1,$2)", [tx.id, reason]);
      await audit(db, tx.id, actor, "buyer_decision", { decision: "report", reason });
      await notify(db, tx.id, "admin", "Review queue",
        `Buyer reported ${tx.id} (${seller.display_name}). Human review needed. No automatic action was taken.`);
      return;
    }

    case "amend_price": {
      const price = amount(action.price);
      if (price === tx.price) throw new WorkflowError("VALIDATION", "That is already the agreed price.");
      await db.query(
        "UPDATE transactions SET price = $2, accepted_price = NULL, buyer_decision = NULL WHERE id = $1",
        [tx.id, price],
      );
      await audit(db, tx.id, actor, "price_amended", {
        from: tx.price,
        to: price,
        note: "Seller approval and buyer decision reset; trust check re-run.",
      });
      const product = await loadProduct(db, tx.product_id);
      await runAssessment(db, { ...tx, price }, seller, product, null);
      return;
    }

    case "seller_accept":
      await db.query("UPDATE transactions SET accepted_price = price WHERE id = $1", [tx.id]);
      await audit(db, tx.id, actor, "seller_accepted", {
        price: tx.price,
        inspectionDays: tx.inspection_days,
      });
      await notify(db, tx.id, "buyer", "SMS (simulated)",
        `${seller.display_name} accepted order ${tx.id}. Secure your payment in SalamaPay escrow.`);
      return;

    case "seller_reject": {
      const reason = text(action.reason, "Reason", 300, { optional: true });
      await audit(db, tx.id, actor, "seller_rejected", { reason });
      await notify(db, tx.id, "buyer", "SMS (simulated)",
        `${seller.display_name} declined order ${tx.id}. No money has moved.`);
      return;
    }

    case "pay": {
      if (tx.accepted_price !== tx.price) {
        throw new WorkflowError("INVALID_STATE", "The price changed since the seller accepted. Seller must re-accept.");
      }
      await db.query(
        "INSERT INTO escrow_ledger (transaction_id, entry_type, amount) VALUES ($1,'HOLD',$2)",
        [tx.id, tx.price],
      );
      await audit(db, tx.id, actor, "escrow_funded", { amount: tx.price, simulated: true });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `Payment for ${tx.id} (${tzs(tx.price)}) is secured in escrow. It is safe to ship. You are paid after the buyer confirms delivery.`);
      return;
    }

    case "ship": {
      const courier = text(action.courier, "Courier", 60);
      const trackingRef = text(action.trackingRef, "Tracking reference", 40);
      const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await db.query(
        `INSERT INTO deliveries (transaction_id, courier, tracking_ref, status, otp_hash, otp_expires_at)
         VALUES ($1,$2,$3,'in_transit',$4, now() + make_interval(hours => $5))`,
        [tx.id, courier, trackingRef, otpHash(tx.id, otp), OTP_TTL_HOURS],
      );
      await audit(db, tx.id, actor, "shipped", { courier, trackingRef });
      // The code travels with the parcel (simulated courier slip). Only its hash is stored in SalamaPay.
      await notify(db, tx.id, "courier", "Courier handover slip (simulated)",
        `SalamaPay delivery code for ${tx.id}: ${otp}. Give to the buyer only when they have the parcel in hand.`);
      await notify(db, tx.id, "buyer", "SMS (simulated)",
        `Your order ${tx.id} was shipped with ${courier} (ref ${trackingRef}). Enter the code on the parcel slip once you receive it.`);
      return;
    }

    case "confirm_delivery": {
      const { rows } = await db.query(
        "SELECT * FROM deliveries WHERE transaction_id = $1 FOR UPDATE",
        [tx.id],
      );
      const d = rows[0];
      if (!d) throw new WorkflowError("INVALID_STATE", "No shipment found.");
      if (d.otp_used_at) throw new WorkflowError("OTP_INVALID", "This code has already been used.");
      if (d.otp_failed_attempts >= OTP_MAX_ATTEMPTS) {
        throw new WorkflowError("OTP_LOCKED", "Too many wrong codes. Contact support or open a dispute.");
      }
      if (new Date(d.otp_expires_at) < new Date()) {
        throw new WorkflowError("OTP_INVALID", "This code has expired. Contact support.");
      }
      const code = String(action.otp ?? "").replace(/\D/g, "");
      const expected = Buffer.from(d.otp_hash, "hex");
      const given = Buffer.from(otpHash(tx.id, code), "hex");
      if (code.length !== 6 || !timingSafeEqual(expected, given)) {
        const attempts = d.otp_failed_attempts + 1;
        await db.query("UPDATE deliveries SET otp_failed_attempts = $2 WHERE transaction_id = $1", [tx.id, attempts]);
        await audit(db, tx.id, actor, "delivery_otp_failed", { attempt: attempts, max: OTP_MAX_ATTEMPTS });
        return new CommittedFailure(
          new WorkflowError(
            attempts >= OTP_MAX_ATTEMPTS ? "OTP_LOCKED" : "OTP_INVALID",
            attempts >= OTP_MAX_ATTEMPTS
              ? "Too many wrong codes. Delivery confirmation is locked."
              : `Incorrect code. ${OTP_MAX_ATTEMPTS - attempts} attempt(s) left.`,
          ),
        );
      }
      await db.query(
        "UPDATE deliveries SET status = 'delivered', otp_used_at = now(), delivered_at = now() WHERE transaction_id = $1",
        [tx.id],
      );
      await audit(db, tx.id, actor, "delivery_confirmed", { method: "one-time code" });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `Delivery of ${tx.id} confirmed. The buyer has ${tx.inspection_days} day(s) to inspect before release.`);
      return;
    }

    case "release":
      await db.query(
        "INSERT INTO escrow_ledger (transaction_id, entry_type, amount) VALUES ($1,'RELEASE',$2)",
        [tx.id, tx.price],
      );
      await audit(db, tx.id, actor, "payment_released", { amount: tx.price, to: seller.display_name, simulated: true });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `${tzs(tx.price)} for ${tx.id} has been released to you. Thank you for trading safely.`);
      return;

    case "open_dispute": {
      if (!(action.reason in DISPUTE_REASONS)) throw new WorkflowError("VALIDATION", "Choose what went wrong.");
      const details = text(action.details, "Details", 1000);
      const evidence = validateEvidence(action.evidence, "buyer");
      await db.query(
        "INSERT INTO disputes (transaction_id, reason, details, evidence) VALUES ($1,$2,$3,$4)",
        [tx.id, action.reason, details, JSON.stringify(evidence)],
      );
      await refreshDisputeSummary(db, tx);
      await audit(db, tx.id, actor, "dispute_opened", {
        reason: DISPUTE_REASONS[action.reason],
        evidenceFiles: evidence.length,
        note: "Funds remain locked in escrow until a human reviewer decides.",
      });
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        `The buyer reported a problem with ${tx.id}. Funds stay in escrow. Please respond with your side.`);
      await notify(db, tx.id, "admin", "Review queue", `Dispute opened on ${tx.id}. Awaiting human review.`);
      return;
    }

    case "seller_respond": {
      const response = text(action.response, "Response", 1000);
      const evidence = validateEvidence(action.evidence, "seller");
      await db.query(
        `UPDATE disputes SET seller_response = $2, seller_responded_at = now(),
                evidence = evidence || $3::jsonb WHERE transaction_id = $1`,
        [tx.id, response, JSON.stringify(evidence)],
      );
      await refreshDisputeSummary(db, tx);
      await audit(db, tx.id, actor, "dispute_seller_responded", { evidenceFiles: evidence.length });
      return;
    }

    case "resolve_refund":
    case "resolve_release": {
      if (!action.confirm) {
        throw new WorkflowError("VALIDATION", "Confirm that you reviewed both parties' evidence.");
      }
      const rationale = text(action.rationale, "Decision rationale", 1000);
      if (rationale.length < 15) {
        throw new WorkflowError("VALIDATION", "Explain the decision in at least 15 characters.");
      }
      const refund = action.type === "resolve_refund";
      await db.query(
        "INSERT INTO escrow_ledger (transaction_id, entry_type, amount) VALUES ($1,$2,$3)",
        [tx.id, refund ? "REFUND" : "RELEASE", tx.price],
      );
      await db.query(
        `UPDATE disputes SET human_decision = $2, decision_rationale = $3, decided_by = $4, decided_at = now()
         WHERE transaction_id = $1`,
        [tx.id, refund ? "refund_buyer" : "release_to_seller", rationale, actor.userId],
      );
      await audit(db, tx.id, actor, "dispute_resolved_by_human", {
        decision: refund ? "refund_buyer" : "release_to_seller",
        rationale,
        amount: tx.price,
      });
      await notify(db, tx.id, "buyer", "SMS (simulated)",
        refund
          ? `Dispute ${tx.id} resolved: ${tzs(tx.price)} refunded to you.`
          : `Dispute ${tx.id} resolved: payment released to the seller.`);
      await notify(db, tx.id, "seller", "WhatsApp (simulated)",
        refund
          ? `Dispute ${tx.id} resolved: buyer refunded.`
          : `Dispute ${tx.id} resolved: ${tzs(tx.price)} released to you.`);
      return;
    }

    case "review_report": {
      const note = text(action.note, "Review note", 500);
      await db.query(
        `UPDATE reports SET review_note = $2, reviewed_by = $3, reviewed_at = now()
         WHERE transaction_id = $1 AND reviewed_at IS NULL`,
        [tx.id, note, actor.userId],
      );
      await audit(db, tx.id, actor, "report_reviewed", { note });
      return;
    }
  }
}

async function refreshDisputeSummary(db: Db, tx: TransactionRow) {
  const { rows } = await db.query(
    `SELECT d.*, del.status AS delivery_status, del.otp_used_at, del.delivered_at,
            (SELECT level FROM risk_assessments r WHERE r.transaction_id = d.transaction_id
               ORDER BY r.id DESC LIMIT 1) AS risk_level
       FROM disputes d LEFT JOIN deliveries del ON del.transaction_id = d.transaction_id
      WHERE d.transaction_id = $1`,
    [tx.id],
  );
  const d = rows[0];
  const summary = summarizeDispute({
    reason: d.reason,
    details: d.details,
    sellerResponse: d.seller_response,
    deliveryStatus: d.delivery_status,
    otpVerified: Boolean(d.otp_used_at),
    deliveredAt: d.delivered_at ? new Date(d.delivered_at).toISOString() : null,
    openedAt: new Date(d.opened_at).toISOString(),
    inspectionDays: tx.inspection_days,
    evidence: d.evidence,
    preTradeRiskLevel: d.risk_level,
    amount: tx.price,
  });
  await db.query("UPDATE disputes SET ai_summary = $2 WHERE transaction_id = $1", [
    tx.id,
    JSON.stringify(summary),
  ]);
}

// ---------------------------------------------------------------- queries

export async function getTransactionView(id: string) {
  const db = getPool();
  const { rows } = await db.query<TransactionRow>("SELECT * FROM transactions WHERE id = $1", [id]);
  const tx = rows[0];
  if (!tx) return null;
  const [seller, product, assessments, delivery, dispute, ledger, auditRows, notes, reports, buyer] =
    await Promise.all([
      loadSeller(db, tx.seller_id),
      loadProduct(db, tx.product_id),
      db.query("SELECT * FROM risk_assessments WHERE transaction_id = $1 ORDER BY id DESC", [id]),
      db.query(
        `SELECT transaction_id, courier, tracking_ref, status, otp_expires_at, otp_failed_attempts,
                otp_used_at, shipped_at, delivered_at FROM deliveries WHERE transaction_id = $1`,
        [id],
      ),
      db.query("SELECT * FROM disputes WHERE transaction_id = $1", [id]),
      db.query("SELECT * FROM escrow_ledger WHERE transaction_id = $1 ORDER BY id", [id]),
      db.query("SELECT * FROM audit_events WHERE transaction_id = $1 ORDER BY id", [id]),
      db.query("SELECT * FROM notifications WHERE transaction_id = $1 ORDER BY id DESC", [id]),
      db.query("SELECT * FROM reports WHERE transaction_id = $1 ORDER BY id", [id]),
      db.query("SELECT id, name FROM users WHERE id = $1", [tx.buyer_id]),
    ]);
  return {
    tx,
    seller,
    product,
    buyer: buyer.rows[0] as { id: string; name: string },
    assessment: assessments.rows[0]
      ? { ...assessments.rows[0], result: assessments.rows[0].result as RiskResult }
      : null,
    assessmentHistory: assessments.rows.map((a) => ({
      id: a.id as number,
      score: a.score as number,
      level: a.level as string,
      created_at: a.created_at as Date,
    })),
    delivery: delivery.rows[0] ?? null,
    dispute: dispute.rows[0] ?? null,
    ledger: ledger.rows as { entry_type: string; amount: number; created_at: Date }[],
    audit: auditRows.rows as {
      id: number;
      actor: string;
      actor_role: string;
      action: string;
      detail: Record<string, unknown>;
      created_at: Date;
    }[],
    notifications: notes.rows as {
      id: number;
      recipient: string;
      channel: string;
      body: string;
      created_at: Date;
    }[],
    reports: reports.rows,
  };
}

export type TransactionView = NonNullable<Awaited<ReturnType<typeof getTransactionView>>>;

export interface TransactionListItem {
  id: string;
  product_description: string;
  price: number;
  status: Status;
  seller_name: string;
  seller_id: string;
  level: string | null;
  score: number | null;
  updated_at: Date;
}

export async function listTransactions(filter: { buyerId?: string; statuses?: Status[] } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.buyerId) {
    params.push(filter.buyerId);
    where.push(`t.buyer_id = $${params.length}`);
  }
  if (filter.statuses?.length) {
    params.push(filter.statuses);
    where.push(`t.status = ANY($${params.length})`);
  }
  const { rows } = await getPool().query<TransactionListItem>(
    `SELECT t.id, t.product_description, t.price, t.status, t.updated_at, t.seller_id,
            s.display_name AS seller_name, r.level, r.score
       FROM transactions t
       JOIN seller_profiles s ON s.id = t.seller_id
       LEFT JOIN LATERAL (SELECT level, score FROM risk_assessments
                           WHERE transaction_id = t.id ORDER BY id DESC LIMIT 1) r ON true
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.updated_at DESC
      LIMIT 100`,
    params,
  );
  return rows;
}

export async function listSellers() {
  const { rows } = await getPool().query<SellerRow>("SELECT * FROM seller_profiles ORDER BY id");
  return rows;
}

export async function listProducts() {
  const { rows } = await getPool().query<ProductRow>("SELECT * FROM products ORDER BY expected_min DESC");
  return rows;
}
