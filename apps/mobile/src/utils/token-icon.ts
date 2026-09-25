/** Only render remote logos over HTTPS; anything else falls back to the ticker monogram. */
export function safeIconUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Monogram letters for a ticker: strips the tokenized "x" suffix (e.g. "AAPLx" -> "AA"). */
export function tickerInitials(symbol: string): string {
  const base = symbol.replace(/x$/, "") || symbol;
  return base.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";
}
