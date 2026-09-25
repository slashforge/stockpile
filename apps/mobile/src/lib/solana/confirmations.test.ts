/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { createConfirmationPoller, type RemoteStatus } from "./confirmations";

describe("createConfirmationPoller", () => {
  test("batches every pending signature into one request per tick and settles each", async () => {
    const calls: string[][] = [];
    let tick = 0;
    const wait = createConfirmationPoller(async (signatures) => {
      calls.push(signatures);
      tick += 1;
      return signatures.map((signature): RemoteStatus => {
        if (signature === "a") return { signature, status: "confirmed", error: null };
        if (signature === "b" && tick >= 2) return { signature, status: "failed", error: "{\"Custom\":6001}" };
        return { signature, status: "pending", error: null };
      });
    }, { intervalMs: 5 });
    const [a, b] = await Promise.all([wait("a"), wait("b")]);
    expect(a).toEqual({ status: "confirmed" });
    expect(b).toEqual({ status: "failed", error: "{\"Custom\":6001}" });
    expect(calls[0]).toEqual(["a", "b"]);
    expect(calls[1]).toEqual(["b"]);
  });

  test("keeps polling through request errors and resolves unknown at the deadline", async () => {
    let calls = 0;
    const wait = createConfirmationPoller(async () => {
      calls += 1;
      if (calls === 1) throw new Error("503");
      return [{ signature: "c", status: "pending", error: null }];
    }, { intervalMs: 5 });
    expect(await wait("c", { timeoutMs: 30 })).toEqual({ status: "unknown" });
    expect(calls).toBeGreaterThan(1);
  });
});
