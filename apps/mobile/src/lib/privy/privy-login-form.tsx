import { useLoginWithEmail } from "@privy-io/expo";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Field } from "@/components/stockpile/field";
import { T } from "@/components/stockpile/type";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { useStockpileAuth } from "@/providers/auth-context";

type Props = { onSuccess: () => void };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** First-ever login also creates the embedded wallet; the session can take a moment to surface. */
const SESSION_WAIT_MS = 20_000;

export function PrivyLoginForm({ onSuccess }: Props) {
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

  const submitEmail = async () => {
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

  const submitCode = async () => {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    try {
      await loginWithCode({ email, code: code.trim() });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    }
  };

  const resetToEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
  };

  return (
    <View style={styles.form}>
      <View style={styles.heading}>
        <T variant="title2" accessibilityRole="header">
          {step === "email" ? "Sign in" : "Check your email"}
        </T>
        <T variant="callout" tone="secondary">
          {step === "email"
            ? "We’ll email you a one-time code. First time here? We’ll set up your wallet."
            : `Enter the 6-digit code we sent to ${email}.`}
        </T>
      </View>

      {step === "email" ? (
        <>
          <Field
            label="Email address"
            icon="mail-outline"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={submitEmail}
            editable={!busy}
            error={error}
          />
          <PrimaryButton label="Send code" onPress={submitEmail} loading={busy} disabled={!email.trim()} />
        </>
      ) : (
        <>
          <Field
            label="Verification code"
            size="xl"
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, "").slice(0, 6));
              if (error) setError(null);
            }}
            placeholder="000000"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            returnKeyType="done"
            onSubmitEditing={submitCode}
            editable={!busy}
            maxLength={6}
            error={error}
          />
          <PrimaryButton
            label="Verify and sign in"
            onPress={submitCode}
            loading={busy}
            disabled={code.length !== 6}
          />
          <PrimaryButton label="Use a different email" variant="ghost" size="md" onPress={resetToEmail} />
        </>
      )}
      {verified && !slow ? (
        <T variant="footnote" tone="secondary" align="center">
          Code accepted. Setting up your session and wallet…
        </T>
      ) : null}
      {slow ? (
        <T variant="footnote" tone="caution" accessibilityRole="alert">
          Your code was accepted but the session is taking longer than usual. Close and reopen the app to finish
          signing in.
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18 },
  heading: { gap: 8 },
});
