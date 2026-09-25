/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { type BagPositions, heldPositions } from "./positions";

const leg = (held: string) => ({
  mint: "M",
  symbol: "AAPLx",
  iconUrl: null,
  decimals: 8,
  tracked: held,
  trackedUi: 1,
  walletBalance: held,
  held,
  heldUi: 1,
  usdPrice: 200,
  usdValue: 200,
  costUsdc: 190,
});

const position = (bagId: string, helds: string[]) => ({
  bagId,
  title: bagId,
  legs: helds.map(leg),
  costUsdc: 10,
  valueUsd: 12,
  pnlUsd: 2,
  pnlPct: 20,
  reconciled: true,
  sellable: true,
  lotCount: 1,
  lastTradedAt: null,
});

describe("heldPositions", () => {
  test("hides bags with nothing left in the wallet", () => {
    const positions: BagPositions = {
      walletAddress: "W",
      status: "live",
      bags: [position("a", ["0"]), position("b", ["0", "5"])],
    };
    expect(heldPositions(positions).map((bag) => bag.bagId)).toEqual(["b"]);
  });

  test("nothing when positions are unavailable", () => {
    expect(heldPositions({ walletAddress: null, status: "unavailable", bags: [position("a", ["5"])] })).toEqual([]);
    expect(heldPositions(undefined)).toEqual([]);
  });
});
