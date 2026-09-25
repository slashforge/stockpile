import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useBag } from "@/hooks/use-bags";
import { useStockpileAuth } from "@/providers/auth-context";
import { issuerMarkLabel } from "@/lib/pre-ipo";
import { formatBps } from "@/utils/amounts";
import { AllocationBar, useAssetColors } from "./allocation";
import { BagArt } from "./bag-art";
import { useOpenBuy } from "@/hooks/use-open-buy";
import { bagTradable, researchOnlyReason, TradeStatus } from "./bag-card";
import { Divider, MessageState, Skeleton } from "./layout";
import { PrimaryButton } from "./primary-button";
import { SaveButton } from "./save-button";
import { TokenAvatar } from "./token-avatar";
import { T } from "./type";

type BagSheetContextValue = { openBag: (bagId: string) => void };

const BagSheetContext = createContext<BagSheetContextValue>({
  openBag: () => {},
});

export function useBagSheet() {
  return useContext(BagSheetContext);
}

function BagSheetBody({
  bagId,
  onOpenDetail,
  onBuy,
}: {
  bagId: string;
  onOpenDetail: () => void;
  onBuy: () => void;
}) {
  const { authenticated } = useStockpileAuth();
  const bag = useBag(bagId);
  const colors = useAssetColors(bag.data?.assets ?? []);
  const { theme } = useUnistyles();

  if (!bag.data) {
    return bag.isError ? (
      <MessageState
        tone="error"
        icon="alert-circle-outline"
        title="Bag unavailable"
        body={bag.error.message}
      />
    ) : (
      <View style={styles.loading}>
        <Skeleton height={120} radius={22} />
        <Skeleton height={20} width="60%" />
        <Skeleton height={160} radius={18} />
      </View>
    );
  }

  const data = bag.data;
  const tradable = bagTradable(data);
  return (
    <>
      <BagArt bag={data} height={120} logoSize={44} style={styles.art}>
        <View style={styles.artStatus}>
          <TradeStatus bag={data} onArt />
        </View>
      </BagArt>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <T variant="title2" accessibilityRole="header">
            {data.title}
          </T>
          <T variant="footnote" tone="secondary">
            {data.subtitle}
          </T>
        </View>
        <SaveButton bagId={data.id} title={data.title} variant="circle" />
      </View>

      <AllocationBar assets={data.assets} height={10} />
      <View style={styles.list}>
        {data.assets.map((asset, index) => (
          <View key={`${asset.symbol}-${index}`}>
            {index > 0 ? <Divider inset={56} /> : null}
            <View style={styles.row}>
              <TokenAvatar
                symbol={asset.symbol}
                iconUrl={asset.iconUrl}
                size={40}
                ring={colors[index]}
              />
              <View style={styles.flex}>
                <T variant="headline">{asset.symbol}</T>
                <T variant="caption" tone={asset.mint ? "tertiary" : "caution"}>
                  {asset.mint ? asset.name : "Mint unverified"}
                </T>
                {issuerMarkLabel(asset) ? (
                  <T variant="caption" tone="tertiary" numberOfLines={1}>
                    {issuerMarkLabel(asset)}
                  </T>
                ) : null}
              </View>
              <T variant="title3" style={styles.tabular}>
                {formatBps(asset.weightBps)}
              </T>
            </View>
          </View>
        ))}
      </View>

      {!tradable ? (
        <View style={styles.note}>
          <Ionicons
            name="lock-closed"
            size={13}
            color={theme.ds.inkSecondary}
          />
          <T variant="footnote" tone="secondary" style={styles.flex}>
            {researchOnlyReason(data)}
          </T>
        </View>
      ) : null}
      {tradable ? (
        <PrimaryButton
          label={authenticated ? "Put money in the bag" : "Sign in to buy"}
          icon={authenticated ? "add-circle" : "mail"}
          onPress={onBuy}
        />
      ) : null}
      <PrimaryButton
        label="See details"
        icon="arrow-forward"
        variant={tradable ? "ghost" : "solid"}
        size={tradable ? "md" : "lg"}
        onPress={onOpenDetail}
      />
    </>
  );
}

/** Provides `openBag(id)`, which presents a bottom sheet summarising a bag. */
export function BagSheetProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<BottomSheetModal>(null);
  const [bagId, setBagId] = useState<string | null>(null);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const openBag = useCallback((id: string) => {
    setBagId(id);
    ref.current?.present();
  }, []);

  const openBuy = useOpenBuy();
  const buy = useCallback(() => {
    if (!bagId) return;
    const id = bagId;
    ref.current?.dismiss();
    // Let the preview sheet finish dismissing before the native sheet presents.
    setTimeout(() => openBuy(id), 350);
  }, [bagId, openBuy]);

  const openDetail = useCallback(() => {
    if (!bagId) return;
    ref.current?.dismiss();
    router.push({ pathname: "/bag/[id]", params: { id: bagId } });
  }, [bagId]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.35}
      />
    ),
    [],
  );

  const value = useMemo(() => ({ openBag }), [openBag]);

  return (
    <BagSheetContext.Provider value={value}>
      {children}
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        maxDynamicContentSize={680}
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: theme.ds.surface,
          borderRadius: 32,
        }}
        handleIndicatorStyle={{
          backgroundColor: theme.ds.lineStrong,
          width: 40,
        }}
        onDismiss={() => setBagId(null)}
        accessibilityLabel="Bag summary"
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom },
          ]}
        >
          {bagId ? (
            <BagSheetBody bagId={bagId} onOpenDetail={openDetail} onBuy={buy} />
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </BagSheetContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.density.gutter,
    paddingTop: theme.density.sheetTop,
    gap: theme.density.stack,
  },
  loading: { gap: theme.density.stack },
  art: { ...theme.rounded(22) },
  artStatus: { position: "absolute", top: 10, right: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: theme.density.rowGap },
  flex: { flex: 1, gap: 2 },
  list: {
    backgroundColor: theme.ds.canvas,
    ...theme.rounded(20),
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.density.rowGap,
    paddingHorizontal: theme.density.rowY,
    paddingVertical: 8,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  note: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
}));
