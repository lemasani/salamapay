import { RISK_CONFIG } from "./config";

/**
 * Lightweight, explainable language analysis for a pasted payment message.
 * Pattern-based (English + Swahili) so every flag can be traced to the exact
 * words that triggered it. Secrets (PINs / OTPs / passwords) are redacted
 * BEFORE anything is analysed or stored.
 */

export type MessageCategory =
  | "urgency"
  | "off_platform"
  | "credential_request"
  | "different_recipient"
  | "unverifiable_claim";

export interface MessageFinding {
  category: MessageCategory;
  label: string;
  whyItMatters: string;
  matches: string[];
  points: number;
}

export interface MessageAnalysis {
  redactedText: string;
  redactions: number;
  findings: MessageFinding[];
  totalPoints: number; // after cap
}

const PATTERNS: Record<
  MessageCategory,
  { label: string; whyItMatters: string; points: number; regexes: RegExp[] }
> = {
  urgency: {
    label: "Pressure to pay immediately",
    whyItMatters:
      "Scammers create urgency so you don't have time to check the seller.",
    points: RISK_CONFIG.message.urgencyPoints,
    regexes: [
      /\b(urgent(ly)?|immediately|right now|asap|hurry|today only|last chance|within \d+ ?(min|minutes|hours?))\b/gi,
      /\b(haraka|sasa hivi|leo tu|fanya haraka|muda mfupi)\b/gi,
    ],
  },
  off_platform: {
    label: "Asks you to avoid a protected payment",
    whyItMatters:
      "Genuine sellers rarely refuse buyer protection. Moving 'outside' removes your safety net.",
    points: RISK_CONFIG.message.offPlatformPoints,
    regexes: [
      /\b(don'?t|do not|no need to) (use|go through) (salamapay|escrow|the app|the platform)\b/gi,
      /\b(pay|send)( the money)? directly\b/gi,
      /\b(no escrow|outside the (app|platform)|bypass)\b/gi,
      /\b(tuma moja kwa moja|bila escrow|usitumie)\b/gi,
    ],
  },
  credential_request: {
    label: "Asks for a PIN, OTP or password",
    whyItMatters:
      "No genuine seller, bank or mobile-money agent needs your PIN, OTP or password.",
    points: RISK_CONFIG.message.credentialRequestPoints,
    regexes: [
      /\b(pin|otp|one[- ]time (code|password)|password|passcode|verification code|security code)\b/gi,
      /\b(namba ya siri|nambari ya siri|neno la siri|nenosiri)\b/gi,
    ],
  },
  different_recipient: {
    label: "Payment to a different person or number",
    whyItMatters:
      "Paying someone other than the seller makes the money hard to trace or recover.",
    points: RISK_CONFIG.message.differentRecipientPoints,
    regexes: [
      /\b(send|pay|transfer)( it| the money)? to (my|our) (brother|sister|cousin|friend|agent|manager|wife|husband|partner)\b/gi,
      /\b(different|another|other|new) (number|account|name|line)\b/gi,
      /\b(tuma kwa (namba|jina) hii|kwa kaka yangu|kwa dada yangu|namba nyingine|jina tofauti)\b/gi,
    ],
  },
  unverifiable_claim: {
    label: "Claims that can't be verified",
    whyItMatters:
      "Guarantees and 'too good to be true' claims are common in fake listings.",
    points: RISK_CONFIG.message.unverifiableClaimPoints,
    regexes: [
      /\b(100% (original|genuine|guaranteed)|guaranteed|brand new sealed|only \d+ left|last (one|piece)|customs (clearance|release) fee|promo(tion)? price)\b/gi,
      /\b(uhakika 100%|mpya kabisa|imebaki moja)\b/gi,
    ],
  },
};

/** Masks digit sequences that follow a secret keyword, e.g. "my PIN is 4412". */
export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  const secretThenDigits =
    /\b(pin|otp|code|password|passcode|namba ya siri|nambari ya siri|nenosiri)\b([^0-9\n]{0,20})(\d[\d\s-]{2,10}\d)/gi;
  const out = text.replace(secretThenDigits, (_m, kw: string, gap: string) => {
    count += 1;
    return `${kw}${gap}[REDACTED]`;
  });
  return { text: out, count };
}

export function analyzeMessage(raw: string | null | undefined): MessageAnalysis {
  const input = (raw ?? "").slice(0, 2000);
  const { text, count } = redactSecrets(input);
  const findings: MessageFinding[] = [];

  for (const [category, p] of Object.entries(PATTERNS) as [
    MessageCategory,
    (typeof PATTERNS)[MessageCategory],
  ][]) {
    const matches = new Set<string>();
    for (const re of p.regexes) {
      for (const m of text.matchAll(re)) matches.add(m[0].toLowerCase());
    }
    if (matches.size > 0) {
      findings.push({
        category,
        label: p.label,
        whyItMatters: p.whyItMatters,
        matches: [...matches],
        points: p.points,
      });
    }
  }

  const sum = findings.reduce((s, f) => s + f.points, 0);
  return {
    redactedText: text,
    redactions: count,
    findings,
    totalPoints: Math.min(sum, RISK_CONFIG.message.cap),
  };
}
