/**
 * Links a confirmed swap signature to the bag it was bought or sold for (`POST /positions/legs`).
 * The server reads the amounts from chain; the app only sends the signature. A freshly confirmed
 * transaction may not be indexed yet, so "pending" answers and transient failures are retried with
 * backoff. Rejections (not a swap, wrong wallet, mint outside the bag…) are final.
 */

export type RecordAttempt =
  /** 200 (idempotent for the same signature and bag). */
  | { kind: "linked" }
  /** 202: the transaction isn't indexed yet. */
  | { kind: "pending" }
  /** 400 / 404 / 409 (linked to a different bag): refused; retrying won't help. */
  | { kind: "rejected"; code: string | null; message: string }
  /** Network error or 5xx: worth another try. */
  | { kind: "error"; message: string };

export type RecordOutcome =
  | { status: "linked" }
  | { status: "failed"; code: string | null; message: string };

/** Waits between attempts: 6 tries over roughly 46 seconds. */
export const RECORD_DELAYS_MS = [2000, 4000, 8000, 16000, 16000];

/** Maps an HTTP status + body of `POST /positions/legs` to an attempt result. */
export function classifyRecordResponse(status: number, body: unknown): RecordAttempt {
  const code = errorField(body, "code");
  const message = errorField(body, "error") ?? `Request failed (${status || "network"})`;
  if (status === 200 || status === 201) return { kind: "linked" };
  if (status === 202) return { kind: "pending" };
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { kind: "rejected", code, message };
  }
  return { kind: "error", message };
}

function errorField(body: unknown, key: "code" | "error"): string | null {
  if (body && typeof body === "object" && key in body) {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function recordLotWithRetry(
  attempt: () => Promise<RecordAttempt>,
  {
    delays = RECORD_DELAYS_MS,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: { delays?: number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<RecordOutcome> {
  let last: RecordAttempt = { kind: "error", message: "Not attempted" };
  for (let index = 0; index <= delays.length; index += 1) {
    try {
      last = await attempt();
    } catch (error) {
      last = { kind: "error", message: error instanceof Error ? error.message : "Request failed" };
    }
    if (last.kind === "linked") return { status: "linked" };
    if (last.kind === "rejected") return { status: "failed", code: last.code, message: last.message };
    if (index < delays.length) await sleep(delays[index]);
  }
  return {
    status: "failed",
    code: null,
    message: last.kind === "pending" ? "Still waiting for the transaction to be indexed." : last.message,
  };
}
