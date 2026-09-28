type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter | null = null;

/** Registered by the Privy bridge while a user is signed in; cleared on sign-out/unmount. */
export function setIdentityTokenGetter(next: TokenGetter) {
  getter = next;
}

export function clearIdentityTokenGetter(next?: TokenGetter) {
  if (!next || getter === next) getter = null;
}

export async function getIdentityToken(): Promise<string | null> {
  if (!getter) return null;
  try {
    return await getter();
  } catch (error) {
    console.warn("Failed to read Privy identity token", error);
    return null;
  }
}
