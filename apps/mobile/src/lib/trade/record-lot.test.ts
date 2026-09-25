/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { classifyRecordResponse, RECORD_DELAYS_MS, type RecordAttempt, recordLotWithRetry } from "./record-lot";

const noSleep = async () => {};

function scripted(results: (RecordAttempt | Error)[]) {
  let calls = 0;
  const attempt = async () => {
    const next = results[Math.min(calls, results.length - 1)];
    calls += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  return { attempt, calls: () => calls };
}

describe("classifyRecordResponse", () => {
  test("200 links, 202 is pending", () => {
    expect(classifyRecordResponse(200, { id: "lot" })).toEqual({ kind: "linked" });
    expect(classifyRecordResponse(202, { status: "pending" })).toEqual({ kind: "pending" });
  });

  test("a signature linked to a different bag is refused", () => {
    expect(classifyRecordResponse(409, { error: "dup", code: "SIGNATURE_ALREADY_LINKED" })).toEqual({
      kind: "rejected",
      code: "SIGNATURE_ALREADY_LINKED",
      message: "dup",
    });
  });

  test("400 and 404 are final rejections with the server code", () => {
    expect(classifyRecordResponse(400, { error: "Not a swap", code: "NOT_A_SWAP" })).toEqual({
      kind: "rejected",
      code: "NOT_A_SWAP",
      message: "Not a swap",
    });
    expect(classifyRecordResponse(404, { error: "Bag not found" }).kind).toBe("rejected");
  });

  test("5xx and network failures are retryable", () => {
    expect(classifyRecordResponse(503, undefined).kind).toBe("error");
    expect(classifyRecordResponse(0, undefined).kind).toBe("error");
  });
});

describe("recordLotWithRetry", () => {
  test("keeps retrying while pending, then links", async () => {
    const script = scripted([{ kind: "pending" }, { kind: "pending" }, { kind: "linked" }]);
    const waits: number[] = [];
    const outcome = await recordLotWithRetry(script.attempt, {
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(outcome).toEqual({ status: "linked" });
    expect(script.calls()).toBe(3);
    expect(waits).toEqual([2000, 4000]);
  });

  test("stops immediately on a rejection", async () => {
    const script = scripted([{ kind: "rejected", code: "MINT_NOT_IN_BAG", message: "no" }]);
    const outcome = await recordLotWithRetry(script.attempt, { sleep: noSleep });
    expect(outcome).toEqual({ status: "failed", code: "MINT_NOT_IN_BAG", message: "no" });
    expect(script.calls()).toBe(1);
  });

  test("gives up after six tries and retries thrown errors", async () => {
    const script = scripted([new Error("offline"), { kind: "pending" }]);
    const outcome = await recordLotWithRetry(script.attempt, { sleep: noSleep });
    expect(outcome.status).toBe("failed");
    expect(script.calls()).toBe(RECORD_DELAYS_MS.length + 1);
    expect(script.calls()).toBe(6);
  });
});
