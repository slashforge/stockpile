import React from "react";
import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Box, Text } from "@/components/ui/primitives";
import { TokenImage } from "@/components/ui/token-image";

const TOKEN_LOGOS = {
  SOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  USDC: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
  USDT: "https://coin-images.coingecko.com/coins/images/325/small/Tether.png",
};

type IllustrationProps = {
  isDark: boolean;
};

const CARD_WIDTH = 260;
const CARD_HEIGHT = 340;
const MINI_CARD_WIDTH = (CARD_WIDTH - 48) / 2;

function MiniCard({
  icon,
  iconBg,
  title,
  subtitle,
  highlight,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <Box
      style={[
        s.miniCard,
        highlight && s.miniCardHighlight,
      ]}
    >
      <Box style={[s.iconCircle, { backgroundColor: iconBg }]} center>
        <Feather name={icon as any} size={14} color="#fff" />
      </Box>
      <Text size="xs" weight="semibold" numberOfLines={1}>
        {title}
      </Text>
      <Text size="xs" mode="subtle" numberOfLines={2} style={s.miniCardSub}>
        {subtitle}
      </Text>
    </Box>
  );
}

function ActionPill({
  icon,
  label,
  isDark,
}: {
  icon: string;
  label: string;
  isDark: boolean;
}) {
  const iconColor = isDark ? "#000" : "#fff";
  return (
    <Box style={s.pill} background="inverse" direction="row" gap="xs" center>
      <Feather name={icon as any} size={12} color={iconColor} />
      <Text size="xs" weight="semibold" inverse>
        {label}
      </Text>
    </Box>
  );
}

export function InvoicingIllustration({ isDark }: IllustrationProps) {
  return (
    <Box style={s.frame} background="base" rounded="xl">
      <Box alignItems="center" mb="sm">
        <Text size="xs" mode="subtle">Outstanding</Text>
        <Text size="mega" weight="bold">
          $2,450<Text size="md" mode="subtle">.00</Text>
        </Text>
      </Box>

      <Box direction="row" justifyContent="center" gap="xs" mb="sm">
        <ActionPill icon="plus" label="New Invoice" isDark={isDark} />
        <ActionPill icon="users" label="New Client" isDark={isDark} />
      </Box>

      <Box direction="row" style={s.grid}>
        <MiniCard
          icon="file-text"
          iconBg="#E8956A"
          title="Create Invoice"
          subtitle="Bill a client and track payments."
        />
        <MiniCard
          icon="users"
          iconBg="#9B8FE8"
          title="Add Client"
          subtitle="Save client details."
        />
        <MiniCard
          icon="briefcase"
          iconBg="#6AADE8"
          title="View Clients"
          subtitle="Manage your contacts."
        />
        <MiniCard
          icon="download"
          iconBg="#4ADE80"
          title="Receive"
          subtitle="Get paid instantly."
          highlight
        />
      </Box>
    </Box>
  );
}

export function WalletIllustration({ isDark }: IllustrationProps) {
  return (
    <Box style={s.frame} background="base" rounded="xl">
      <Box alignItems="center" mb="sm">
        <Text size="xs" mode="subtle">Total Balance</Text>
        <Text size="mega" weight="bold">
          $8,342<Text size="md" mode="subtle">.50</Text>
        </Text>
      </Box>

      <Box direction="row" justifyContent="center" gap="xs" mb="sm">
        <ActionPill icon="arrow-down" label="Receive" isDark={isDark} />
        <ActionPill icon="repeat" label="Swap" isDark={isDark} />
        <ActionPill icon="arrow-up" label="Send" isDark={isDark} />
      </Box>

      <Box direction="row" style={s.grid}>
        <MiniCard
          icon="dollar-sign"
          iconBg="#6AADE8"
          title="USD & EUR"
          subtitle="Move money between Solana and bank."
        />
        <MiniCard
          icon="layers"
          iconBg="#9B8FE8"
          title="Swap Tokens"
          subtitle="Invest in tokens and build portfolio."
        />
        <MiniCard
          icon="file-text"
          iconBg="#E8956A"
          title="Send Invoices"
          subtitle="Bill clients privately."
        />
        <MiniCard
          icon="download"
          iconBg="#4ADE80"
          title="Receive"
          subtitle="Share address or QR."
          highlight
        />
      </Box>
    </Box>
  );
}

function TokenRow({
  logo,
  symbol,
  name,
  amount,
  value,
}: {
  logo: string;
  symbol: string;
  name: string;
  amount: string;
  value: string;
}) {
  return (
    <Box direction="row" alignItems="center" py="xs">
      <TokenImage uri={logo} style={s.tokenLogo} fallbackText={symbol} />
      <Box flex>
        <Text size="xs" weight="semibold">{symbol}</Text>
        <Text size="xs" mode="subtle" style={s.tokenRowSub}>{name}</Text>
      </Box>
      <Box alignItems="flex-end">
        <Text size="xs" weight="semibold">{amount}</Text>
        <Text size="xs" mode="subtle" style={s.tokenRowSub}>{value}</Text>
      </Box>
    </Box>
  );
}

export function SwapIllustration({ isDark }: IllustrationProps) {
  return (
    <Box style={s.frame} background="base" rounded="xl">
      <Box direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Text size="xs" weight="semibold" mode="subtle" style={s.fieldLabel}>YOU PAY</Text>
          <Box style={s.tokenPill} background="subtle" direction="row" gap="xs" center>
            <TokenImage uri={TOKEN_LOGOS.SOL} style={s.tokenLogoSmall} fallbackText="S" />
            <Text size="sm" weight="bold">SOL</Text>
            <Feather name="chevron-down" size={12} color={isDark ? "#888" : "#aab"} />
          </Box>
        </Box>
        <Text size="xxl" weight="bold">2.5</Text>
      </Box>

      <Box alignItems="center" style={s.swapIconRow}>
        <Box style={s.swapCircle} background="subtle" center>
          <Feather name="arrow-down" size={16} color={isDark ? "#9B8FE8" : "#6A5ACD"} />
        </Box>
      </Box>

      <Box direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Text size="xs" weight="semibold" mode="subtle" style={s.fieldLabel}>YOU RECEIVE</Text>
          <Box style={s.tokenPill} background="subtle" direction="row" gap="xs" center>
            <TokenImage uri={TOKEN_LOGOS.USDC} style={s.tokenLogoSmall} fallbackText="U" />
            <Text size="sm" weight="bold">USDC</Text>
            <Feather name="chevron-down" size={12} color={isDark ? "#888" : "#aab"} />
          </Box>
        </Box>
        <Text size="xxl" weight="bold">374.25</Text>
      </Box>

      <Box direction="row" justifyContent="center" alignItems="center" gap="xs" mt="xs" mb="xs">
        <Feather name="zap" size={12} color="#4ADE80" />
        <Text size="xs" mode="subtle">Best rate via Jupiter</Text>
      </Box>

      <Box style={s.swapButton} background="inverse" center rounded="full">
        <Text size="sm" weight="bold" inverse>Swap</Text>
      </Box>

      <Box mt="xs" style={s.tokenList} background="subtle" rounded="lg" px="sm" py="xs">
        <TokenRow logo={TOKEN_LOGOS.SOL} symbol="SOL" name="Solana" amount="12.5" value="$1,871.25" />
        <TokenRow logo={TOKEN_LOGOS.USDC} symbol="USDC" name="USD Coin" amount="540.00" value="$540.00" />
      </Box>
    </Box>
  );
}

const s = StyleSheet.create((theme) => ({
  frame: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    shadowColor: theme.colors.contrast.base,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  grid: {
    flexWrap: "wrap",
    gap: 8,
  },
  miniCard: {
    width: MINI_CARD_WIDTH,
    borderRadius: theme.radius.lg,
    padding: 12,
    backgroundColor: theme.colors.background.subtle,
  },
  miniCardHighlight: {
    backgroundColor: theme.colors.background.emphasis,
  },
  miniCardSub: {
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.md,
    marginBottom: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  tokenPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  tokenLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
  },
  tokenLogoSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  fieldLabel: {
    letterSpacing: 1,
    marginBottom: 6,
  },
  swapIconRow: {
    marginVertical: -4,
    zIndex: 1,
  },
  swapCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swapButton: {
    paddingVertical: 8,
  },
  tokenList: {
    gap: 2,
  },
  tokenRowSub: {
    fontSize: 9,
    lineHeight: 12,
  },
}));
