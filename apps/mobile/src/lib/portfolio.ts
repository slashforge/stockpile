import type { Activity } from "@/services/api/types";

function groupThousands(integer: string) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Compact token amount for list rows: 4 significant digits below 1 ("0.01655"), up to 6
 * significant digits otherwise ("1,234.57"), trailing zeros dropped, never exponent notation.
 * Non-numeric input is returned unchanged.
 */
export function formatHoldingAmount(uiAmount: string): string {
  const value = Number(uiAmount);
  if (!Number.isFinite(value) || uiAmount.trim() === "") return uiAmount;
  if (value === 0) return "0";
  const abs = Math.abs(value);
  const decimals =
    abs >= 1
      ? Math.max(0, 6 - Math.floor(Math.log10(abs)) - 1)
      : Math.min(12, -Math.floor(Math.log10(abs)) + 3);
  const [integer, fraction = ""] = abs.toFixed(decimals).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${groupThousands(integer)}${trimmed ? `.${trimmed}` : ""}`;
}

/** USD for a wallet value; em dash when unpriced. Never rounds a non-zero value down to $0.00. */
export function formatUsdValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. Null/invalid -> null (hide it). */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export type ActivityVisual = {
  icon: "swap-horizontal" | "arrow-down" | "arrow-up" | "ellipsis-horizontal" | "close";
  tone: "accent" | "positive" | "neutral" | "danger";
};

export function activityVisual(item: Pick<Activity, "kind" | "status">): ActivityVisual {
  if (item.status === "failed") return { icon: "close", tone: "danger" };
  switch (item.kind) {
    case "swap":
      return { icon: "swap-horizontal", tone: "accent" };
    case "transfer-in":
      return { icon: "arrow-down", tone: "positive" };
    case "transfer-out":
      return { icon: "arrow-up", tone: "neutral" };
    default:
      return { icon: "ellipsis-horizontal", tone: "neutral" };
  }
}

export type ActivityLine = {
  /** Short action, e.g. "Bought POLYMARKET", "Received SOL". */
  title: string;
  /** Right column, first line: the asset that moved in (or out for sends). */
  primary: { text: string; tone: "positive" | "neutral" } | null;
  /** Right column, second line: the other side of a swap. */
  secondary: string | null;
};

const STABLE = new Set(["USDC", "USDT"]);

function legLabel(leg: { symbol: string | null; mint: string }) {
  return leg.symbol ?? `${leg.mint.slice(0, 4)}…${leg.mint.slice(-4)}`;
}

/** Signed amount; the symbol is omitted when the row title already names that asset. */
function legAmount(leg: { amount: string; symbol: string | null; mint: string }, sign: "+" | "-", subject?: unknown) {
  return `${sign}${formatHoldingAmount(leg.amount)}${leg === subject ? "" : ` ${legLabel(leg)}`}`;
}

/** Splits an activity item into a short title and structured amounts for a two-line list row. */
export function describeActivity(item: Pick<Activity, "kind" | "status" | "summary" | "legs">): ActivityLine {
  const ins = item.legs.filter((leg) => leg.direction === "in");
  const outs = item.legs.filter((leg) => leg.direction === "out");
  const received = ins[0];
  const paid = outs[0];
  if (item.kind === "swap" && received && paid) {
    const paidStable = STABLE.has(paid.symbol ?? "");
    const receivedStable = STABLE.has(received.symbol ?? "");
    const verb = paidStable && !receivedStable ? "Bought" : receivedStable && !paidStable ? "Sold" : "Swapped";
    const subject = verb === "Sold" ? paid : received;
    return {
      title: `${verb} ${legLabel(subject)}`,
      primary: { text: legAmount(received, "+", subject), tone: "positive" },
      secondary: legAmount(paid, "-", subject),
    };
  }
  if (item.kind === "transfer-in" && received) {
    return { title: `Received ${legLabel(received)}`, primary: { text: legAmount(received, "+", received), tone: "positive" }, secondary: null };
  }
  if (item.kind === "transfer-out" && paid) {
    return { title: `Sent ${legLabel(paid)}`, primary: { text: legAmount(paid, "-", paid), tone: "neutral" }, secondary: null };
  }
  return { title: item.summary, primary: null, secondary: null };
}

/** Dedupes items across pages (a cursor boundary can repeat a signature). */
export function flattenActivity(pages: { items: Activity[] }[] | undefined): Activity[] {
  const seen = new Set<string>();
  const out: Activity[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.signature)) continue;
      seen.add(item.signature);
      out.push(item);
    }
  }
  return out;
}
