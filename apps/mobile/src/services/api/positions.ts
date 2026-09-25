import type { BagPosition, PositionsResponse } from "@stockpile/api-client";
import { classifyRecordResponse, type RecordAttempt } from "@/lib/trade/record-lot";
import { getBagPositions as sdkGetBagPositions, recordBagLeg as sdkRecordBagLeg } from "./client";
import { unwrap } from "./stockpile";

export type { BagPosition, PositionLeg } from "@stockpile/api-client";
export type BagPositions = PositionsResponse;

/** Positions with nothing left in the wallet are history, not holdings. */
export function heldPositions(positions: BagPositions | undefined): BagPosition[] {
  if (!positions || positions.status !== "live") return [];
  return positions.bags.filter((bag) => bag.legs.some((leg) => /^\d+$/.test(leg.held) && BigInt(leg.held) > 0n));
}

export async function fetchPositions(): Promise<BagPositions> {
  return unwrap(sdkGetBagPositions());
}

/** One attempt at linking a confirmed swap to a bag. Never throws. */
export async function recordBagLeg(bagId: string, signature: string): Promise<RecordAttempt> {
  try {
    const result = await sdkRecordBagLeg({ body: { bagId, signature } });
    return classifyRecordResponse(result.response?.status ?? 0, result.error ?? result.data);
  } catch {
    return { kind: "error", message: "Can't reach Stockpile right now." };
  }
}
