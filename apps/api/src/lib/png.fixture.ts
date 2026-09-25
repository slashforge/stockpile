// Test-only minimal PNG encoder (RGBA, 8-bit, filter 0) for brand colour fixtures.
import { deflateSync } from "node:zlib";

const table = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Uint8Array) {
  const typed = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const out = new Uint8Array(12 + body.length);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(typed, 4); out.set(body, 8);
  new DataView(out.buffer).setUint32(8 + body.length, crc32(new Uint8Array([...typed, ...body])));
  return out;
}

export type Pixel = (x: number, y: number) => [number, number, number, number];
export function encodePng(width: number, height: number, pixel: Pixel, options: { filter?: 0 | 1 | 2 } = {}) {
  const filter = options.filter ?? 0;
  const raw = new Uint8Array((width * 4 + 1) * height);
  const previous = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = filter;
    const line = new Uint8Array(width * 4);
    for (let x = 0; x < width; x++) line.set(pixel(x, y), x * 4);
    for (let i = 0; i < line.length; i++) {
      const left = i >= 4 ? line[i - 4]! : 0;
      raw[y * (width * 4 + 1) + 1 + i] = (line[i]! - (filter === 1 ? left : filter === 2 ? previous[i]! : 0)) & 0xff;
    }
    previous.set(line);
  }
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, width); new DataView(ihdr.buffer).setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", ihdr), ...chunk("IDAT", new Uint8Array(deflateSync(raw))), ...chunk("IEND", new Uint8Array())]);
}
