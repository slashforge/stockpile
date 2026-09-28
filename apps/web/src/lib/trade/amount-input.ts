export type AmountKey =
  "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "delete";

export const AMOUNT_MAX_DECIMALS = 2;
const MAX_WHOLE_DIGITS = 9;

/**
 * Applies one numpad key to a decimal amount string. Pure string edits (no floats): at most one
 * separator, no leading zeros, up to 2 decimals and 9 whole digits. Rejected keys return `current`.
 */
export function applyAmountKey(
  current: string,
  key: AmountKey,
  maxDecimals = AMOUNT_MAX_DECIMALS,
): string {
  if (key === "delete") return current.slice(0, -1);
  const [whole = "", fraction] = current.split(".");
  if (key === ".") {
    if (fraction !== undefined || maxDecimals === 0) return current;
    return `${whole || "0"}.`;
  }
  if (fraction !== undefined) {
    return fraction.length >= maxDecimals ? current : current + key;
  }
  if (whole === "0") return key;
  if (whole.length >= MAX_WHOLE_DIGITS) return current;
  return whole + key;
}

/** Display form of the in-progress amount: grouped whole part, typed decimals kept as-is. */
export function formatAmountInput(value: string): string {
  if (!value) return "0";
  const [whole = "", fraction] = value.split(".");
  const grouped = BigInt(whole || "0").toLocaleString("en-US");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Normalizes an arbitrary decimal (e.g. a full balance) to the numpad's precision, truncating. */
export function clampAmountDecimals(
  value: string,
  maxDecimals = AMOUNT_MAX_DECIMALS,
): string {
  const [whole = "0", fraction = ""] = value.replace(/,/g, "").split(".");
  const kept = fraction.slice(0, maxDecimals).replace(/0+$/, "");
  return kept ? `${whole}.${kept}` : whole;
}
