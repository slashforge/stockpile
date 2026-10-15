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

  test("a stalled network request cannot hold a waiter past its deadline", async () => {
    let calls = 0;
    const wait = createConfirmationPoller(() => {
      calls += 1;
      return new Promise<RemoteStatus[]>(() => {});
    }, { intervalMs: 1 });
    expect(await wait("stalled", { timeoutMs: 20 })).toEqual({ status: "unknown" });
    expect(calls).toBe(1);
  });

  test("waiters for the same signature have independent deadlines", async () => {
    let finish!: (statuses: RemoteStatus[]) => void;
    const wait = createConfirmationPoller(() => new Promise<RemoteStatus[]>((resolve) => {
      finish = resolve;
    }), { intervalMs: 1 });
    const early = wait("shared", { timeoutMs: 20 });
    const later = wait("shared", { timeoutMs: 200 });
    expect(await early).toEqual({ status: "unknown" });
    finish([{ signature: "shared", status: "confirmed", error: null }]);
    expect(await later).toEqual({ status: "confirmed" });
  });

  test("the deadline also applies before the first polling tick", async () => {
    let calls = 0;
    const wait = createConfirmationPoller(async () => {
      calls += 1;
      return [];
    }, { intervalMs: 100 });
    expect(await wait("short", { timeoutMs: 10 })).toEqual({ status: "unknown" });
    expect(calls).toBe(0);
  });

  test("sends each signature's last valid block height and settles an expired swap as failed", async () => {
    const seen: (Record<string, number> | undefined)[] = [];
    const wait = createConfirmationPoller(async (signatures, heights) => {
      seen.push(heights);
      return signatures.map((signature): RemoteStatus =>
        signature === "old"
          ? { signature, status: "failed", error: "expired" }
          : { signature, status: "confirmed", error: null },
      );
    }, { intervalMs: 5 });
    const [old, fresh] = await Promise.all([wait("old", { lastValidBlockHeight: 123 }), wait("fresh")]);
    expect(old).toEqual({ status: "failed", error: "expired" });
    expect(fresh).toEqual({ status: "confirmed" });
    expect(seen[0]).toEqual({ old: 123 });
  });

  test("omits heights when no waiter has one", async () => {
    const seen: (Record<string, number> | undefined)[] = [];
    const wait = createConfirmationPoller(async (signatures, heights) => {
      seen.push(heights);
      return signatures.map((signature): RemoteStatus => ({ signature, status: "confirmed", error: null }));
    }, { intervalMs: 5 });
    await wait("a", { lastValidBlockHeight: null });
    expect(seen).toEqual([undefined]);
  });
});
