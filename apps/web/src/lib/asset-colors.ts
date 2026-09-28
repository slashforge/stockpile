/**
 * Per-asset colours: the server-extracted token `brandColor` when usable, else the categorical
 * chart palette. Pure so it can be unit-tested; the React hook lives in `allocation.tsx`.
 */

type Rgb = [number, number, number];
type Hsl = [number, number, number];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseHex(value: string | null | undefined): Rgb | null {
  const match = value?.trim().match(HEX);
  if (!match) return null;
  let hex = match[1];
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
        ? (bn - rn) / d + 2
        : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Perceptual-ish distance (redmean weighted RGB), 0..~765. */
export function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a[0] + b[0]) / 2;
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
  );
}

/** Below this, neighbouring segments read as one colour. */
export const MIN_NEIGHBOUR_DISTANCE = 90;

/**
 * Keeps a brand colour legible on the app surface: near-white (light mode) or near-black
 * (dark mode) marks are pulled toward the middle so rings and bars stay visible.
 */
const SURFACE_CLEARANCE = 150;

function fitToSurface(rgb: Rgb, dark: boolean): Rgb {
  const surface: Rgb = dark ? [0, 0, 0] : [255, 255, 255];
  if (colorDistance(rgb, surface) >= SURFACE_CLEARANCE) return rgb;
  const [h, s] = rgbToHsl(rgb);
  return hslToRgb([h, s, dark ? 0.55 : 0.45]);
}

function nudge(rgb: Rgb, away: Rgb, dark: boolean): Rgb {
  const [h, s, l] = rgbToHsl(rgb);
  const awayL = rgbToHsl(away)[2];
  // Move lightness away from the neighbour, staying inside the legible band for the surface.
  const [lo, hi] = dark ? [0.4, 0.85] : [0.2, 0.72];
  for (const step of [0.14, 0.22, 0.3]) {
    const candidates = [l + step, l - step]
      .map((v) => Math.min(hi, Math.max(lo, v)))
      .sort((a, b) => Math.abs(b - awayL) - Math.abs(a - awayL));
    for (const next of candidates) {
      const moved = hslToRgb([h, s, next]);
      if (colorDistance(moved, away) >= MIN_NEIGHBOUR_DISTANCE) return moved;
    }
  }
  return hslToRgb([
    h,
    s,
    Math.abs(hi - awayL) > Math.abs(lo - awayL) ? hi : lo,
  ]);
}

export function resolveAssetColors(
  assets: readonly { brandColor?: string | null }[],
  palette: readonly string[],
  dark = false,
): string[] {
  const out: Rgb[] = [];
  assets.forEach((asset, index) => {
    const brand = parseHex(asset.brandColor);
    let rgb = brand
      ? fitToSurface(brand, dark)
      : (parseHex(palette[index % palette.length]) ?? [128, 128, 128]);
    const prev = out[index - 1];
    // Keep the asset's hue (brand identity) and shift lightness until it separates from its neighbour.
    if (prev && colorDistance(rgb, prev) < MIN_NEIGHBOUR_DISTANCE)
      rgb = nudge(rgb, prev, dark);
    out.push(rgb);
  });
  return out.map(toHex);
}
