/**
 * Exact decimal <-> base-unit conversion using string/BigInt math (no floats).
 */

const DECIMAL_INPUT = /^\d*(\.\d*)?$/;

/** Returns integer base units as a string, or null when the input is not a positive amount. */
export function toBaseUnits(input: string, decimals: number): string | null {
  const value = input.trim().replace(/,/g, "");
  if (!value || value === "." || !DECIMAL_INPUT.test(value)) return null;
  const [whole = "", fraction = ""] = value.split(".");
  if (fraction.length > decimals) return null;
  const units = BigInt((whole || "0") + fraction.padEnd(decimals, "0"));
  return units > 0n ? units.toString() : null;
}

/** Formats integer base units with the given decimals, trimming trailing zeros. */
export function formatBaseUnits(raw: string, decimals: number, maxFractionDigits = 6): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const fraction = decimals > 0 ? padded.slice(padded.length - decimals) : "";
  const wholeFormatted = BigInt(whole).toLocaleString("en-US");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${wholeFormatted}.${trimmed}` : wholeFormatted;
}

/** Exact `num / 10^scale` for a finite positive JS number via its shortest decimal string. */
function decimalRatio(value: number): { num: bigint; scale: number } | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const [mantissa, exponentPart] = value.toString().toLowerCase().split("e");
  const exponent = Number(exponentPart ?? 0);
  const [whole, fraction = ""] = mantissa.split(".");
  let num = BigInt(whole + fraction);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    num *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { num, scale };
}

/**
 * Raw on-chain units to the token amount a wallet shows. Token-2022 scaled-UI-amount mints (e.g.
 * PreStocks OPENAI, SPACEX) display `raw / 10^decimals * uiAmountMultiplier`; the multiplier is 1
 * for ordinary tokens. BigInt math, truncated (never rounded up), so minimums stay conservative.
 */
export function formatTokenAmount(raw: string, decimals: number, uiAmountMultiplier = 1, maxFractionDigits = 6): string {
  if (!/^\d+$/.test(raw)) return raw;
  const ratio = decimalRatio(uiAmountMultiplier);
  if (!ratio) return formatBaseUnits(raw, decimals, maxFractionDigits);
  // raw * num has `decimals + scale` fractional digits; formatBaseUnits truncates the display.
  return formatBaseUnits((BigInt(raw) * ratio.num).toString(), decimals + ratio.scale, maxFractionDigits);
}

/** Groups and trims an already-scaled decimal string (e.g. `Holding.uiAmount`). */
export function formatUiAmount(value: string, maxFractionDigits = 6): string {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const fraction = (match[2] ?? "").slice(0, maxFractionDigits).padEnd(maxFractionDigits, "0");
  return formatBaseUnits(match[1] + fraction, maxFractionDigits, maxFractionDigits);
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2).replace(/0+$/, "")}%`;
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Money-style display for base units: always two decimals (truncated, never rounded up), grouped. */
export function formatMoney(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  const padded = raw.padStart(decimals + 1, "0");
  const whole = BigInt(padded.slice(0, padded.length - decimals) || "0").toLocaleString("en-US");
  const cents = (decimals > 0 ? padded.slice(padded.length - decimals) : "").padEnd(2, "0").slice(0, 2);
  return `${whole}.${cents}`;
}
