// Test-only helpers for building structurally valid serialized Solana transactions.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of value) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) throw new Error("invalid base58");
    for (let i = 0; i < bytes.length; i++) { carry += bytes[i]! * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const char of value) { if (char !== "1") break; bytes.push(0); }
  return new Uint8Array(bytes.reverse());
}

/** Signature slots, header, two static keys (fee payer first), blockhash, no instructions. */
export function fakeTransaction(feePayer: string, options: { version?: "legacy" | 0; signed?: boolean; signatures?: number } = {}) {
  const signatures = options.signatures ?? 1;
  const parts: number[] = [signatures];
  for (let i = 0; i < signatures; i++) parts.push(...new Array(64).fill(options.signed && i === 0 ? 7 : 0));
  if (options.version === 0) parts.push(0x80);
  parts.push(signatures, 0, 1, 2, ...base58Decode(feePayer), ...new Array(32).fill(9), ...new Array(32).fill(3), 0);
  if (options.version === 0) parts.push(0);
  return Buffer.from(parts).toString("base64");
}
