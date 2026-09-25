import { describe, expect, test } from "bun:test";
import {
  colorDistance,
  MIN_NEIGHBOUR_DISTANCE,
  parseHex,
  resolveAssetColors,
} from "./asset-colors";

const palette = ["#3A5BFF", "#FF7A66", "#22C29A"];
const hex = (value: string) => parseHex(value)!;

describe("resolveAssetColors", () => {
  test("uses brandColor when set and the palette when null", () => {
    expect(
      resolveAssetColors(
        [{ brandColor: "#76B900" }, { brandColor: null }],
        palette,
      ),
    ).toEqual(["#76B900", "#FF7A66"]);
  });

  test("ignores malformed brand colours", () => {
    expect(
      resolveAssetColors(
        [{ brandColor: "nope" }, { brandColor: "#12" }],
        palette,
      ),
    ).toEqual(["#3A5BFF", "#FF7A66"]);
  });

  test("accepts 3-digit hex", () => {
    expect(resolveAssetColors([{ brandColor: "#e00" }], palette)).toEqual([
      "#EE0000",
    ]);
  });

  test("separates near-identical neighbours but keeps distinct ones", () => {
    const colors = resolveAssetColors(
      [
        { brandColor: "#1DA1F2" },
        { brandColor: "#1C9EEF" },
        { brandColor: "#FF7A66" },
      ],
      palette,
    );
    expect(colors[0]).toBe("#1DA1F2");
    expect(
      colorDistance(hex(colors[0]), hex(colors[1])),
    ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_DISTANCE);
    expect(colors[2]).toBe("#FF7A66");
  });

  test("keeps near-white marks visible on light surfaces and near-black on dark", () => {
    const [light] = resolveAssetColors(
      [{ brandColor: "#FFFFFF" }],
      palette,
      false,
    );
    expect(colorDistance(hex(light), [255, 255, 255])).toBeGreaterThan(
      MIN_NEIGHBOUR_DISTANCE,
    );
    const [dark] = resolveAssetColors(
      [{ brandColor: "#000000" }],
      palette,
      true,
    );
    expect(colorDistance(hex(dark), [0, 0, 0])).toBeGreaterThan(
      MIN_NEIGHBOUR_DISTANCE,
    );
  });

  test("separates identical greys", () => {
    const colors = resolveAssetColors(
      [{ brandColor: "#555555" }, { brandColor: "#555555" }],
      palette,
    );
    expect(
      colorDistance(hex(colors[0]), hex(colors[1])),
    ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_DISTANCE);
  });
});
