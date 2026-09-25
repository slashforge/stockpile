import { Platform } from "react-native";
import { generateColorTheme } from "@/utils/colors";
import { density, layout, radius, rounded, sizing, spacing, typography } from "./sizing";

// Legacy generated palette, still consumed by template primitives (sonner, Box, Button...).
// Tuned to the bright Stockpile palette so those pieces blend in.
const theme = generateColorTheme({
  base: {
    light: {
      primary: "#10131F",
      brand: "#2563EB",
      secondary: "#2563EB",
      success: "#0E9F77",
      warning: "#B25E09",
      error: "#D8394B",
      neutral: "#6B7288",
      contrast: "#000000",
      disabled: "#C9CEDC",
    },
    dark: {
      primary: "#F2F4FA",
      brand: "#6BA4FF",
      secondary: "#6BA4FF",
      success: "#4FD1A8",
      warning: "#F2B35B",
      error: "#FF8593",
      neutral: "#A3A9BC",
      contrast: "#FFFFFF",
      disabled: "#454B5E",
    },
  },
  text: {
    light: { default: "#10131F" },
    dark: { default: "#F2F4FA" },
  },
  surfaces: {
    light: { background: "#F5F6FB", border: "#8A90A6" },
    dark: { background: "#0E1017", border: "#6B7288" },
  },
});

/**
 * Stockpile design tokens (bright, cool, consumer). Screens and `src/components/stockpile`
 * use these exclusively. Text/background pairs meet WCAG AA; vivid hues are for fills.
 */
const ds = {
  light: {
    canvas: "#F5F6FB",
    surface: "#FFFFFF",
    sunken: "#EEF0F7",
    ink: "#10131F",
    inkSecondary: "#555C72",
    inkTertiary: "#7A8197",
    line: "#E6E8F1",
    lineStrong: "#D3D7E4",
    accent: "#2563EB",
    accentPressed: "#1D4ED8",
    accentSoft: "#E8F0FF",
    onAccent: "#FFFFFF",
    /** Rare tertiary accent (cyan); AA as text on white and on tertiarySoft. */
    tertiary: "#0E7490",
    tertiarySoft: "#E0F5F9",
    coral: "#FF7A66",
    coralSoft: "#FFEDEA",
    mint: "#22C29A",
    mintSoft: "#E3F8F1",
    sun: "#FFC24B",
    caution: "#A1510A",
    cautionSoft: "#FFF3E0",
    danger: "#C92F42",
    dangerSoft: "#FFE9EC",
    positive: "#0B8A67",
    scrim: "rgba(16, 19, 31, 0.04)",
  },
  dark: {
    canvas: "#0E1017",
    surface: "#171A24",
    sunken: "#0A0C12",
    ink: "#F2F4FA",
    inkSecondary: "#B5BACB",
    inkTertiary: "#8B91A6",
    line: "#252936",
    lineStrong: "#343949",
    accent: "#6BA4FF",
    accentPressed: "#4D8DF7",
    accentSoft: "#13254A",
    onAccent: "#06122B",
    tertiary: "#5ED3E8",
    tertiarySoft: "#0F2E36",
    coral: "#FF9C8C",
    coralSoft: "#3A221F",
    mint: "#4FD1A8",
    mintSoft: "#123027",
    sun: "#FFD27A",
    caution: "#F2B35B",
    cautionSoft: "#33270F",
    danger: "#FF8593",
    dangerSoft: "#3A1A20",
    positive: "#4FD1A8",
    scrim: "rgba(255, 255, 255, 0.05)",
  },
};

/** Gradient pairs for bag artwork and hero surfaces. */
type Gradient = readonly [string, string];
const gradients: Record<
  "light" | "dark",
  Record<"blue" | "coral" | "mint" | "rose" | "sky", Gradient>
> = {
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

export type GradientName = keyof (typeof gradients)["light"];

// Vivid, coordinated categorical palette for allocation segments.
const chart = {
  light: [
    "#2563EB",
    "#FF7A66",
    "#22C29A",
    "#0E9AB5",
    "#FFB23F",
    "#2FA8E8",
    "#FF6FA3",
    "#64748B",
  ],
  dark: [
    "#6BA4FF",
    "#FF9C8C",
    "#4FD1A8",
    "#5ED3E8",
    "#FFD27A",
    "#6CC4F2",
    "#FF9CC2",
    "#A3B1C6",
  ],
};

export const fonts = {
  /** Platform UI sans: SF Pro on iOS, Roboto on Android. */
  sans: Platform.select({ ios: "System", default: undefined }),
};

const shared = { sizing, spacing, radius, rounded, typography, layout, fonts, density };

export const lightTheme = {
  ...theme.light,
  ds: ds.light,
  gradients: gradients.light,
  chart: chart.light,
  ...shared,
};

export const darkTheme = {
  ...theme.dark,
  ds: ds.dark,
  gradients: gradients.dark,
  chart: chart.dark,
  ...shared,
};
