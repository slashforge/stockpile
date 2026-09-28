export type ConfirmationStatus = "confirmed" | "failed" | "unknown";
export type ConfirmationResult = { status: ConfirmationStatus; error?: string };
export type RemoteStatus = { signature: string; status: "pending" | "confirmed" | "failed"; error: string | null };
type FetchStatuses = (signatures: string[]) => Promise<RemoteStatus[]>;

/** Stockpile's `/trade/status` accepts up to this many signatures per call. */
const BATCH = 50;

type Waiter = { deadline: number; resolve: (result: ConfirmationResult) => void };

/**
 * Confirms many signatures with one status request per tick instead of one poll loop per swap, so
 * a 7-leg bag costs one call every `intervalMs`. A failed request (busy provider, offline) is simply
 * retried on the next tick; a signature still pending at its deadline resolves as "unknown".
 */
export function createConfirmationPoller(fetchStatuses: FetchStatuses, { intervalMs = 1_500 } = {}) {
  const waiters = new Map<string, Waiter[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const settle = (signature: string, result: ConfirmationResult) => {
    for (const waiter of waiters.get(signature) ?? []) waiter.resolve(result);
    waiters.delete(signature);
  };

  const tick = async () => {
    timer = null;
    const signatures = [...waiters.keys()];
    for (let start = 0; start < signatures.length; start += BATCH) {
      try {
        for (const status of await fetchStatuses(signatures.slice(start, start + BATCH))) {
          if (status.status === "confirmed") settle(status.signature, { status: "confirmed" });
          else if (status.status === "failed") settle(status.signature, { status: "failed", error: status.error ?? undefined });
        }
      } catch {
        // Transient; try again next tick.
      }
    }
    const now = Date.now();
    for (const [signature, list] of waiters) {
      const expired = list.filter((waiter) => waiter.deadline <= now);
      for (const waiter of expired) waiter.resolve({ status: "unknown" });
      const remaining = list.filter((waiter) => waiter.deadline > now);
      if (remaining.length) waiters.set(signature, remaining);
      else waiters.delete(signature);
    }
    schedule();
  };

  const schedule = () => {
    if (!timer && waiters.size > 0) timer = setTimeout(() => void tick(), intervalMs);
  };

  return function waitForConfirmation(signature: string, { timeoutMs = 90_000 } = {}): Promise<ConfirmationResult> {
    return new Promise((resolve) => {
      waiters.set(signature, [...(waiters.get(signature) ?? []), { deadline: Date.now() + timeoutMs, resolve }]);
      schedule();
    });
  };
}
