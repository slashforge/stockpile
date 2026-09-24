import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.stockpile.nitish.sh";
const rawScheme = Constants.expoConfig?.scheme;
const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

export const authClient = createAuthClient({
  baseURL: `${API_URL}/auth`,
  plugins: [
    emailOTPClient(),
    expoClient({
      storage: SecureStore,
      storagePrefix: "stockpile",
      cookiePrefix: "better-auth",
      ...(scheme ? { scheme } : {}),
    }),
  ],
});

export const { useSession } = authClient;
export { API_URL };
