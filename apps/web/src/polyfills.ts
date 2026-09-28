import { Buffer } from "buffer";

// @solana/web3.js and some wallet deps expect Node's Buffer on the global object in the browser.
globalThis.Buffer ??= Buffer;
