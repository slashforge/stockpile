import type { Connection, Commitment, TransactionConfirmationStatus } from "@solana/web3.js";

export interface ConfirmTransactionResult {
  confirmed: boolean;
  err: any | null;
  slot?: number;
  confirmationStatus?: TransactionConfirmationStatus;
}

export interface ConfirmTransactionOptions {
  /** Maximum time to wait for confirmation in ms (default: 60000) */
  timeout?: number;
  /** Polling interval in ms (default: 1000) */
  pollInterval?: number;
  /** Desired commitment level (default: "confirmed") */
  commitment?: Commitment;
}

/**
 * Polling-based transaction confirmation for Cloudflare Workers.
 * 
 * Unlike connection.confirmTransaction() which uses WebSocket subscriptions,
 * this function polls getSignatureStatuses via HTTP RPC calls.
 * This is necessary because Cloudflare Workers have limitations with WebSocket connections.
 */
export async function confirmTransactionPolling(
  connection: Connection,
  signature: string,
  options: ConfirmTransactionOptions = {}
): Promise<ConfirmTransactionResult> {
  const {
    timeout = 60000,
    pollInterval = 1000,
    commitment = "confirmed",
  } = options;

  const startTime = Date.now();
  
  // Map commitment to required confirmation status
  const requiredStatus = getRequiredStatus(commitment);

  while (Date.now() - startTime < timeout) {
    try {
      const response = await connection.getSignatureStatuses([signature]);
      const status = response?.value?.[0];

      if (status) {
        // Check if transaction errored
        if (status.err) {
          return {
            confirmed: false,
            err: status.err,
            slot: status.slot,
            confirmationStatus: status.confirmationStatus,
          };
        }

        // Check if we've reached the required confirmation level
        if (status.confirmationStatus && 
            isStatusSufficient(status.confirmationStatus, requiredStatus)) {
          return {
            confirmed: true,
            err: null,
            slot: status.slot,
            confirmationStatus: status.confirmationStatus,
          };
        }
      }

      // Wait before next poll
      await sleep(pollInterval);
    } catch (error) {
      // Log but continue polling - transient RPC errors shouldn't fail the whole operation
      console.warn("Polling error (will retry):", error);
      await sleep(pollInterval);
    }
  }

  // Timeout reached - do one final check
  try {
    const response = await connection.getSignatureStatuses([signature]);
    const status = response?.value?.[0];

    if (status) {
      if (status.err) {
        return {
          confirmed: false,
          err: status.err,
          slot: status.slot,
          confirmationStatus: status.confirmationStatus,
        };
      }

      if (status.confirmationStatus && 
          isStatusSufficient(status.confirmationStatus, requiredStatus)) {
        return {
          confirmed: true,
          err: null,
          slot: status.slot,
          confirmationStatus: status.confirmationStatus,
        };
      }
    }
  } catch (error) {
    // Ignore final check error
  }

  // Return timeout error
  return {
    confirmed: false,
    err: { timeout: true, message: `Transaction confirmation timeout after ${timeout}ms` },
  };
}

/**
 * Get the minimum required confirmation status for a commitment level
 */
function getRequiredStatus(commitment: Commitment): TransactionConfirmationStatus {
  switch (commitment) {
    case "processed":
      return "processed";
    case "confirmed":
      return "confirmed";
    case "finalized":
    case "max":
    case "root":
      return "finalized";
    default:
      return "confirmed";
  }
}

/**
 * Check if the actual status meets or exceeds the required status
 */
function isStatusSufficient(
  actual: TransactionConfirmationStatus,
  required: TransactionConfirmationStatus
): boolean {
  const levels: TransactionConfirmationStatus[] = ["processed", "confirmed", "finalized"];
  const actualLevel = levels.indexOf(actual);
  const requiredLevel = levels.indexOf(required);
  return actualLevel >= requiredLevel;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
