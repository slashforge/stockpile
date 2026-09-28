import { trackAllMints } from "./lib/bags";
import { referencePrices24h } from "./lib/history";
import { configureReferencePrices } from "./lib/market";

let initialised = false;

/** Registers every bag mint with the market cache and wires the 24h reference prices. Synchronous, no I/O; safe to call per request. */
export function initMarket() {
  if (initialised) return;
  initialised = true;
  trackAllMints();
  configureReferencePrices(referencePrices24h);
}
