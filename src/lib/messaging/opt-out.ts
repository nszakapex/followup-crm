/**
 * SMS opt-out / opt-in keyword detection for TCPA/CTIA compliance.
 */

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
]);

const OPT_IN_KEYWORDS = new Set(["start", "yes", "unstop"]);

/**
 * Normalize an inbound SMS body to a single lowercase keyword.
 * Strips whitespace and punctuation so "STOP." and " stop " both resolve to "stop".
 */
export function normalizeSmsKeyword(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Returns true if the inbound message is an opt-out keyword.
 */
export function isOptOutKeyword(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(normalizeSmsKeyword(text));
}

/**
 * Returns true if the inbound message is an opt-in keyword.
 */
export function isOptInKeyword(text: string): boolean {
  return OPT_IN_KEYWORDS.has(normalizeSmsKeyword(text));
}
