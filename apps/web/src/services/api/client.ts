import { client } from "@stockpile/api-client";
import { API_URL } from "@/config/env";
import { getIdentityToken } from "./identity-token";

client.setConfig({
  baseUrl: API_URL,
  credentials: "omit",
});

// Protected routes authenticate with the Privy identity token (not the access token).
client.interceptors.request.use(async (request) => {
  const token = await getIdentityToken();
  if (token) {
    request.headers.set("privy-id-token", token);
  }
  return request;
});

export * from "@stockpile/api-client";
export { API_URL };
