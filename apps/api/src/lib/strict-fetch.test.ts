import { afterEach, expect, it, mock } from "bun:test";
import { fetchNoRedirect } from "./strict-fetch";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it("never follows redirects and passes other responses through", async () => {
  let seen: RequestInit | undefined;
  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => { seen = init; return new Response(null, { status: 302, headers: { Location: "https://evil.example/" } }); }) as unknown as typeof fetch;
  await expect(fetchNoRedirect("https://api.xstocks.fi/x", { headers: { Accept: "application/json" } })).rejects.toThrow("Refused redirect");
  expect(seen?.redirect).toBe("manual");
  globalThis.fetch = mock(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
  expect((await fetchNoRedirect("https://api.xstocks.fi/x")).status).toBe(404);
});
