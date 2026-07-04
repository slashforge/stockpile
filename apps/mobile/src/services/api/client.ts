import { client } from "@stackforge/api-client";
import { authClient, API_URL } from "@/lib/auth-client";

client.setConfig({
  baseUrl: API_URL,
  credentials: "omit",
});

client.interceptors.request.use((request) => {
  const cookie = authClient.getCookie();

  if (cookie) {
    request.headers.set("Cookie", cookie);
  }

  return request;
});

export * from "@stackforge/api-client";
export { API_URL };
