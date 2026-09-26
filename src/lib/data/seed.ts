import type { Pool } from "pg";
import { applySchema } from "./schema";
import { DEMO_USERS, PRODUCTS, SELLER_PROFILES } from "./seed-data";
import { act, createPurchase, type Actor, type ActionInput } from "@/lib/services/transactions";

const HISTORY_BUYERS = [
  { id: "buyer-baraka", name: "Baraka J." },
  { id: "buyer-rehema", name: "Rehema S." },
];

export async function seedBase(pool: Pool) {
  for (const u of DEMO_USERS) {
    await pool.query("INSERT INTO users (id, name, role, verification_status) VALUES ($1,$2,$3,$4)", [
      u.id,
      u.name,
      u.role,
      u.verification,
    ]);
  }
  for (const b of HISTORY_BUYERS) {
    await pool.query("INSERT INTO users (id, name, role, verification_status) VALUES ($1,$2,'buyer','verified')", [
      b.id,
      b.name,
    ]);
  }
  for (const s of SELLER_PROFILES) {
    await pool.query(
      `INSERT INTO seller_profiles (id, user_id, profile_label, display_name, handle, phone,
         registered_payment_name, account_age_days, completed_transactions, unresolved_disputes,
         verification_status, recent_device_change)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        s.id,
        s.userId,
        s.profileLabel,
        s.displayName,
        s.handle,
        s.phone,
        s.registeredPaymentName,
        s.accountAgeDays,
        s.completedTransactions,
        s.unresolvedDisputes,
        s.verificationStatus,
        s.recentDeviceChange,
      ],
    );
  }
  for (const p of PRODUCTS) {
    await pool.query("INSERT INTO products (id, name, expected_min, expected_max) VALUES ($1,$2,$3,$4)", [
      p.id,
      p.name,
      p.expectedMin,
      p.expectedMax,
    ]);
  }
}

/** Macro steps expand into several real actions. */
type Step = ActionInput | "deliver" | "ship_flow" | "to_delivered" | "full";

interface Scenario {
  buyer: string;
  seller: string;
  product: string;
  discount: number;
  daysAgo: number;
  useDemoPayee?: boolean;
  steps: Step[];
  disputeHours?: number;
}

const REVIEW = { rationale: "", confirm: true };

const HISTORY: Scenario[] = [
  { buyer: "buyer-baraka", seller: "seller-a", product: "samsung-a55", discount: 0.03, daysAgo: 26, steps: ["ship_flow", "deliver", { type: "release" }] },
  { buyer: "buyer-rehema", seller: "seller-a", product: "jbl-flip6", discount: 0, daysAgo: 24, steps: ["full"] },
  { buyer: "buyer-baraka", seller: "seller-c", product: "samsung-a55", discount: 0.65, daysAgo: 22, useDemoPayee: true, steps: [{ type: "report", reason: "Seller asked me to pay a different person and to skip the app." }] },
  { buyer: "buyer-rehema", seller: "seller-b", product: "kitenge", discount: 0.25, daysAgo: 20, steps: [{ type: "cancel", reason: "Found the same fabric at a shop I know." }] },
  { buyer: "buyer-baraka", seller: "seller-a", product: "iphone-13", discount: 0.05, daysAgo: 18, disputeHours: 20, steps: ["to_delivered", { type: "open_dispute", reason: "wrong_item", details: "Received a 64GB model, but the order said 128GB." }, { type: "seller_respond", response: "Packing error on our side. We can swap it or refund." }, { type: "resolve_refund", ...REVIEW, rationale: "Seller admitted the packing error; buyer refunded and item returned." }] },
  { buyer: "buyer-rehema", seller: "seller-b", product: "samsung-a55", discount: 0.3, daysAgo: 15, steps: [{ type: "request_verification" }, { type: "provide_verification", note: "Shared business registration and a live video of the phone." }, "full"] },
  { buyer: "buyer-baraka", seller: "seller-c", product: "iphone-13", discount: 0.6, daysAgo: 12, useDemoPayee: true, steps: [{ type: "cancel", reason: "Too many warning signs." }] },
  { buyer: "buyer-rehema", seller: "seller-c", product: "hp-laptop", discount: 0.4, daysAgo: 10, disputeHours: 30, steps: ["ship_flow", { type: "open_dispute", reason: "not_received", details: "Tracking shows nothing after 6 days and the seller stopped answering." }, { type: "resolve_refund", ...REVIEW, rationale: "No delivery confirmation and courier has no record of the parcel. Refund buyer." }] },
  { buyer: "buyer-baraka", seller: "seller-b", product: "hp-laptop", discount: 0.2, daysAgo: 8, steps: [{ type: "continue" }, { type: "seller_reject", reason: "Out of stock." }] },
  { buyer: "buyer-rehema", seller: "seller-a", product: "kitenge", discount: 0, daysAgo: 6, steps: ["full"] },
  { buyer: "buyer-baraka", seller: "seller-a", product: "hp-laptop", discount: 0.05, daysAgo: 3, steps: ["ship_flow"] },
  { buyer: "buyer-rehema", seller: "seller-c", product: "jbl-flip6", discount: 0.55, daysAgo: 2, useDemoPayee: true, steps: [{ type: "request_verification" }] },
];

function expand(steps: Step[]): (ActionInput | "deliver")[] {
  const out: (ActionInput | "deliver")[] = [];
  for (const s of steps) {
    if (s === "full") out.push(...expand(["to_delivered", { type: "release" }]));
    else if (s === "to_delivered") out.push(...expand(["ship_flow", "deliver"]));
    else if (s === "ship_flow")
      out.push(
        { type: "continue" },
        { type: "seller_accept" },
        { type: "pay" },
        { type: "ship", courier: "Kilimanjaro Couriers", trackingRef: `KC-${Math.floor(100000 + Math.random() * 899999)}` },
      );
    else out.push(s);
  }
  return out;
}

async function latestOtp(pool: Pool, txId: string): Promise<string> {
  const { rows } = await pool.query(
    "SELECT body FROM notifications WHERE transaction_id = $1 AND recipient = 'courier' ORDER BY id DESC LIMIT 1",
    [txId],
  );
  return /(\d{6})/.exec(rows[0]?.body ?? "")?.[1] ?? "";
}

export async function seedHistory(pool: Pool) {
  const admin: Actor = { role: "admin", userId: "admin-asha", name: "Asha K. (Reviewer)" };
  for (const sc of HISTORY) {
    const seller = SELLER_PROFILES.find((s) => s.id === sc.seller)!;
    const product = PRODUCTS.find((p) => p.id === sc.product)!;
    const buyerName = HISTORY_BUYERS.find((b) => b.id === sc.buyer)!.name;
    const buyer: Actor = { role: "buyer", userId: sc.buyer, name: buyerName };
    const sellerActor: Actor = { role: "seller", userId: seller.userId, name: seller.displayName };
    const { id } = await createPurchase(
      {
        sellerId: seller.id,
        productId: product.id,
        productDescription: product.name,
        price: Math.round((product.expectedMin * (1 - sc.discount)) / 1000) * 1000,
        paymentAccount: seller.demoPaymentAccount,
        paymentAccountName: sc.useDemoPayee ? seller.demoPaymentName : seller.registeredPaymentName,
        sourceChannel: ["Instagram", "WhatsApp", "Facebook"][sc.daysAgo % 3],
        inspectionDays: 3,
        consent: true,
      },
      buyer,
    );
    for (const step of expand(sc.steps)) {
      let res;
      if (step === "deliver") {
        res = await act(id, buyer, { type: "confirm_delivery", otp: await latestOtp(pool, id) });
      } else {
        const who = step.type.startsWith("resolve") || step.type === "review_report"
          ? admin
          : ["seller_accept", "seller_reject", "ship", "seller_respond", "provide_verification"].includes(step.type)
            ? sellerActor
            : buyer;
        res = await act(id, who, step);
      }
      if (!res.ok) throw new Error(`Seed step failed on ${id}: ${res.message}`);
    }
    // Spread history over the past weeks so the impact dashboard looks like real usage.
    const shift = `${sc.daysAgo} days`;
    for (const [table, cols] of [
      ["transactions", ["created_at", "updated_at"]],
      ["risk_assessments", ["created_at"]],
      ["audit_events", ["created_at"]],
      ["notifications", ["created_at"]],
      ["escrow_ledger", ["created_at"]],
      ["reports", ["created_at"]],
      ["deliveries", ["shipped_at", "delivered_at", "otp_used_at"]],
      ["disputes", ["opened_at", "seller_responded_at", "decided_at"]],
    ] as const) {
      const sets = cols.map((c) => `${c} = ${c} - $2::interval`).join(", ");
      const key = table === "transactions" ? "id" : "transaction_id";
      await pool.query(`UPDATE ${table} SET ${sets} WHERE ${key} = $1`, [id, shift]);
    }
    if (sc.disputeHours) {
      await pool.query(
        "UPDATE disputes SET decided_at = opened_at + make_interval(hours => $2) WHERE transaction_id = $1",
        [id, sc.disputeHours],
      );
    }
  }
}

export async function resetDatabase(pool: Pool) {
  await applySchema(pool);
  await seedBase(pool);
  await seedHistory(pool);
}
