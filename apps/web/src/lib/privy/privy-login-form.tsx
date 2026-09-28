import { useLoginWithEmail } from "@privy-io/react-auth";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { IoMailOutline } from "react-icons/io5";
import { PrimaryButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { T } from "@/components/ui/type";
import { useStockpileAuth } from "@/providers/auth-context";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** First-ever login also creates the embedded wallet; the session can take a moment to surface. */
const SESSION_WAIT_MS = 20_000;

export function PrivyLoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [slow, setSlow] = useState(false);
  const { authenticated } = useStockpileAuth();
  const busy = state.status === "sending-code" || state.status === "submitting-code" || (verified && !slow);

  // Close only once the app-wide session is visible, so callers never land on a signed-out screen.
  const closed = useRef(false);
  useEffect(() => {
    if (verified && authenticated && !closed.current) {
      closed.current = true;
      onSuccess();
    }
  }, [verified, authenticated, onSuccess]);

  useEffect(() => {
    if (!verified || authenticated) return;
    const timer = setTimeout(() => setSlow(true), SESSION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [verified, authenticated]);

  const submitEmail = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    try {
      await sendCode({ email: value });
      setEmail(value);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    }
  };

  const submitCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    try {
      await loginWithCode({ code: code.trim() });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    }
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <T as="h2" variant="title2">
          {step === "email" ? "Sign in" : "Check your email"}
        </T>
        <T variant="callout" tone="secondary">
          {step === "email"
            ? "We’ll email you a one-time code. First time here? We’ll set up your wallet."
            : `Enter the 6-digit code we sent to ${email}.`}
        </T>
      </div>

      {step === "email" ? (
        <form key="email" onSubmit={submitEmail} className="flex flex-col gap-[18px]">
          <Field
            label="Email address"
            icon={IoMailOutline}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoFocus
            disabled={busy}
            error={error}
          />
          <PrimaryButton type="submit" label="Send code" loading={busy} disabled={!email.trim()} />
        </form>
      ) : (
        <form key="code" onSubmit={submitCode} className="flex flex-col gap-[18px]">
          <Field
            label="Verification code"
            size="xl"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              if (error) setError(null);
            }}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            disabled={busy}
            maxLength={6}
            error={error}
          />
          <PrimaryButton type="submit" label="Verify and sign in" loading={busy} disabled={code.length !== 6} />
          <PrimaryButton
            label="Use a different email"
            variant="ghost"
            size="md"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          />
        </form>
      )}
      {verified && !slow ? (
        <T variant="footnote" tone="secondary" align="center">
          Code accepted. Setting up your session and wallet…
        </T>
      ) : null}
      {slow ? (
        <T variant="footnote" tone="caution" role="alert">
          Your code was accepted but the session is taking longer than usual. Reload the page to finish signing in.
        </T>
      ) : null}
    </div>
  );
}
