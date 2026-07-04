import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  cancelAnimation,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { Box, Text, Button, Icon, Input } from "@/components/ui/primitives";
import OtpInput from "@/components/ui/otp-input";
import AppIcon from "@/assets/icons/app-icon";
import { useAuth, syncUserWithBackend } from "@/hooks/use-auth";
import { deleteWallet, resetOnboarding } from "@/services/wallet";
import { authStorage } from "@/services/auth-storage";

const ICON_SIZE = 48;

const SplashLoader = () => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, []);

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Box center style={styles.wrapper}>
      <Animated.View style={styles.loaderContainer}>
        <Animated.View style={[styles.spinnerRing, rotationStyle]} />
        <Box style={styles.iconCenter} center />
      </Animated.View>
      <Animated.View style={styles.iconWrapper}>
        <AppIcon width={ICON_SIZE} height={ICON_SIZE} />
      </Animated.View>
    </Box>
  );
};

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const maskedLocal =
    local.length > 2
      ? `${local[0]}${"•".repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}`
      : local;
  return `${maskedLocal}@${domain}`;
}

function EmailStep({
  onSubmit,
  isLoading,
  error,
}: {
  onSubmit: (email: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const inputRef = useRef<TextInput>(null);
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    // Auto focus after animation
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = () => {
    if (isValidEmail && !isLoading) {
      onSubmit(email);
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={SlideOutLeft.duration(300)}
      style={{ flex: 1 }}
    >
      <Box flex justifyContent="center" px="lg">
        <Box alignItems="center" mb="lg">
          <Box mb="lg">
            <AppIcon width={80} height={80} />
          </Box>

          <Text
            size="xxl"
            weight="bold"
            style={{ textAlign: "center", marginBottom: 8 }}
          >
            Enter your email
          </Text>

          <Text
            size="md"
            mode="subtle"
            style={{ textAlign: "center", lineHeight: 22 }}
          >
            We'll send you a verification code
          </Text>
        </Box>

        <Box mt="lg">
          <Input
            ref={inputRef}
            size="lg"
            placeholder="email@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={handleSubmit}
            mode={error ? "error" : undefined}
          />

          {error && (
            <Text
              size="sm"
              mode="error"
              style={{ marginTop: 8, textAlign: "center" }}
            >
              {error}
            </Text>
          )}
        </Box>
      </Box>

      <Box pb="lg" px="lg" safeAreaBottom>
        <Button
          size="lg"
          rounded="full"
          onPress={handleSubmit}
          disabled={!isValidEmail || isLoading}
          loading={isLoading}
        >
          <Button.Text weight="semibold">Continue</Button.Text>
        </Button>
      </Box>
    </Animated.View>
  );
}

function OtpStep({
  email,
  onSubmit,
  onBack,
  isLoading,
  error,
}: {
  email: string;
  onSubmit: (code: string) => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [otpCode, setOtpCode] = useState("");

  const handleComplete = (code: string) => {
    onSubmit(code);
  };

  return (
    <Animated.View
      entering={SlideInRight.duration(300)}
      exiting={FadeOut.duration(300)}
      style={{ flex: 1 }}
    >
      <Box flex justifyContent="center" px="lg">
        <Box alignItems="center" mb="lg">
          <Box mb="lg">
            <AppIcon width={80} height={80} />
          </Box>

          <Text
            size="xxl"
            weight="bold"
            style={{ textAlign: "center", marginBottom: 8 }}
          >
            Verify your email
          </Text>

          <Text
            size="md"
            mode="subtle"
            style={{ textAlign: "center", lineHeight: 22 }}
          >
            Enter the code we sent to
          </Text>
          <Text size="md" weight="medium" style={{ marginTop: 4 }}>
            {maskEmail(email)}
          </Text>
        </Box>

        <Box mt="lg">
          <OtpInput
            length={6}
            value={otpCode}
            onChangeText={setOtpCode}
            onComplete={handleComplete}
            autoFocus
          />

          {error && (
            <Text
              size="sm"
              mode="error"
              style={{ marginTop: 16, textAlign: "center" }}
            >
              {error}
            </Text>
          )}

          <Pressable onPress={onBack} style={{ marginTop: 24 }}>
            <Box direction="row" gap="xs" justifyContent="center" alignItems="center">
              <Icon icon={Ionicons} name="arrow-back" size={16} color="muted" />
              <Text size="sm" mode="subtle">
                Change email address
              </Text>
            </Box>
          </Pressable>
        </Box>
      </Box>

      <Box pb="lg" px="lg" safeAreaBottom>
        <Button
          size="lg"
          rounded="full"
          onPress={() => handleComplete(otpCode)}
          disabled={otpCode.length !== 6 || isLoading}
          loading={isLoading}
        >
          <Button.Text weight="semibold">Verify</Button.Text>
        </Button>
      </Box>
    </Animated.View>
  );
}

function DevResetButton({ onPress }: { onPress: () => void }) {
  if (!__DEV__) return null;

  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        top: 60,
        right: 16,
        zIndex: 100,
        padding: 8,
        backgroundColor: "rgba(255, 0, 0, 0.2)",
        borderRadius: 8,
      }}
    >
      <Text size="xs" style={{ color: "#ff6666" }}>
        DEV RESET
      </Text>
    </Pressable>
  );
}

export function AuthPage() {
  const router = useRouter();
  const {
    step,
    email,
    isLoading,
    error,
    isAuthenticated,
    registerEmail,
    verifyOtp,
    goBack,
    clearError,
    logout,
  } = useAuth();

  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // If user is already authenticated, try to sync and redirect.
  // During OTP verification, useAuth() handles sync directly and routes away.
  useEffect(() => {
    if (isAuthenticated && step === "email" && syncState === "idle") {
      setSyncState("syncing");
      syncUserWithBackend()
        .then((result) => {
          if (result.success) {
            router.replace("/(app)/tabs/home");
          } else {
            setSyncState("error");
            setSyncError(result.error || "Failed to sync");
          }
        })
        .catch((err) => {
          setSyncState("error");
          setSyncError(err.message || "Failed to sync");
        });
    }
  }, [isAuthenticated, step, syncState, router]);

  const handleRetrySync = useCallback(() => {
    setSyncState("idle");
    setSyncError(null);
  }, []);

  const handleDevReset = useCallback(async () => {
    try {
      await logout();
      await deleteWallet();
      await resetOnboarding();
      await authStorage.clearAll();
      router.replace("/welcome");
    } catch (err) {
      console.error("Dev reset error:", err);
    }
  }, [logout, router]);

  // Show syncing state if already authenticated
  if (isAuthenticated && syncState === "syncing") {
    return (
      <Box flex background="base" safeAreaTop>
        <DevResetButton onPress={handleDevReset} />
        <Box flex center px="lg">
          <SplashLoader />
          <Text size="md" mode="subtle" style={{ marginTop: 16, textAlign: "center" }}>
            Setting up your account...
          </Text>
        </Box>
      </Box>
    );
  }

  // Show sync error with retry
  if (isAuthenticated && syncState === "error") {
    return (
      <Box flex background="base" safeAreaTop>
        <DevResetButton onPress={handleDevReset} />
        <Box flex center px="lg">
          <Text size="lg" weight="semibold" style={{ marginBottom: 8, textAlign: "center" }}>
            Connection Error
          </Text>
          <Text size="md" mode="subtle" style={{ marginBottom: 24, textAlign: "center" }}>
            {syncError}
          </Text>
          <Button size="lg" rounded="full" onPress={handleRetrySync}>
            <Button.Text weight="semibold">Try Again</Button.Text>
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box flex background="base" safeAreaTop>
      <DevResetButton onPress={handleDevReset} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {step === "email" ? (
          <EmailStep
            onSubmit={registerEmail}
            isLoading={isLoading}
            error={error}
          />
        ) : (
          <OtpStep
            email={email}
            onSubmit={verifyOtp}
            onBack={() => {
              clearError();
              goBack();
            }}
            isLoading={isLoading}
            error={error}
          />
        )}
      </KeyboardAvoidingView>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrapper: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderContainer: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background.subtle,
  },
  spinnerRing: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: theme.colors.border.subtle,
    borderTopColor: theme.colors.brand[500],
  },
  iconCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.background.base,
  },
  iconWrapper: {
    position: "absolute",
  },
}));

export default AuthPage;
