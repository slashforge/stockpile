// Dominant brand colour extraction for token icons. Pure TypeScript PNG decoding (no native
// image dependency; `sharp` is only a dependency of apps/landing and is not Workers-compatible).
// Only PNGs from the issuer / Jupiter icon hosts are fetched; any failure yields null.
import { feature } from "./config";

const allowedHost = (hostname: string) => hostname === "xstocks-metadata.backed.fi" || hostname === "www.prestocks.com" || hostname === "prestocks.com" || hostname === "jup.ag" || hostname.endsWith(".jup.ag");
const maxBytes = 512 * 1024;
const maxPixels = 4_000_000;
const successTtl = 24 * 60 * 60 * 1000;
const failureTtl = 5 * 60 * 1000;
const maxEntries = 100;
type Entry = { expiresAt: number; color: string | null; staleColor: string | null; pending?: Promise<string | null> };
const cache = new Map<string, Entry>();

export type Rgba = { width: number; height: number; data: Uint8Array };

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const zlib = await import("node:zlib");
  return new Uint8Array(zlib.inflateSync(bytes, { maxOutputLength: maxPixels * 4 + 8192 }));
}

/** Decodes 8/16-bit non-interlaced PNG (grey, RGB, palette, grey+alpha, RGBA) into RGBA. Throws on anything else. */
export async function decodePng(bytes: Uint8Array): Promise<Rgba> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || signature.some((byte, i) => bytes[i] !== byte)) throw new Error("Not a PNG");
  let offset = 8;
  let width = 0, height = 0, depth = 0, colorType = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const start = offset + 8;
    if (start + length + 4 > bytes.length) throw new Error("Truncated PNG chunk");
    const body = bytes.subarray(start, start + length);
    if (type === "IHDR") {
      width = view.getUint32(start); height = view.getUint32(start + 4); depth = bytes[start + 8]!; colorType = bytes[start + 9]!;
      if (bytes[start + 12] !== 0) throw new Error("Interlaced PNG unsupported");
      if (depth !== 8 && depth !== 16) throw new Error("Unsupported bit depth");
      if (![0, 2, 3, 4, 6].includes(colorType) || (colorType === 3 && depth !== 8)) throw new Error("Unsupported colour type");
      if (width < 1 || height < 1 || width * height > maxPixels) throw new Error("PNG dimensions out of range");
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset = start + length + 4;
  }
  if (!width || !idat.length) throw new Error("Missing PNG data");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!;
  const bytesPerPixel = channels * (depth / 8);
  const stride = width * bytesPerPixel;
  const raw = await inflate(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("PNG data too short");
  const pixels = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bytesPerPixel ? out[x - bytesPerPixel]! : 0;
      const b = previous[x]!;
      const c = x >= bytesPerPixel ? previous[x - bytesPerPixel]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (filter !== 0) throw new Error("Unknown PNG filter");
      out[x] = (line[x]! + predictor) & 0xff;
    }
    previous = out;
  }
  const data = new Uint8Array(width * height * 4);
  const step = depth / 8;
  for (let i = 0; i < width * height; i++) {
    const p = i * bytesPerPixel;
    let r = 0, g = 0, b = 0, a = 255;
    if (colorType === 3) {
      const index = pixels[p]!;
      if (!palette || index * 3 + 2 >= palette.length) throw new Error("Palette index out of range");
      r = palette[index * 3]!; g = palette[index * 3 + 1]!; b = palette[index * 3 + 2]!;
      a = transparency && index < transparency.length ? transparency[index]! : 255;
    } else if (colorType === 0 || colorType === 4) {
      r = g = b = pixels[p]!;
      a = colorType === 4 ? pixels[p + step]! : 255;
    } else {
      r = pixels[p]!; g = pixels[p + step]!; b = pixels[p + 2 * step]!;
      a = colorType === 6 ? pixels[p + 3 * step]! : 255;
    }
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
function hsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** Picks the dominant saturated colour from ~32px samples, ignoring transparent, near-white and near-black pixels. */
export function pickBrandColor(image: Rgba): string | null {
  const { width, height, data } = image;
  const stride = Math.max(1, Math.ceil(Math.max(width, height) / 32));
  type Bucket = { count: number; r: number; g: number; b: number; s: number };
  const buckets = new Map<number, Bucket>();
  const dark = new Map<number, Bucket>();
  let opaque = 0;
  const add = (map: Map<number, Bucket>, r: number, g: number, b: number, s: number) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = map.get(key) ?? { count: 0, r: 0, g: 0, b: 0, s: 0 };
    bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b; bucket.s += s;
    map.set(key, bucket);
  };
  for (let y = 0; y < height; y += stride) for (let x = 0; x < width; x += stride) {
    const i = (y * width + x) * 4;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, a = data[i + 3]!;
    if (a < 128) continue;
    opaque++;
    const { s, l } = hsl(r, g, b);
    if (l > 0.92 || (l > 0.82 && s < 0.25)) continue; // near-white
    if (l < 0.12) { add(dark, r, g, b, s); continue; } // near-black: only a last resort
    add(buckets, r, g, b, s);
  }
  if (!opaque) return null;
  let kept = 0;
  for (const bucket of buckets.values()) kept += bucket.count;
  const choose = (map: Map<number, Bucket>, minimum: number) => {
    let best: Bucket | null = null;
    for (const bucket of map.values()) if (bucket.count >= minimum && (!best || bucket.count > best.count)) best = bucket;
    return best;
  };
  const saturated = new Map([...buckets].filter(([, bucket]) => bucket.s / bucket.count >= 0.3));
  // Prefer a saturated brand colour; otherwise (mono logos) take whichever of the mid-tone or dark
  // buckets actually dominates, so anti-aliased edge greys do not win over a solid dark fill.
  let best = choose(saturated, Math.max(2, Math.ceil(kept * 0.03)));
  if (!best) {
    const mid = choose(buckets, Math.max(2, Math.ceil(opaque * 0.03)));
    const deep = choose(dark, Math.max(2, Math.ceil(opaque * 0.03)));
    best = mid && (!deep || mid.count >= deep.count) ? mid : deep ?? mid ?? choose(buckets, 1);
  }
  if (!best) return null;
  let r = best.r / best.count, g = best.g / best.count, b = best.b / best.count;
  // Ensure legibility on a white background by darkening overly light picks while preserving hue.
  for (let guard = 0; guard < 12 && hsl(r, g, b).l > 0.62; guard++) { r *= 0.88; g *= 0.88; b *= 0.88; }
  return hex(r, g, b);
}

async function fetchBrandColor(iconUrl: string): Promise<string | null> {
  let url = new URL(iconUrl);
  if (url.protocol !== "https:" || !allowedHost(url.hostname.toLowerCase())) return null;
  let response = await fetch(url, { redirect: "manual", headers: { Accept: "image/png" }, signal: AbortSignal.timeout(4000) });
  if ([301, 302, 307, 308].includes(response.status)) {
    // Follow a single redirect only if it stays on an allowlisted HTTPS host (e.g. www.prestocks.com -> prestocks.com).
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) return null;
    url = new URL(location, url);
    if (url.protocol !== "https:" || !allowedHost(url.hostname.toLowerCase())) return null;
    response = await fetch(url, { redirect: "error", headers: { Accept: "image/png" }, signal: AbortSignal.timeout(4000) });
  }
  if (!response.ok || !response.body || !/^image\//i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") || 0) > maxBytes) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return pickBrandColor(await decodePng(Buffer.concat(chunks)));
}

/** Cached (24h / 5m negative, stale-on-failure, bounded) brand colour for an already-validated icon URL. */
export async function brandColorFor(iconUrl: string | null): Promise<string | null> {
  if (!iconUrl || !feature("brandColors")) return null;
  let entry = cache.get(iconUrl);
  if (!entry) {
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    entry = { expiresAt: 0, color: null, staleColor: null };
    cache.set(iconUrl, entry);
  }
  if (entry.expiresAt <= Date.now() && !entry.pending) {
    const cached = entry;
    cached.pending = fetchBrandColor(iconUrl).catch(() => null).then((color) => {
      cached.color = color;
      if (color) cached.staleColor = color;
      cached.expiresAt = Date.now() + (color ? successTtl : failureTtl);
      cached.pending = undefined;
      return color;
    });
  }
  if (entry.pending) await entry.pending;
  return entry.color ?? entry.staleColor;
}

export function resetBrandColorCache() { cache.clear(); }
/** Test hook: force the next lookup for a URL to refresh (keeps stale colour). */
export function expireBrandColor(iconUrl: string) { const entry = cache.get(iconUrl); if (entry) entry.expiresAt = 0; }
