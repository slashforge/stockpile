import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { GradientCard } from "@/components/stockpile/gradient-card";
import { HeroState } from "@/components/stockpile/hero-state";
import { Card, CardSkeleton, Divider, Screen, Section } from "@/components/stockpile/layout";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { T } from "@/components/stockpile/type";
import { usePortfolio } from "@/hooks/use-account";
import { indexAssetsByMint, useBags } from "@/hooks/use-bags";
import { useSonner } from "@/hooks/use-sonner";
import { USDC_MINT } from "@/lib/solana/transaction";
import { spendableUsdc } from "@/lib/trade/balance";
import { useStockpileAuth } from "@/providers/auth-context";
import type { Portfolio } from "@/services/api/types";
import { formatMoney, formatTokenAmount, formatUiAmount, shortAddress } from "@/utils/amounts";

function formatAsOf(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function WalletCard({ address, portfolio }: { address: string; portfolio: Portfolio }) {
  const sonner = useSonner();
  const usdc = spendableUsdc(portfolio);
  return (
    <GradientCard gradient="blue">
      <T variant="subhead" style={styles.onGradientSoft}>
        USDC available
      </T>
      <T variant="display" style={[styles.onGradient, styles.tabular]} numberOfLines={1} adjustsFontSizeToFit>
        {usdc.status === "known" ? formatMoney(usdc.raw.toString(), usdc.decimals) : "—"}
      </T>
      {usdc.status === "unknown" ? (
        <T variant="footnote" style={styles.onGradientSoft}>
          {usdc.reason}
        </T>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy wallet address"
        onPress={async () => {
          await Clipboard.setStringAsync(address);
          sonner.success("Copied");
        }}
        style={({ pressed }) => [styles.addressPill, pressed && styles.pressed]}
      >
        <Ionicons name="wallet" size={14} color="#FFFFFF" />
        <T variant="footnote" style={[styles.onGradient, styles.tabular]}>
          {shortAddress(address, 6)}
        </T>
        <Ionicons name="copy-outline" size={14} color="#FFFFFF" />
      </Pressable>
    </GradientCard>
  );
}

function PortfolioBody() {
  const portfolio = usePortfolio();
  const bags = useBags();
  const { walletAddress: embeddedWallet } = useStockpileAuth();

  if (portfolio.isPending) return <CardSkeleton />;
  if (portfolio.isError) {
    return (
      <HeroState
        gradient="coral"
        icon="cloud-offline"
        title="Couldn’t load your portfolio"
        body={portfolio.error.message}
        actionLabel="Try again"
        actionIcon="refresh"
        onAction={() => portfolio.refetch()}
      />
    );
  }

  const data = portfolio.data;
  const walletAddress = data.walletAddress ?? embeddedWallet;
  const assets = indexAssetsByMint(bags.data);
  const tokens = data.holdings.filter((holding) => holding.amount !== "0" && holding.mint !== USDC_MINT);
  const asOf = formatAsOf(data.asOf);

  return (
    <>
      {walletAddress ? <WalletCard address={walletAddress} portfolio={data} /> : null}

      {data.status !== "live" ? (
        <HeroState
          compact
          gradient="sky"
          icon="pulse"
          title="Balances unavailable"
          body={data.message ?? "We couldn’t read your on-chain balances right now."}
          actionLabel="Check again"
          actionIcon="refresh"
          onAction={() => portfolio.refetch()}
        />
      ) : tokens.length === 0 ? (
        <HeroState
          compact
          gradient="lilac"
          icon="layers"
          accents={["add", "sparkles"]}
          title="No tokens yet"
          body="Put money in a bag and its tokens show up here."
          actionLabel="Browse bags"
          actionIcon="layers"
          onAction={() => router.navigate("/bags")}
        />
      ) : (
        <Section title="Tokens" caption={asOf ? `On-chain · ${asOf}` : "On-chain balances"}>
          <Card padded={false}>
            {tokens.map((holding, index) => {
              const asset = assets.get(holding.mint);
              const symbol = asset?.symbol ?? shortAddress(holding.mint);
              return (
                <View key={holding.mint}>
                  {index > 0 ? <Divider inset={72} /> : null}
                  <View style={styles.row}>
                    <TokenAvatar symbol={symbol} iconUrl={asset?.iconUrl} size={44} />
                    <View style={styles.flex}>
                      <T variant="headline">{symbol}</T>
                      <T variant="footnote" tone="secondary" numberOfLines={1}>
                        {asset?.name ?? "Not in a Stockpile bag"}
                      </T>
                    </View>
                    <T variant="numeric">
                      {holding.uiAmount != null
                        ? formatUiAmount(holding.uiAmount)
                        : formatTokenAmount(holding.amount, holding.decimals, asset?.uiAmountMultiplier ?? 1)}
                    </T>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
      )}
    </>
  );
}

export default function PortfolioScreen() {
  const portfolio = usePortfolio();
  const { authenticated } = useStockpileAuth();
  return (
    <Screen
      title="Portfolio"
      onRefresh={authenticated ? () => portfolio.refetch() : undefined}
    >
      <AuthGate
        gradient="blue"
        icon="pie-chart"
        accents={["wallet", "layers"]}
        title="Your bags, on-chain"
        body="Sign in to see your wallet balance and the tokens you hold."
      >
        <PortfolioBody />
      </AuthGate>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  onGradient: { color: "#FFFFFF" },
  onGradientSoft: { color: "rgba(255,255,255,0.88)" },
  tabular: { fontVariant: ["tabular-nums"] },
  addressPill: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    minHeight: 38,
    marginTop: 4,
  },
  pressed: { opacity: 0.7 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  flex: { flex: 1, gap: 2 },
}));
