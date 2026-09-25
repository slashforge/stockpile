type AssetLike = { symbol: string; name: string; weightBps: number };

/** Compact news-style age: "Just now", "12m ago", "3h ago", "2d ago", then a short date. */
export function storyAge(value: string | null, now = Date.now()): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const date = new Date(time);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Ticker without the tokenised-stock suffix ("NVDAx" -> "NVDA"). */
export function displayTicker(symbol: string): string {
  return symbol.replace(/x$/, "") || symbol;
}

const MAX_IMAGE_PX = 3000;

/**
 * Sources to try for a framed (uncropped, landscape) story photo `frameWidth` device pixels wide,
 * sharpest first, always ending with the original. Where the publisher's CDN supports it we ask for
 * a frame-sized or original rendition on the same host. Unknown hosts are left untouched.
 */
export function storyImageSources(url: string, frameWidth: number): string[] {
  const w = Math.min(MAX_IMAGE_PX, Math.round(frameWidth));
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const host = parsed.hostname;
  let better: string | null = null;

  if (host === "image.cnbcfm.com" || host === "images.ctfassets.net") {
    // Image APIs that crop to any box: keep the publisher's 16:9 framing at the frame's width.
    parsed.searchParams.set("w", String(w));
    parsed.searchParams.set("h", String(Math.round((w * 9) / 16)));
    if (host === "images.ctfassets.net") parsed.searchParams.set("fit", "fill");
    better = parsed.toString();
  } else if (host === "assets.aboutamazon.com" && parsed.pathname.startsWith("/dims4/")) {
    // Resizer thumbnail wrapping the original asset on the same host.
    const inner = parsed.searchParams.get("url");
    try {
      if (inner && new URL(inner).protocol === "https:" && new URL(inner).hostname === host) better = inner;
    } catch {}
  } else if (parsed.pathname.includes("/wp-content/uploads/")) {
    if (parsed.searchParams.has("w") || parsed.searchParams.has("resize")) {
      // Jetpack/Photon: resizes on the fly up to the original width.
      parsed.searchParams.delete("resize");
      parsed.searchParams.set("w", String(w));
      better = parsed.toString();
    } else {
      // Plain WordPress: "-1152x648" (optionally "-<n>") marks a downsized copy of the original.
      const path = parsed.pathname.replace(/-\d{2,5}x\d{2,5}(?:-\d+)?(\.[a-z0-9]+)$/i, "$1");
      if (path !== parsed.pathname) {
        parsed.pathname = path;
        better = parsed.toString();
      }
    }
  }

  return better && better !== url ? [better, url] : [url];
}

/**
 * Whether a loaded photo has enough pixels to cover a `box` (device pixels) without visible
 * softness. Thumbnails that would need heavy upscaling are dropped in favour of the poster.
 */
export function isSharpEnough(image: { width: number; height: number }, box: { width: number; height: number }): boolean {
  if (!(image.width > 0 && image.height > 0)) return false;
  return Math.max(box.width / image.width, box.height / image.height) <= 2.75;
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Brand names headlines use for companies whose listed name differs.
const ALIASES: Record<string, string[]> = {
  GOOGL: ["Google", "YouTube", "Gemini", "Waymo"],
  GOOG: ["Google", "YouTube", "Gemini", "Waymo"],
  META: ["Facebook", "Instagram", "WhatsApp"],
  MSFT: ["Copilot", "Azure", "Xbox"],
  AMZN: ["AWS", "Alexa"],
  AAPL: ["iPhone", "iPad", "Mac"],
};

/**
 * The bag asset a story is about: the first one whose company name or ticker the headline or
 * summary mentions, otherwise the bag's heaviest holding.
 */
export function leadAsset<A extends AssetLike>(text: string, assets: readonly A[]): A | undefined {
  for (const asset of assets) {
    const company = asset.name.replace(/\s+(xStocks?|PreStocks?|Tokenized.*|Token)$/i, "").trim();
    const ticker = displayTicker(asset.symbol);
    const keys = [company, company.split(/\s+/)[0] ?? "", ticker, ...(ALIASES[ticker.toUpperCase()] ?? [])].filter((key) => key.length >= 3);
    if (keys.some((key) => new RegExp(`\\b${escape(key)}\\b`, "i").test(text))) return asset;
  }
  return [...assets].sort((a, b) => b.weightBps - a.weightBps)[0];
}
