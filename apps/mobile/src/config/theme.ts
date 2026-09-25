import { Platform } from "react-native";
import { generateColorTheme } from "@/utils/colors";
import { layout, radius, rounded, sizing, spacing, typography } from "./sizing";

// Legacy generated palette, still consumed by template primitives (sonner, Box, Button...).
// Tuned to the bright Stockpile palette so those pieces blend in.
const theme = generateColorTheme({
  base: {
    light: {
      primary: "#10131F",
      brand: "#3A5BFF",
      secondary: "#3A5BFF",
      success: "#0E9F77",
      warning: "#B25E09",
      error: "#D8394B",
      neutral: "#6B7288",
      contrast: "#000000",
      disabled: "#C9CEDC",
    },
    dark: {
      primary: "#F2F4FA",
      brand: "#8DA2FF",
      secondary: "#8DA2FF",
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
    accent: "#3A5BFF",
    accentPressed: "#2B47D9",
    accentSoft: "#E9EDFF",
    onAccent: "#FFFFFF",
    lilac: "#9A7BFF",
    lilacSoft: "#F1ECFF",
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
    accent: "#8DA2FF",
    accentPressed: "#7389F5",
    accentSoft: "#1D2442",
    onAccent: "#0B1030",
    lilac: "#B7A2FF",
    lilacSoft: "#251E3F",
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
  Record<"blue" | "coral" | "mint" | "lilac" | "sky", Gradient>
> = {
  light: {
    blue: ["#5B7CFF", "#9A7BFF"],
    coral: ["#FF8A6B", "#FFB86B"],
    mint: ["#2BCFA3", "#4DA3FF"],
    lilac: ["#B08CFF", "#FF8FB1"],
    sky: ["#4DA3FF", "#6FE0E8"],
  },
  dark: {
    blue: ["#3F5BE0", "#7A5CE6"],
    coral: ["#E0664F", "#E09A4F"],
    mint: ["#1FA886", "#3A86E0"],
    lilac: ["#8E6BE6", "#E06F93"],
    sky: ["#3A86E0", "#4FC4CC"],
  },
};

export type GradientName = keyof (typeof gradients)["light"];

// Vivid, coordinated categorical palette for allocation segments.
const chart = {
  light: [
    "#3A5BFF",
    "#FF7A66",
    "#22C29A",
    "#9A7BFF",
    "#FFB23F",
    "#2FA8E8",
    "#FF6FA3",
    "#6E7BF2",
  ],
  dark: [
    "#8DA2FF",
    "#FF9C8C",
    "#4FD1A8",
    "#B7A2FF",
    "#FFD27A",
    "#6CC4F2",
    "#FF9CC2",
    "#A3ACFF",
  ],
};

export const fonts = {
  /** Platform UI sans: SF Pro on iOS, Roboto on Android. */
  sans: Platform.select({ ios: "System", default: undefined }),
};

const shared = { sizing, spacing, radius, rounded, typography, layout, fonts };

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
