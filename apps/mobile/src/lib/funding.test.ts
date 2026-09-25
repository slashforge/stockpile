import { describe, expect, test } from "bun:test";
import {
  cardFundingAvailable,
  isLowSol,
  suggestedFundingAmount,
} from "./funding";

describe("cardFundingAvailable", () => {
  test("hidden when funding is not configured", () => {
    expect(cardFundingAvailable(null)).toBe(false);
    expect(cardFundingAvailable(undefined)).toBe(false);
    expect(cardFundingAvailable({ methods: ["external"], options: [] })).toBe(
      false,
    );
  });

  test("shown when a card provider is enabled", () => {
    expect(cardFundingAvailable({ methods: ["moonpay"] })).toBe(true);
    expect(
      cardFundingAvailable({
        methods: [],
        options: [{ method: "card", provider: "coinbase" }],
      }),
    ).toBe(true);
  });
});

describe("suggestedFundingAmount", () => {
  test("uses a numeric dashboard default, else 25", () => {
    expect(suggestedFundingAmount({ default_recommended_amount: "50" })).toBe(
      "50",
    );
    expect(suggestedFundingAmount({ default_recommended_amount: "abc" })).toBe(
      "25",
    );
    expect(suggestedFundingAmount(null)).toBe("25");
  });
});

describe("isLowSol", () => {
  test("only flags known balances under 0.005 SOL", () => {
    expect(isLowSol({ status: "known", raw: 0n, decimals: 9 })).toBe(true);
    expect(isLowSol({ status: "known", raw: 4_999_999n, decimals: 9 })).toBe(
      true,
    );
    expect(isLowSol({ status: "known", raw: 5_000_000n, decimals: 9 })).toBe(
      false,
    );
    expect(isLowSol({ status: "unknown", reason: "x" })).toBe(false);
  });
});
