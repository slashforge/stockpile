/**
 * API client for authenticated requests to the backend.
 * 
 * Uses Privy identity tokens for authentication via the `privy-id-token` header.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.riven.cash";

// Will be set by the auth hook when user logs in
let getIdentityTokenFn: (() => Promise<string | null>) | null = null;

/**
 * Set the function to get the identity token.
 * Called by the auth hook after login.
 */
export function setIdentityTokenGetter(getter: () => Promise<string | null>) {
  getIdentityTokenFn = getter;
}

/**
 * Clear the identity token getter on logout.
 */
export function clearIdentityTokenGetter() {
  getIdentityTokenFn = null;
}

/**
 * Get the current identity token.
 */
export async function getIdentityToken(): Promise<string | null> {
  if (!getIdentityTokenFn) {
    console.warn("Identity token getter not set. User may not be logged in.");
    return null;
  }
  return getIdentityTokenFn();
}

/**
 * Make an authenticated API request.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getIdentityToken();

  if (!token) {
    throw new Error("Not authenticated. Please sign in again.");
  }

  const url = `${API_URL}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "privy-id-token": token,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Make an unauthenticated API request.
 */
export async function publicApiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.statusText}`);
  }

  return response.json();
}

export { API_URL };
