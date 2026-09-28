import { useSyncExternalStore } from "react";

export type GradientName = "blue" | "coral" | "mint" | "rose" | "sky";
type Gradient = readonly [string, string];

/** Mirrors apps/mobile/src/config/theme.ts for the few places that need raw colours (SVG, rgba math). */
export const gradients: Record<"light" | "dark", Record<GradientName, Gradient>> = {
  light: {
    blue: ["#2563EB", "#38BDF8"],
    coral: ["#FF8A6B", "#FFB86B"],
    mint: ["#2BCFA3", "#4DA3FF"],
    rose: ["#FF6F91", "#FF9E7A"],
    sky: ["#4DA3FF", "#6FE0E8"],
  },
  dark: {
    blue: ["#1D4ED8", "#0E8FD0"],
    coral: ["#E0664F", "#E09A4F"],
    mint: ["#1FA886", "#3A86E0"],
    rose: ["#D9577A", "#E0835F"],
    sky: ["#3A86E0", "#4FC4CC"],
  },
};

export const chartPalette = {
  light: ["#2563EB", "#FF7A66", "#22C29A", "#0E9AB5", "#FFB23F", "#2FA8E8", "#FF6FA3", "#64748B"],
  dark: ["#6BA4FF", "#FF9C8C", "#4FD1A8", "#5ED3E8", "#FFD27A", "#6CC4F2", "#FF9CC2", "#A3B1C6"],
};

export const accentHex = { light: "#2563EB", dark: "#6BA4FF" };
export const toneHex = {
  light: { positive: "#0B8A67", danger: "#C92F42", accent: "#2563EB" },
  dark: { positive: "#4FD1A8", danger: "#FF8593", accent: "#6BA4FF" },
};

export const GRADIENT_CLASS: Record<GradientName, string> = {
  blue: "grad-blue",
  coral: "grad-coral",
  mint: "grad-mint",
  rose: "grad-rose",
  sky: "grad-sky",
};

const query = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function subscribe(callback: () => void) {
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}

export function useIsDark() {
  return useSyncExternalStore(
    subscribe,
    () => !!query?.matches,
    () => false,
  );
}

/** Tracks a CSS media query (e.g. Tailwind's md breakpoint: "(min-width: 48rem)"). */
export function useMediaQuery(media: string) {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(media);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    () => window.matchMedia(media).matches,
    () => false,
  );
}

export function useScheme(): "light" | "dark" {
  return useIsDark() ? "dark" : "light";
}
