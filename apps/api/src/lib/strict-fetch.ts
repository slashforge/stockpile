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
