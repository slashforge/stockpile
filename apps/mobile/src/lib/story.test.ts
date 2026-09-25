import { describe, expect, test } from "bun:test";
import { displayTicker, isSharpEnough, leadAsset, storyAge, storyImageSources } from "./story";

describe("storyImageSources", () => {
  const screen = 1080;
  test("requests a frame-width 16:9 rendition from cropping image APIs", () => {
    expect(storyImageSources("https://image.cnbcfm.com/api/v1/image/1-a.jpeg?v=1&w=1920&h=1080", screen)).toEqual([
      "https://image.cnbcfm.com/api/v1/image/1-a.jpeg?v=1&w=1080&h=608",
      "https://image.cnbcfm.com/api/v1/image/1-a.jpeg?v=1&w=1920&h=1080",
    ]);
    expect(storyImageSources("https://images.ctfassets.net/x/y/z/og.png?w=1600&h=900&fit=fill", screen)[0]).toBe(
      "https://images.ctfassets.net/x/y/z/og.png?w=1080&h=608&fit=fill",
    );
  });
  test("uses WordPress originals instead of downsized copies", () => {
    expect(storyImageSources("https://cdn.arstechnica.net/wp-content/uploads/2026/09/pic-1152x648-1790274426.jpg", screen)[0]).toBe(
      "https://cdn.arstechnica.net/wp-content/uploads/2026/09/pic.jpg",
    );
    expect(storyImageSources("https://blogs.microsoft.com/wp-content/uploads/2026/09/Hero-1024x683.jpg", screen)[0]).toBe(
      "https://blogs.microsoft.com/wp-content/uploads/2026/09/Hero.jpg",
    );
    expect(storyImageSources("https://techcrunch.com/wp-content/uploads/2026/08/p.jpg?resize=1200,675", screen)[0]).toBe(
      "https://techcrunch.com/wp-content/uploads/2026/08/p.jpg?w=1080",
    );
  });
  test("unwraps same-host resizer thumbnails only", () => {
    const inner = "https://assets.aboutamazon.com/eb/fb/hero.jpg";
    expect(
      storyImageSources(`https://assets.aboutamazon.com/dims4/default/e/2147483647/resize/1200x600!/?url=${encodeURIComponent(inner)}`, screen)[0],
    ).toBe(inner);
    const foreign = `https://assets.aboutamazon.com/dims4/default/e/?url=${encodeURIComponent("https://evil.example/x.jpg")}`;
    expect(storyImageSources(foreign, screen)).toEqual([foreign]);
  });
  test("leaves unknown hosts and bad urls alone", () => {
    expect(storyImageSources("https://www.apple.com/newsroom/a.jpg.og.jpg?1", screen)).toEqual(["https://www.apple.com/newsroom/a.jpg.og.jpg?1"]);
    expect(storyImageSources("not a url", screen)).toEqual(["not a url"]);
  });
});

describe("isSharpEnough", () => {
  const box = { width: 1206, height: 2622 };
  test("rejects thumbnails that would be heavily upscaled to cover the screen", () => {
    expect(isSharpEnough({ width: 3000, height: 1688 }, box)).toBe(true);
    expect(isSharpEnough({ width: 2000, height: 1000 }, box)).toBe(true);
    expect(isSharpEnough({ width: 1200, height: 675 }, box)).toBe(false);
    expect(isSharpEnough({ width: 0, height: 0 }, box)).toBe(false);
  });
});

describe("storyAge", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  test("uses compact relative ages for recent stories", () => {
    expect(storyAge("2026-09-26T11:59:40Z", now)).toBe("Just now");
    expect(storyAge("2026-09-26T11:48:00Z", now)).toBe("12m ago");
    expect(storyAge("2026-09-26T09:00:00Z", now)).toBe("3h ago");
    expect(storyAge("2026-09-24T12:00:00Z", now)).toBe("2d ago");
  });
  test("returns null for missing or invalid dates", () => {
    expect(storyAge(null, now)).toBeNull();
    expect(storyAge("nope", now)).toBeNull();
  });
});

describe("leadAsset", () => {
  const assets = [
    { symbol: "AAPLx", name: "Apple xStock", weightBps: 2000 },
    { symbol: "NVDAx", name: "NVIDIA xStock", weightBps: 5000 },
    { symbol: "MSFTx", name: "Microsoft xStock", weightBps: 3000 },
  ];
  test("prefers the asset the story mentions by name or ticker", () => {
    expect(leadAsset("Microsoft ships a new Copilot", assets)?.symbol).toBe("MSFTx");
    expect(leadAsset("Why NVDA rallied today", assets)?.symbol).toBe("NVDAx");
    expect(leadAsset("Google Photos adds a closet", [...assets, { symbol: "GOOGLx", name: "Alphabet xStock", weightBps: 100 }])?.symbol).toBe("GOOGLx");
  });
  test("falls back to the heaviest holding", () => {
    expect(leadAsset("Chip exports face new rules", assets)?.symbol).toBe("NVDAx");
    expect(leadAsset("anything", [])).toBeUndefined();
  });
  test("strips the tokenised suffix from tickers", () => {
    expect(displayTicker("NVDAx")).toBe("NVDA");
    expect(displayTicker("SOL")).toBe("SOL");
  });
});
