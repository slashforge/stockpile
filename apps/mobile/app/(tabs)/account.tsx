import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { CopyRow } from "@/components/stockpile/copy-row";
import { GradientCard } from "@/components/stockpile/gradient-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { Card, Collapsible, ListRow, Screen } from "@/components/stockpile/layout";
import { PrimaryButton } from "@/components/stockpile/primary-button";
import { useSignInSheet } from "@/components/stockpile/sign-in-sheet";
import { T } from "@/components/stockpile/type";
import { API_URL } from "@/config/env";
import { useMe } from "@/hooks/use-account";
import { useBags } from "@/hooks/use-bags";
import { useSonner } from "@/hooks/use-sonner";
import { useStockpileAuth } from "@/providers/auth-context";

const RISKS = [
  "Bags are Stockpile’s editorial research, not investment advice or a recommendation.",
  "Tokenized stocks are issued by third parties, may not carry shareholder rights and can trade away from the share price.",
  "Swaps have slippage and network fees. You can lose money.",
];

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Disclosures() {
  const { theme } = useUnistyles();
  const bags = useBags();
  const sources = Array.from(
    new Map((bags.data ?? []).flatMap((bag) => bag.sources).map((source) => [source.url, source])).values(),
  );
  return (
    <Collapsible title="Disclosures" icon="shield-checkmark" tint="caution" summary="Risks and issuer information">
      {RISKS.map((risk) => (
        <View key={risk} style={styles.risk}>
          <View style={styles.bullet} />
          <T variant="footnote" tone="secondary" style={styles.flex}>
            {risk}
          </T>
        </View>
      ))}
      {sources.map((source) => (
        <Pressable
          key={source.url}
          accessibilityRole="link"
          accessibilityLabel={`Open ${source.title}`}
          onPress={() => WebBrowser.openBrowserAsync(source.url).catch(() => {})}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <T variant="subhead" numberOfLines={2}>
              {source.title}
            </T>
            <T variant="caption" tone="tertiary">
              {hostOf(source.url)}
            </T>
          </View>
          <Ionicons name="open-outline" size={16} color={theme.ds.accent} />
        </Pressable>
      ))}
    </Collapsible>
  );
}

export default function AccountScreen() {
  const auth = useStockpileAuth();
  const me = useMe();
  const sonner = useSonner();
  const { requestSignIn } = useSignInSheet();
  const [signingOut, setSigningOut] = useState(false);
  const walletAddress = auth.walletAddress ?? me.data?.walletAddress ?? null;
  const email = auth.email ?? me.data?.email ?? null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await auth.logout();
      sonner.success("Signed out");
    } catch {
      sonner.error("Sign out failed");
    } finally {
      setSigningOut(false);
    }
  };

  let apiHost = API_URL;
  try {
    apiHost = new URL(API_URL).host;
  } catch {}

  return (
    <Screen title="Account">
      {!auth.configured ? (
        <HeroState
          gradient="coral"
          icon="lock-closed"
          title="Sign-in is off in this build"
          body="Add the Privy app and client IDs to the app config to enable accounts."
        />
      ) : auth.authenticated ? (
        <>
          <GradientCard gradient="lilac">
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <T variant="title1" style={styles.onGradient}>
                  {(email ?? "?").slice(0, 1).toUpperCase()}
                </T>
              </View>
              <View style={styles.flex}>
                <T variant="title3" numberOfLines={1} style={styles.onGradient}>
                  {email ?? "Signed in"}
                </T>
                <T variant="footnote" style={styles.onGradientSoft}>
                  Signed in with email
                </T>
              </View>
            </View>
          </GradientCard>
          <Card padded={false}>
            {walletAddress ? (
              <CopyRow label="Solana wallet" value={walletAddress} />
            ) : (
              <ListRow title="Solana wallet" detail="Setting up your wallet…" icon="wallet" />
            )}
          </Card>
          {me.isError ? (
            <T variant="footnote" tone="danger">
              Couldn’t reach your Stockpile profile: {me.error.message}
            </T>
          ) : null}
        </>
      ) : (
        <HeroState
          gradient="lilac"
          icon="person"
          accents={["mail", "shield-checkmark"]}
          title="Sign in to Stockpile"
          body="Save bags, see your balance and put money in a bag."
          actionLabel="Sign in"
          actionIcon="mail"
          onAction={() => requestSignIn()}
        />
      )}

      <Disclosures />

      {auth.authenticated ? (
        <PrimaryButton label="Sign out" variant="outline" icon="log-out-outline" loading={signingOut} onPress={signOut} />
      ) : null}

      <T variant="caption" tone="tertiary" align="center" style={styles.version}>
        Stockpile {Constants.expoConfig?.version ?? ""}
        {__DEV__ || apiHost.startsWith("localhost") || apiHost.startsWith("127.") ? ` · ${apiHost}` : ""}
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, gap: 2 },
  onGradient: { color: "#FFFFFF" },
  onGradientSoft: { color: "rgba(255,255,255,0.88)" },
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  risk: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.ds.caution, marginTop: 7 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    ...theme.rounded(14),
    backgroundColor: theme.ds.canvas,
  },
  pressed: { opacity: 0.7 },
  version: { marginTop: 4 },
}));
