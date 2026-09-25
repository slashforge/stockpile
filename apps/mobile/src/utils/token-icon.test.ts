/// <reference types="bun" />
import { expect, test } from "bun:test";
import { safeIconUrl, tickerInitials } from "./token-icon";

test("safeIconUrl accepts only https", () => {
  expect(safeIconUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  expect(safeIconUrl("http://example.com/a.png")).toBeNull();
  expect(safeIconUrl("javascript:alert(1)")).toBeNull();
  expect(safeIconUrl("not a url")).toBeNull();
  expect(safeIconUrl(null)).toBeNull();
  expect(safeIconUrl(undefined)).toBeNull();
});

test("tickerInitials", () => {
  expect(tickerInitials("AAPLx")).toBe("AA");
  expect(tickerInitials("GOOGLx")).toBe("GO");
  expect(tickerInitials("x")).toBe("X");
  expect(tickerInitials("B.Rx")).toBe("BR");
  expect(tickerInitials("")).toBe("?");
});
