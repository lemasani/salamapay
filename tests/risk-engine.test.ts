import { describe, expect, it } from "vitest";
import { assessRisk, type RiskInput } from "@/lib/risk/engine";
import { ALLOWED_INPUT_SIGNALS } from "@/lib/risk/config";
import { analyzeMessage, redactSecrets } from "@/lib/risk/message";
import { paymentNameMatches } from "@/lib/risk/name-match";
import { PRODUCTS, SELLER_PROFILES } from "@/lib/data/seed-data";

const phone = PRODUCTS[0];

function inputFor(profileId: string, withMessage = false): RiskInput {
  const p = SELLER_PROFILES.find((s) => s.id === profileId)!;
  return {
    accountAgeDays: p.accountAgeDays,
    completedTransactions: p.completedTransactions,
    unresolvedDisputes: p.unresolvedDisputes,
    verificationStatus: p.verificationStatus,
    recentDeviceChange: p.recentDeviceChange,
    paymentNameMatches: paymentNameMatches(p.registeredPaymentName, p.demoPaymentName),
    agreedPrice: Math.round(phone.expectedMin * (1 - p.demoDiscount)),
    expectedMin: phone.expectedMin,
    expectedMax: phone.expectedMax,
    messageFindings: withMessage ? analyzeMessage(p.demoMessage).findings : [],
  };
}

describe("synthetic demo profiles", () => {
  it("Profile A scores low (10-20)", () => {
    const r = assessRisk(inputFor("seller-a"));
    expect(r.score).toBeGreaterThanOrEqual(10);
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.level).toBe("low");
    expect(r.recommendedAction.code).toBe("continue_protected");
  });

  it("Profile B scores medium (40-55)", () => {
    const r = assessRisk(inputFor("seller-b"));
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.score).toBeLessThanOrEqual(55);
    expect(r.level).toBe("medium");
    expect(r.recommendedAction.code).toBe("request_verification");
  });

  it("Profile C scores high (80-95) without a message", () => {
    const r = assessRisk(inputFor("seller-c"));
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.score).toBeLessThanOrEqual(95);
    expect(r.level).toBe("high");
  });

  it("each profile's demo message keeps it in its intended category", () => {
    for (const p of SELLER_PROFILES) {
      expect(assessRisk(inputFor(p.id, true)).level).toBe(p.expectedLevel);
    }
  });
});

describe("explanations match inputs", () => {
  it("Profile C names the signals from the demo script", () => {
    const ids = assessRisk(inputFor("seller-c")).reasons.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "account_very_new",
        "disputes_many",
        "payment_name_mismatch",
        "price_far_below",
        "device_change",
        "identity_unverified",
      ]),
    );
  });

  it("score equals the sum of the displayed reasons (clamped)", () => {
    for (const p of SELLER_PROFILES) {
      const r = assessRisk(inputFor(p.id, true));
      const sum = r.reasons.reduce((s, x) => s + x.points, 0);
      expect(r.rawScore).toBe(sum);
      expect(r.score).toBe(Math.max(0, Math.min(100, sum)));
    }
  });

  it("does not flag price when it is inside the expected range", () => {
    const r = assessRisk({ ...inputFor("seller-a"), agreedPrice: 950_000 });
    expect(r.reasons.some((x) => x.id.startsWith("price"))).toBe(false);
  });

  it("clamps to 0-100", () => {
    const r = assessRisk({ ...inputFor("seller-c", true), agreedPrice: 1 });
    expect(r.score).toBe(100);
  });
});

describe("responsible AI", () => {
  it("only reads allow-listed, non-protected signals", () => {
    const keys = Object.keys(inputFor("seller-a"));
    for (const k of keys) expect(ALLOWED_INPUT_SIGNALS).toContain(k);
    for (const banned of ["gender", "tribe", "religion", "location", "income", "deviceType"]) {
      expect(ALLOWED_INPUT_SIGNALS as readonly string[]).not.toContain(banned);
    }
  });

  it("always states it is not proof of fraud", () => {
    const r = assessRisk(inputFor("seller-c"));
    expect(r.limitations.join(" ")).toMatch(/not proof/i);
  });

  it("high risk recommends verification, not punishment", () => {
    const r = assessRisk(inputFor("seller-c"));
    expect(r.recommendedAction.title).toMatch(/verify/i);
    expect(r.recommendedAction.detail).not.toMatch(/\b(ban|block|fraudster|criminal)\b/i);
  });

  it("reports low confidence when there is little history", () => {
    expect(assessRisk(inputFor("seller-c")).confidence.level).toBe("low");
    expect(assessRisk(inputFor("seller-a")).confidence.level).toBe("high");
  });
});

describe("message analysis", () => {
  it("detects scam patterns in English and Swahili", () => {
    const cats = analyzeMessage(SELLER_PROFILES[2].demoMessage).findings.map((f) => f.category);
    expect(cats).toEqual(
      expect.arrayContaining(["urgency", "off_platform", "different_recipient", "unverifiable_claim"]),
    );
  });

  it("flags requests for a PIN and redacts the digits", () => {
    const a = analyzeMessage("Please send me your PIN: 4412 so I can confirm");
    expect(a.findings.map((f) => f.category)).toContain("credential_request");
    expect(a.redactedText).not.toContain("4412");
    expect(a.redactions).toBe(1);
  });

  it("does not redact prices", () => {
    expect(redactSecrets("Price is 855000 TZS").text).toContain("855000");
  });

  it("caps the message contribution", () => {
    const a = analyzeMessage(
      "URGENT send OTP 1234 to my brother, pay directly, 100% original guaranteed",
    );
    expect(a.totalPoints).toBe(20);
  });
});

describe("payment name matching", () => {
  it.each([
    ["Amani Electronics Ltd", "Amani Electronics", true],
    ["Zuri Mobile Hub", "ZURI MOBILE HUB", true],
    ["Dar Phone Deals", "Juma Said Mwinyi", false],
  ])("%s vs %s -> %s", (a, b, expected) => {
    expect(paymentNameMatches(a, b)).toBe(expected);
  });
});
