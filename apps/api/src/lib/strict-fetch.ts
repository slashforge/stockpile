/**
 * `fetch` that refuses redirects. Cloudflare Workers reject `redirect: "error"`, so use `"manual"` and
 * throw on any 3xx, matching the old behaviour (a redirect off a fixed provider host is never followed).
 */
export async function fetchNoRedirect(url: string | URL, init: Omit<RequestInit, "redirect"> = {}): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: "manual" });
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new TypeError(`Refused redirect from ${new URL(url).host} (${response.status})`);
  }
  return response;
}

export async function boundedBody(response: Response, maxBytes: number) {
  if (!response.ok || !response.body || Number(response.headers.get("content-length") || 0) > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Provider response rejected: ${response.status}`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
