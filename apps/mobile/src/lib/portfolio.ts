import type { BagPositions } from "@/services/api/positions";
import type { Activity, Holding } from "@/services/api/types";

/**
 * Wallet holdings minus what bag positions claim, so tokens that belong to a bag are only shown in
 * that bag. Mirrors the server's loose balance (balance − Σ held), the only amount a direct token
 * sell may touch. `positions` undefined means still loading: bag-member tokens are held back rather
 * than flashing in and out. `null` means positions are unavailable: nothing is hidden.
 */
export function looseHoldings(holdings: Holding[], positions: BagPositions | null | undefined): Holding[] {
  if (positions === undefined) return holdings.filter((holding) => holding.bagIds.length === 0);
  const claimed = new Map<string, bigint>();
  for (const bag of positions?.bags ?? []) {
    for (const leg of bag.legs) {
      if (/^\d+$/.test(leg.held)) claimed.set(leg.mint, (claimed.get(leg.mint) ?? 0n) + BigInt(leg.held));
    }
  }
  const out: Holding[] = [];
  for (const holding of holdings) {
    if (!/^\d+$/.test(holding.amount)) continue;
    const total = BigInt(holding.amount);
    const taken = claimed.get(holding.mint) ?? 0n;
    const loose = total - taken;
    if (loose <= 0n) continue;
    if (taken === 0n) {
      out.push(holding);
      continue;
    }
    const share = Number(loose) / Number(total);
    const ui = holding.uiAmount != null ? Number(holding.uiAmount) * share : null;
    out.push({
      ...holding,
      amount: loose.toString(),
      uiAmount: ui != null && Number.isFinite(ui) ? String(ui) : null,
      usdValue: holding.usdValue != null ? holding.usdValue * share : null,
    });
  }
  return out;
}

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
      return { icon: "arrow-up", tone: "danger" };
    default:
      return { icon: "ellipsis-horizontal", tone: "neutral" };
  }
}

type Leg = Activity["legs"][number];

export type ActivityLine = {
  /** Bold action word, e.g. "Bought", "Received"; the summary for unrecognised items. */
  verb: string;
  /** Asset named after the verb, e.g. "POLYMARKET". */
  subject: string | null;
  /** Signed amount for the right column; the symbol is omitted when `subject` already names it. */
  amount: { text: string; tone: "positive" | "negative" | "accent" } | null;
  /** Secondary line, e.g. "2.5 USDC → 0.01655 POLYMARKET" or "Into your wallet". */
  detail: string | null;
  /** Legs for the avatar: `front` is the asset the row is about, `back` the other side of a swap. */
  front: Leg | null;
  back: Leg | null;
};

const STABLE = new Set(["USDC", "USDT"]);

function legLabel(leg: { symbol: string | null; mint: string }) {
  return leg.symbol ?? `${leg.mint.slice(0, 4)}…${leg.mint.slice(-4)}`;
}

function legAmount(leg: Leg) {
  return `${formatHoldingAmount(leg.amount)} ${legLabel(leg)}`;
}

/** Splits an activity item into verb / asset / amount / detail for a two-line ledger row. */
export function describeActivity(item: Pick<Activity, "kind" | "status" | "summary" | "legs">): ActivityLine {
  const received = item.legs.find((leg) => leg.direction === "in");
  const paid = item.legs.find((leg) => leg.direction === "out");
  if (item.kind === "swap" && received && paid) {
    const paidStable = STABLE.has(paid.symbol ?? "");
    const receivedStable = STABLE.has(received.symbol ?? "");
    const verb = paidStable && !receivedStable ? "Bought" : receivedStable && !paidStable ? "Sold" : "Swapped";
    const subject = verb === "Sold" ? paid : received;
    return {
      verb,
      subject: legLabel(subject),
      amount: { text: `+${subject === received ? formatHoldingAmount(received.amount) : legAmount(received)}`, tone: "accent" },
      detail: `${legAmount(paid)} → ${legAmount(received)}`,
      front: subject,
      back: subject === paid ? received : paid,
    };
  }
  if (item.kind === "transfer-in" && received) {
    return {
      verb: "Received",
      subject: legLabel(received),
      amount: { text: `+${formatHoldingAmount(received.amount)}`, tone: "positive" },
      detail: "Into your wallet",
      front: received,
      back: null,
    };
  }
  if (item.kind === "transfer-out" && paid) {
    return {
      verb: "Sent",
      subject: legLabel(paid),
      amount: { text: `-${formatHoldingAmount(paid.amount)}`, tone: "negative" },
      detail: "Out of your wallet",
      front: paid,
      back: null,
    };
  }
  return { verb: item.summary, subject: null, amount: null, detail: null, front: received ?? paid ?? null, back: null };
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Day heading for grouped activity: "Today", "Yesterday", "Sep 21", "Aug 1, 2025"; "Pending" without a time. */
export function activityDayLabel(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(at)) return "Pending";
  const date = new Date(at);
  const today = new Date(now);
  if (dayKey(date) === dayKey(today)) return "Today";
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Groups consecutive (newest-first) items under day headings. */
export function groupActivityByDay<Item extends Pick<Activity, "ts">>(items: Item[], now = Date.now()) {
  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const label = activityDayLabel(item.ts, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
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
