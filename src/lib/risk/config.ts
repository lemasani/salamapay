/**
 * Transparent scoring configuration for the SalamaPay Trust Engine.
 *
 * Every weight the engine uses lives here so it can be shown to users,
 * reviewed by judges and tuned by the AI/data lead in one place.
 *
 * Deliberately NOT used as inputs: gender, tribe, religion, age of the person,
 * location, income, device type or any other protected / proxy characteristic.
 */
export const MODEL_VERSION = "trust-rules-v1.0 (hackathon prototype)";

export const RISK_CONFIG = {
  base: 10,
  accountAge: {
    veryNewDays: 30, // < 30 days
    veryNewPoints: 15,
    newDays: 180, // 30–179 days
    newPoints: 10,
  },
  disputes: {
    manyThreshold: 2, // >= 2 unresolved
    manyPoints: 20,
    onePoints: 10,
  },
  price: {
    // percentage below the lower bound of the synthetic expected price range
    severePct: 50, // > 50% below
    severePoints: 15,
    moderatePct: 20, // 20–50% below
    moderatePoints: 10,
    slightPct: 1, // 1–20% below
    slightPoints: 5,
  },
  verification: {
    unverifiedPoints: 10,
    partialPoints: 5,
  },
  paymentNameMismatchPoints: 15,
  recentDeviceChangePoints: 5,
  thinHistory: {
    maxCompleted: 10, // < 10 completed transactions
    points: 5,
  },
  strongHistory: {
    minCompleted: 100,
    points: -5, // verified + >= 100 completed + 0 unresolved disputes
  },
  message: {
    urgencyPoints: 5,
    offPlatformPoints: 10,
    credentialRequestPoints: 15,
    differentRecipientPoints: 10,
    unverifiableClaimPoints: 5,
    cap: 20, // the pasted message can add at most this much
  },
  levels: {
    mediumFrom: 30,
    highFrom: 60,
  },
} as const;

/** Signals the engine is allowed to read. Used by a fairness test. */
export const ALLOWED_INPUT_SIGNALS = [
  "accountAgeDays",
  "completedTransactions",
  "unresolvedDisputes",
  "verificationStatus",
  "recentDeviceChange",
  "paymentNameMatches",
  "agreedPrice",
  "expectedMin",
  "expectedMax",
  "messageFindings",
] as const;
