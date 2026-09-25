import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Share, View } from "react-native";
import QRCodeStyled from "react-native-qrcode-styled";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { usePortfolio } from "@/hooks/use-account";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { isLowSol } from "@/lib/funding";
import { solBalance } from "@/lib/trade/balance";
import { useStockpileAuth } from "@/providers/auth-context";
import { Notice, Pill } from "./layout";
import { NativeSheet } from "./native-sheet";
import { PrimaryButton } from "./primary-button";
import { T } from "./type";

/** "Low SOL" marker for wallet cards, shown only for a known balance under the fee threshold. */
export function LowSolPill() {
  const portfolio = usePortfolio();
  if (!isLowSol(solBalance(portfolio.data))) return null;
  return <Pill label="Low SOL for fees" tone="caution" icon="flash-outline" />;
}

function FundBody({ address }: { address: string }) {
  const { theme } = useUnistyles();
  const { fundWithCard } = useStockpileAuth();
  const portfolio = usePortfolio();
  const [opening, setOpening] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const lowSol = isLowSol(solBalance(portfolio.data));
  // Inline feedback: the toast layer renders behind the native sheet.
  const { copied, copy } = useCopyFeedback();

  return (
    <View style={styles.body}>
      <View
        style={styles.qrCard}
        accessible
        accessibilityLabel="QR code of your Solana wallet address"
      >
        <QRCodeStyled
          data={address}
          pieceSize={8}
          pieceBorderRadius={2.5}
          isPiecesGlued
          padding={8}
          color={theme.ds.ink}
          style={styles.qr}
        />
      </View>

      <View style={styles.actions}>
        <View style={styles.flex}>
          <PrimaryButton
            label={copied ? "Copied" : "Copy address"}
            variant="outline"
            size="md"
            icon={copied ? "checkmark" : "copy-outline"}
            onPress={() => copy(address).catch(() => {})}
          />
        </View>
        <View style={styles.flex}>
          <PrimaryButton
            label="Share"
            variant="outline"
            size="md"
            icon="share-outline"
            onPress={() => Share.share({ message: address }).catch(() => {})}
          />
        </View>
      </View>

      {fundWithCard ? (
        <PrimaryButton
          label="Buy USDC with card"
          icon="card"
          size="md"
          loading={opening}
          onPress={async () => {
            setOpening(true);
            setCardError(null);
            try {
              await fundWithCard();
            } catch (error) {
              setCardError(
                error instanceof Error
                  ? error.message
                  : "Card purchase is unavailable right now",
              );
            } finally {
              setOpening(false);
            }
          }}
        />
      ) : null}

      {fundWithCard && cardError ? (
        <Notice tone="error">
          <T variant="footnote" tone="danger">
            {cardError}
          </T>
        </Notice>
      ) : null}

      {lowSol ? (
        <T variant="caption" tone="caution" align="center">
          Add ~0.01 SOL to this address for network fees
        </T>
      ) : null}
    </View>
  );
}

type FundSheetValue = { openFund: () => void };

const FundSheetContext = createContext<FundSheetValue>({ openFund: () => {} });

export function useFundSheet() {
  return useContext(FundSheetContext);
}

export function FundSheetProvider({ children }: { children: React.ReactNode }) {
  const { walletAddress } = useStockpileAuth();
  const [open, setOpen] = useState(false);
  const openFund = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openFund }), [openFund]);

  return (
    <FundSheetContext.Provider value={value}>
      {children}
      <NativeSheet
        isPresented={open && !!walletAddress}
        onDismiss={close}
        fit
        testID="fund-sheet"
      >
        {walletAddress ? <FundBody address={walletAddress} /> : <View />}
      </NativeSheet>
    </FundSheetContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.density.sheetGap, paddingTop: theme.density.sheetTop, paddingBottom: theme.density.sheetTop },
  flex: { flex: 1 },
  qrCard: {
    alignSelf: "center",
    padding: 10,
    marginBottom: 4,
    ...theme.rounded(28),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.ds.line,
  },
  qr: { backgroundColor: "#FFFFFF" },
  actions: { flexDirection: "row", gap: theme.density.item },
}));
