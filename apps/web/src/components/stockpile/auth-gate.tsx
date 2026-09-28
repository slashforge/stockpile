import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { IoLayers, IoLockClosed, IoMail } from "react-icons/io5";
import { useSignInSheet } from "@/components/sheets/sign-in-sheet";
import { type IconType, LoadingState } from "@/components/ui/layout";
import type { GradientName } from "@/components/ui/theme";
import { useStockpileAuth } from "@/providers/auth-context";
import { HeroState } from "./hero-state";

/** Renders children only for signed-in users; otherwise an illustrated prompt that opens sign-in. */
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
  icon: IconType;
  accents?: IconType[];
  gradient?: GradientName;
  children: ReactNode;
}) {
  const { configured, ready, authenticated } = useStockpileAuth();
  const { requestSignIn } = useSignInSheet();
  const navigate = useNavigate();

  if (!configured) {
    return (
      <HeroState
        gradient="coral"
        icon={IoLockClosed}
        title="Sign-in is off in this build"
        body="You can still read the feed and explore bags."
        actionLabel="Explore bags"
        actionIcon={IoLayers}
        onAction={() => navigate({ to: "/bags" })}
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
        actionIcon={IoMail}
        onAction={() => requestSignIn()}
      />
    );
  }
  return <>{children}</>;
}
