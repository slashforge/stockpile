import { Buffer } from "buffer";
(globalThis as { Buffer?: typeof Buffer }).Buffer = Buffer;
Buffer.prototype.subarray = function subarray(
  this: Buffer,
  begin: number | undefined,
  end: number | undefined,
) {
  const result = Uint8Array.prototype.subarray.apply(this, [begin, end]);
  Object.setPrototypeOf(result, Buffer.prototype); // Explicitly add the `Buffer` prototype (adds `readUIntLE`!)
  return result as Buffer;
};
