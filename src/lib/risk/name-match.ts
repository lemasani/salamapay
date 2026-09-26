const NOISE_WORDS = new Set([
  "ltd",
  "limited",
  "co",
  "company",
  "enterprise",
  "enterprises",
  "shop",
  "store",
  "tz",
  "tanzania",
  "the",
  "and",
]);

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !NOISE_WORDS.has(t)),
  );
}

/**
 * Does the name on the payment account plausibly belong to the seller?
 * Matches when one name's meaningful words are contained in the other,
 * or when at least half of the words overlap.
 */
export function paymentNameMatches(
  registeredName: string,
  paymentAccountName: string,
): boolean {
  const a = tokens(registeredName);
  const b = tokens(paymentAccountName);
  if (a.size === 0 || b.size === 0) return false;
  const shared = [...a].filter((t) => b.has(t)).length;
  if (shared === a.size || shared === b.size) return true;
  const union = new Set([...a, ...b]).size;
  return shared / union >= 0.5;
}
