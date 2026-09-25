import { useEffect, useRef } from "react";
import { successNotification, warningNotification } from "@/components/utils/haptics";
import type { PurchaseStatus } from "@/lib/trade/purchase";

/** Buzzes once when a trade settles: success when every swap confirmed, warning when some didn't. */
export function useOutcomeHaptic(status: PurchaseStatus) {
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    if (status === "complete") successNotification();
    else if (status === "partial") warningNotification();
  }, [status]);
}
