import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db";
import { applySchema } from "@/lib/data/schema";
import { seedBase } from "@/lib/data/seed";
import { act, createPurchase, getTransactionView, type Actor } from "@/lib/services/transactions";
import { availableActions, nextStatus, WorkflowError } from "@/lib/workflow/machine";

const buyer: Actor = { role: "buyer", userId: "buyer-neema", name: "Neema M." };
const otherBuyer: Actor = { role: "buyer", userId: "buyer-baraka", name: "Baraka J." };
const sellerA: Actor = { role: "seller", userId: "seller-a-user", name: "Amani Electronics" };
const sellerC: Actor = { role: "seller", userId: "seller-c-user", name: "Dar Phone Deals" };
const admin: Actor = { role: "admin", userId: "admin-asha", name: "Asha K." };

const pool = getPool();

beforeEach(async () => {
  await applySchema(pool);
  await seedBase(pool);
});
afterAll(async () => {
  await pool.end();
});

async function newPurchase(overrides: Partial<Parameters<typeof createPurchase>[0]> = {}) {
  const { id } = await createPurchase(
    {
      sellerId: "seller-a",
      productId: "samsung-a55",
      productDescription: "Samsung Galaxy A55",
      price: 855_000,
      paymentAccount: "Lipa Namba 5528113",
      paymentAccountName: "Amani Electronics Ltd",
      sourceChannel: "Instagram",
      inspectionDays: 3,
      consent: true,
      ...overrides,
    },
    buyer,
  );
  return id;
}

async function otpFor(id: string) {
  const { rows } = await pool.query(
    "SELECT body FROM notifications WHERE transaction_id = $1 AND recipient = 'courier' ORDER BY id DESC LIMIT 1",
    [id],
  );
  return /(\d{6})/.exec(rows[0].body)![1];
}

async function ok(p: ReturnType<typeof act>) {
  const r = await p;
  if (!r.ok) throw new Error(r.message);
  return r;
}

async function toShipped(id: string) {
  await ok(act(id, buyer, { type: "continue" }));
  await ok(act(id, sellerA, { type: "seller_accept" }));
  await ok(act(id, buyer, { type: "pay" }));
  await ok(act(id, sellerA, { type: "ship", courier: "Kilimanjaro Couriers", trackingRef: "KC-1" }));
}

async function toDelivered(id: string) {
  await toShipped(id);
  await ok(act(id, buyer, { type: "confirm_delivery", otp: await otpFor(id) }));
}

async function ledger(id: string) {
  const { rows } = await pool.query(
    "SELECT entry_type FROM escrow_ledger WHERE transaction_id = $1 ORDER BY id",
    [id],
  );
  return rows.map((r) => r.entry_type);
}

describe("state machine rules (pure)", () => {
  it("rejects actions by the wrong role", () => {
    expect(() => nextStatus("FUNDED", "buyer", "ship")).toThrow(WorkflowError);
    expect(() => nextStatus("DISPUTED", "seller", "resolve_release")).toThrow(/admin/);
  });
  it("offers the buyer all four choices after the trust check", () => {
    expect(availableActions("ASSESSED", "buyer")).toEqual(
      expect.arrayContaining(["continue", "request_verification", "cancel", "report"]),
    );
  });
  it("AI/system has no path to move money: only humans' roles appear in money-moving rules", () => {
    for (const a of ["pay", "release", "resolve_refund", "resolve_release"] as const) {
      expect(() => nextStatus("DELIVERED", "system" as never, a)).toThrow(WorkflowError);
    }
  });
});

describe("full protected journey", () => {
  it("runs purchase -> assessment -> escrow -> delivery -> release, with a complete audit trail", async () => {
    const id = await newPurchase();
    let view = await getTransactionView(id);
    expect(view!.assessment!.level).toBe("low");

    await toDelivered(id);
    await ok(act(id, buyer, { type: "release" }));

    view = await getTransactionView(id);
    expect(view!.tx.status).toBe("RELEASED");
    expect(await ledger(id)).toEqual(["HOLD", "RELEASE"]);
    const actions = view!.audit.map((a) => a.action);
    for (const a of [
      "purchase_created",
      "risk_assessed",
      "buyer_decision",
      "seller_accepted",
      "escrow_funded",
      "shipped",
      "delivery_confirmed",
      "payment_released",
    ]) {
      expect(actions).toContain(a);
    }
  });

  it("lets the buyer pause, report or request verification instead of paying", async () => {
    const a = await newPurchase();
    expect((await act(a, buyer, { type: "cancel" })).ok).toBe(true);
    const b = await newPurchase();
    await ok(act(b, buyer, { type: "report", reason: "Asked to pay another name" }));
    expect((await getTransactionView(b))!.tx.status).toBe("REPORTED");
    const c = await newPurchase();
    await ok(act(c, buyer, { type: "request_verification" }));
    expect((await getTransactionView(c))!.tx.status).toBe("VERIFICATION_REQUESTED");
    expect(await ledger(a)).toEqual([]);
  });

  it("seller can reject the details", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    await ok(act(id, sellerA, { type: "seller_reject", reason: "Out of stock" }));
    expect((await getTransactionView(id))!.tx.status).toBe("SELLER_REJECTED");
  });

  it("high-risk seller gets a high score but is not blocked: the buyer still decides", async () => {
    const id = await newPurchase({
      sellerId: "seller-c",
      price: 315_000,
      paymentAccountName: "Juma Said Mwinyi",
    });
    const view = await getTransactionView(id);
    expect(view!.assessment!.level).toBe("high");
    expect((await act(id, buyer, { type: "continue" })).ok).toBe(true);
  });
});

describe("functional guards", () => {
  it("payment cannot be secured before seller acceptance", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    const r = await act(id, buyer, { type: "pay" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(await ledger(id)).toEqual([]);
  });

  it("seller cannot ship before payment", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    await ok(act(id, sellerA, { type: "seller_accept" }));
    const r = await act(id, sellerA, { type: "ship", courier: "X", trackingRef: "Y" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });

  it("incorrect OTP is rejected, attempt is recorded, and too many attempts lock it", async () => {
    const id = await newPurchase();
    await toShipped(id);
    const r = await act(id, buyer, { type: "confirm_delivery", otp: "000000" === (await otpFor(id)) ? "111111" : "000000" });
    expect(r).toMatchObject({ ok: false, code: "OTP_INVALID" });
    const view = await getTransactionView(id);
    expect(view!.tx.status).toBe("SHIPPED");
    expect(view!.delivery!.otp_failed_attempts).toBe(1);
    expect(view!.audit.map((a) => a.action)).toContain("delivery_otp_failed");

    for (let i = 0; i < 4; i++) await act(id, buyer, { type: "confirm_delivery", otp: "999999x" });
    const locked = await act(id, buyer, { type: "confirm_delivery", otp: await otpFor(id) });
    expect(locked).toMatchObject({ ok: false, code: "OTP_LOCKED" });
  });

  it("OTP cannot be reused and is never stored in plain text", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    const otp = await otpFor(id);
    const r = await act(id, buyer, { type: "confirm_delivery", otp });
    expect(r.ok).toBe(false);
    const { rows } = await pool.query("SELECT otp_hash FROM deliveries WHERE transaction_id = $1", [id]);
    expect(rows[0].otp_hash).not.toContain(otp);
    expect(rows[0].otp_hash).toHaveLength(64);
  });

  it("payment cannot be released before delivery", async () => {
    const id = await newPurchase();
    await toShipped(id);
    expect(await act(id, buyer, { type: "release" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
  });

  it("payment cannot be released while a dispute is open", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    await ok(act(id, buyer, { type: "open_dispute", reason: "damaged", details: "Screen cracked on arrival." }));
    expect(await act(id, buyer, { type: "release" })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(await ledger(id)).toEqual(["HOLD"]);
  });

  it("administrator resolves a dispute with a human decision; AI summary never decides", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    await ok(
      act(id, buyer, {
        type: "open_dispute",
        reason: "wrong_item",
        details: "Got a different colour and storage size.",
        evidence: [{ name: "photo.jpg", type: "image/jpeg", sizeKb: 800 }],
      }),
    );
    await ok(act(id, sellerA, { type: "seller_respond", response: "We will swap it." }));
    let view = await getTransactionView(id);
    expect(view!.dispute.ai_summary.disclaimer).toMatch(/does not decide/i);
    expect(view!.dispute.ai_summary).not.toHaveProperty("decision");
    expect(view!.dispute.human_decision).toBeNull();

    expect(
      await act(id, admin, { type: "resolve_refund", rationale: "too short", confirm: true }),
    ).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(
      await act(id, admin, { type: "resolve_refund", rationale: "Seller agreed item was wrong.", confirm: false }),
    ).toMatchObject({ ok: false });

    await ok(act(id, admin, { type: "resolve_refund", rationale: "Seller agreed item was wrong.", confirm: true }));
    view = await getTransactionView(id);
    expect(view!.tx.status).toBe("RESOLVED_REFUNDED");
    expect(view!.dispute.human_decision).toBe("refund_buyer");
    expect(view!.dispute.decided_by).toBe("admin-asha");
    expect(await ledger(id)).toEqual(["HOLD", "REFUND"]);
  });

  it("rejects unsafe evidence uploads", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    const r = await act(id, buyer, {
      type: "open_dispute",
      reason: "damaged",
      details: "Broken",
      evidence: [{ name: "run.exe", type: "application/x-msdownload", sizeKb: 10 }],
    });
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("security", () => {
  it("buyer cannot perform seller actions", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    expect(await act(id, buyer, { type: "seller_accept" })).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("seller cannot perform administrator actions", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    await ok(act(id, buyer, { type: "open_dispute", reason: "damaged", details: "Broken screen" }));
    expect(
      await act(id, sellerA, { type: "resolve_release", rationale: "I say release it to me", confirm: true }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("a different seller or buyer cannot act on someone else's transaction", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    expect(await act(id, sellerC, { type: "seller_accept" })).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
    expect(await act(id, otherBuyer, { type: "cancel" })).toMatchObject({ ok: false, code: "FORBIDDEN_ROLE" });
  });

  it("changing the amount after acceptance restarts approval and re-runs the trust check", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    await ok(act(id, sellerA, { type: "seller_accept" }));
    await ok(act(id, buyer, { type: "amend_price", price: 300_000 }));
    const view = await getTransactionView(id);
    expect(view!.tx.status).toBe("ASSESSED");
    expect(view!.tx.accepted_price).toBeNull();
    expect(view!.assessmentHistory).toHaveLength(2);
    expect(view!.assessment!.score).toBeGreaterThan(view!.assessmentHistory[1].score);
    expect(await act(id, buyer, { type: "pay" })).toMatchObject({ ok: false });
  });

  it("amount cannot be changed once money is in escrow", async () => {
    const id = await newPurchase();
    await toShipped(id);
    expect(await act(id, buyer, { type: "amend_price", price: 100_000 })).toMatchObject({
      ok: false,
      code: "INVALID_STATE",
    });
  });

  it("repeated or concurrent release does not pay twice", async () => {
    const id = await newPurchase();
    await toDelivered(id);
    const results = await Promise.all([
      act(id, buyer, { type: "release" }),
      act(id, buyer, { type: "release" }),
      act(id, buyer, { type: "release" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ledger(id)).toEqual(["HOLD", "RELEASE"]);
  });

  it("repeated payment does not charge twice", async () => {
    const id = await newPurchase();
    await ok(act(id, buyer, { type: "continue" }));
    await ok(act(id, sellerA, { type: "seller_accept" }));
    const results = await Promise.all([act(id, buyer, { type: "pay" }), act(id, buyer, { type: "pay" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ledger(id)).toEqual(["HOLD"]);
  });

  it("the raw pasted message is not stored, and secrets are redacted", async () => {
    const id = await newPurchase({ message: "Urgent! Send me your PIN 4412 now" });
    const { rows } = await pool.query("SELECT input_signals, result FROM risk_assessments WHERE transaction_id = $1", [id]);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain("4412");
    expect(stored).not.toContain("Send me your PIN");
    expect(rows[0].input_signals.messageRedactions).toBe(1);
  });

  it("only a buyer who consents can start a trust check", async () => {
    await expect(newPurchase({ consent: false })).rejects.toThrow(/confirm/i);
    await expect(createPurchase({} as never, sellerA)).rejects.toThrow(/buyer/i);
  });
});
