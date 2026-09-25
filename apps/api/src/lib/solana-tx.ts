// Minimal, dependency-free inspection of a serialized Solana transaction.
// Used to confirm a prepared swap is unsigned and names the user's wallet as fee payer
// before it is handed to the client. It does not simulate or validate instructions.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let output = "";
  for (const byte of bytes) { if (byte !== 0) break; output += "1"; }
  let top = digits.length - 1;
  while (top >= 0 && digits[top] === 0) top--;
  for (let i = top; i >= 0; i--) output += ALPHABET[digits[i]!];
  return output;
}

function compactU16(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let size = 0;
  while (true) {
    const byte = bytes[offset + size];
    if (byte === undefined || size > 2) throw new Error("Malformed transaction length prefix");
    value |= (byte & 0x7f) << (7 * size);
    size++;
    if ((byte & 0x80) === 0) break;
  }
  return [value, offset + size];
}

export type TransactionSummary = { version: "legacy" | number; feePayer: string; signatureCount: number; signed: boolean; staticAccountCount: number };

export function inspectTransaction(base64Transaction: string): TransactionSummary {
  const bytes = new Uint8Array(Buffer.from(base64Transaction, "base64"));
  if (bytes.length < 68 || bytes.length > 1232) throw new Error("Transaction size is out of range");
  let [signatureCount, offset] = compactU16(bytes, 0);
  if (signatureCount < 1 || signatureCount > 16) throw new Error("Unexpected signature count");
  let signed = false;
  for (let i = 0; i < signatureCount; i++) {
    const signature = bytes.subarray(offset, offset + 64);
    if (signature.length !== 64) throw new Error("Truncated signature section");
    if (signature.some((byte) => byte !== 0)) signed = true;
    offset += 64;
  }
  const prefix = bytes[offset];
  if (prefix === undefined) throw new Error("Missing message");
  const version: "legacy" | number = (prefix & 0x80) === 0 ? "legacy" : prefix & 0x7f;
  if (version !== "legacy") offset++;
  const requiredSignatures = bytes[offset];
  if (requiredSignatures !== signatureCount) throw new Error("Header signature count does not match signature section");
  offset += 3;
  const [staticAccountCount, keysOffset] = compactU16(bytes, offset);
  if (staticAccountCount < 1 || keysOffset + 32 > bytes.length) throw new Error("Missing account keys");
  return { version, feePayer: base58(bytes.subarray(keysOffset, keysOffset + 32)), signatureCount, signed, staticAccountCount };
}
