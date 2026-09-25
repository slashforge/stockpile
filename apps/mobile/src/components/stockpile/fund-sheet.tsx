import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { type LayoutChangeEvent, Share, View } from "react-native";
import QRCodeStyled, { useQRCodeData } from "react-native-qrcode-styled";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useCopyFeedback } from "@/hooks/use-copy-feedback";
import { useStockpileAuth } from "@/providers/auth-context";
import { Notice } from "./layout";
import { NativeSheet } from "./native-sheet";
import { PrimaryButton } from "./primary-button";
import { T } from "./type";

/** Quiet zone inside the white card, matching the sheet's own side gutter. */
const QR_INSET = 16;

/** Address QR that fills the card width so the inset reads the same on all four sides. */
function AddressQr({ address }: { address: string }) {
  const { theme } = useUnistyles();
  // Same options as the component below (both default to level M).
  const { qrCodeSize } = useQRCodeData(address, {});
  const [width, setWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width),
    [],
  );
  const pieceSize =
    width > 0 && qrCodeSize > 0
      ? Math.floor((width - QR_INSET * 2) / qrCodeSize)
      : 0;

  return (
    <View
      style={styles.qrCard}
      onLayout={onLayout}
      accessible
      accessibilityLabel="QR code of your Solana wallet address"
    >
      {pieceSize > 0 ? (
        <QRCodeStyled
          data={address}
          pieceSize={pieceSize}
          pieceBorderRadius={pieceSize * 0.3}
          isPiecesGlued
          padding={QR_INSET}
          color={theme.ds.ink}
          style={styles.qr}
        />
      ) : null}
    </View>
  );
}

function FundBody({ address }: { address: string }) {
  const { fundWithCard } = useStockpileAuth();
  const [opening, setOpening] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  // Inline feedback: the toast layer renders behind the native sheet.
  const { copied, copy } = useCopyFeedback();

  return (
    <View style={styles.body}>
      <AddressQr address={address} />

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
    alignSelf: "stretch",
    alignItems: "center",
    aspectRatio: 1,
    justifyContent: "center",
    ...theme.rounded(28),
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: theme.ds.line,
    overflow: "hidden",
  },
  qr: { backgroundColor: "#FFFFFF" },
  actions: { flexDirection: "row", gap: theme.density.item },
}));
