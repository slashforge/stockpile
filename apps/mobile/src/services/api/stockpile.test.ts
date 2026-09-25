/// <reference types="bun" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearIdentityTokenGetter, setIdentityTokenGetter } from "./identity-token";
import { ApiError, fetchBags, fetchPortfolio, prepareTrade, saveBag } from "./stockpile";

type Call = { url: string; method: string; headers: Headers; body: string | null };

const realFetch = globalThis.fetch;
let calls: Call[] = [];

function mockFetch(respond: (call: Call) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const call: Call = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" ? null : await request.clone().text(),
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  clearIdentityTokenGetter();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearIdentityTokenGetter();
});

describe("public routes", () => {
  test("list bags without an identity token", async () => {
    mockFetch(() => json(200, { bags: [] }));
    expect(await fetchBags()).toEqual([]);
    expect(calls[0].url.endsWith("/bags")).toBe(true);
    expect(calls[0].headers.get("privy-id-token")).toBeNull();
  });
});

describe("auth header", () => {
  test("sends the Privy identity token when signed in", async () => {
    setIdentityTokenGetter(async () => "id-token-123");
    mockFetch(() => json(200, { bagIds: ["b1"] }));
    expect(await saveBag("b1")).toEqual(["b1"]);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("privy-id-token")).toBe("id-token-123");
    expect(JSON.parse(calls[0].body ?? "{}")).toEqual({ bagId: "b1" });
  });

  test("a failing token getter sends no header instead of throwing", async () => {
    setIdentityTokenGetter(async () => {
      throw new Error("privy down");
    });
    mockFetch(() => json(401, { error: "Missing identity token" }));
    const error = await fetchPortfolio().catch((e) => e);
    expect(calls[0].headers.get("privy-id-token")).toBeNull();
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isUnauthorized).toBe(true);
  });
});

describe("error mapping", () => {
  test("uses the server's error message and status", async () => {
    mockFetch(() => json(404, { error: "Bag not found" }));
    const error = await saveBag("nope").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe("Bag not found");
    expect(error.isNotFound).toBe(true);
  });

  test("non-JSON error bodies are not shown verbatim", async () => {
    mockFetch(() => new Response("<html>404 Not Found</html>", { status: 404, headers: { "Content-Type": "text/html" } }));
    const error = await fetchBags().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isNotFound).toBe(true);
    expect(error.message).not.toContain("<html>");
    expect(error.message).toContain("Stockpile API");
  });

  test("503 means Privy isn't configured on the server", async () => {
    mockFetch(() => json(503, {}));
    const error = await fetchPortfolio().catch((e) => e);
    expect(error.isAuthUnavailable).toBe(true);
    expect(error.message).toContain("not configured");
  });

  test("network failure becomes a friendly status-0 error", async () => {
    mockFetch(() => {
      throw new TypeError("Network request failed");
    });
    const error = await fetchBags().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain("Can't reach Stockpile");
  });

  test("unavailable trade prepare is data, not an error, and carries no transactions", async () => {
    mockFetch(() =>
      json(200, { status: "unavailable", walletAddress: null, transactions: [], message: "Jupiter not configured" }),
    );
    const prepared = await prepareTrade({ bagId: "b1", inputMint: "mint", amount: "1000" });
    expect(prepared.status).toBe("unavailable");
    expect(prepared.transactions).toEqual([]);
  });
});
