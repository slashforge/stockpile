import type { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import type { GradientName } from "@/config/theme";
import { useStockpileAuth } from "@/providers/auth-context";
import { HeroState } from "./hero-state";
import { LoadingState } from "./layout";
import { useSignInSheet } from "./sign-in-sheet";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Renders children only for signed-in users; otherwise an illustrated prompt that opens the sign-in sheet. */
export function AuthGate({
  title,
  body,
  icon,
  accents,
  gradient,
  children,
}: {
  title: string;
  body: string;
  icon: IconName;
  accents?: IconName[];
  gradient?: GradientName;
  children: React.ReactNode;
}) {
  const { configured, ready, authenticated } = useStockpileAuth();
  const { requestSignIn } = useSignInSheet();

  if (!configured) {
    return (
      <HeroState
        gradient="coral"
        icon="lock-closed"
        title="Sign-in is off in this build"
        body="You can still read the feed and explore bags."
        actionLabel="Explore bags"
        actionIcon="layers"
        onAction={() => router.navigate("/bags")}
      />
    );
  }
  if (!ready) return <LoadingState label="Restoring your session" count={1} />;
  if (!authenticated) {
    return (
      <HeroState
        gradient={gradient}
        icon={icon}
        accents={accents}
        title={title}
        body={body}
        actionLabel="Sign in"
        actionIcon="mail"
        onAction={() => requestSignIn()}
      />
    );
  }
  return <>{children}</>;
}
