export type ConfirmationStatus = "confirmed" | "failed" | "unknown";
export type ConfirmationResult = { status: ConfirmationStatus; error?: string };
export type RemoteStatus = { signature: string; status: "pending" | "confirmed" | "failed"; error: string | null };
type FetchStatuses = (signatures: string[], lastValidBlockHeight?: Record<string, number>) => Promise<RemoteStatus[]>;

export type WaitOptions = {
  timeoutMs?: number;
  /** The transaction's blockhash expiry; once passed and still not on chain, the server reports it failed/expired. */
  lastValidBlockHeight?: number | null;
};

/** Stockpile's `/trade/status` accepts up to this many signatures per call. */
const BATCH = 50;

type Waiter = { deadline: number; timer: ReturnType<typeof setTimeout>; resolve: (result: ConfirmationResult) => void };

/**
 * Confirms many signatures with one status request per tick instead of one poll loop per swap, so
 * a 7-leg bag costs one call every `intervalMs`. A failed request (busy provider, offline) is simply
 * retried on the next tick; a signature still pending at its deadline resolves as "unknown".
 */
export function createConfirmationPoller(fetchStatuses: FetchStatuses, { intervalMs = 1_500 } = {}) {
  const waiters = new Map<string, Waiter[]>();
  const heights = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;

  const forget = (signature: string) => {
    waiters.delete(signature);
    heights.delete(signature);
  };

  const settle = (signature: string, result: ConfirmationResult) => {
    for (const waiter of waiters.get(signature) ?? []) {
      clearTimeout(waiter.timer);
      waiter.resolve(waiter.deadline <= Date.now() ? { status: "unknown" } : result);
    }
    forget(signature);
  };

  const tick = async () => {
    timer = null;
    polling = true;
    const signatures = [...waiters.keys()];
    for (let start = 0; start < signatures.length; start += BATCH) {
      const batch = signatures.slice(start, start + BATCH).filter((signature) => waiters.has(signature));
      if (!batch.length) continue;
      const batchHeights = Object.fromEntries(
        batch.flatMap((signature) => (heights.has(signature) ? [[signature, heights.get(signature)!] as const] : [])),
      );
      try {
        const statuses = await fetchStatuses(batch, Object.keys(batchHeights).length ? batchHeights : undefined);
        for (const status of statuses) {
          if (status.status === "confirmed") settle(status.signature, { status: "confirmed" });
          else if (status.status === "failed") settle(status.signature, { status: "failed", error: status.error ?? undefined });
        }
      } catch {
        // Transient; try again next tick.
      }
    }
    polling = false;
    schedule();
  };

  const schedule = () => {
    if (!timer && !polling && waiters.size > 0) timer = setTimeout(() => void tick(), intervalMs);
  };

  return function waitForConfirmation(
    signature: string,
    { timeoutMs = 90_000, lastValidBlockHeight }: WaitOptions = {},
  ): Promise<ConfirmationResult> {
    if (lastValidBlockHeight != null) heights.set(signature, lastValidBlockHeight);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        deadline: Date.now() + timeoutMs,
        resolve,
        timer: setTimeout(() => {
          resolve({ status: "unknown" });
          const remaining = (waiters.get(signature) ?? []).filter((candidate) => candidate !== waiter);
          if (remaining.length) waiters.set(signature, remaining);
          else forget(signature);
          if (!waiters.size && timer) {
            clearTimeout(timer);
            timer = null;
          }
        }, timeoutMs),
      };
      waiters.set(signature, [...(waiters.get(signature) ?? []), waiter]);
      schedule();
    });
  };
}
