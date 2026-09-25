import { Ionicons } from "@expo/vector-icons";
import { LegendList } from "@legendapp/list/react-native";
import { router } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
import { NativeSheet } from "./native-sheet";
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
  bottomInset,
}: {
  bagId: string;
  onOpenDetail: () => void;
  onBuy: () => void;
  bottomInset: number;
}) {
  const { authenticated } = useStockpileAuth();
  const bag = useBag(bagId);
  const assets = bag.data?.assets ?? [];
  const colors = useAssetColors(assets);
  const { theme } = useUnistyles();

  if (!bag.data) {
    return (
      <View style={[styles.fill, styles.content]}>
        {bag.isError ? (
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
        )}
      </View>
    );
  }

  const data = bag.data;
  const tradable = bagTradable(data);
  const last = data.assets.length - 1;

  const header = (
    <View style={styles.header}>
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
    </View>
  );

  return (
    <View style={styles.fill}>
      <LegendList
        data={data.assets}
        keyExtractor={(asset, index) => `${asset.symbol}-${index}`}
        estimatedItemSize={64}
        recycleItems
        ListHeaderComponent={header}
        style={styles.fill}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Bag summary"
        renderItem={({ item: asset, index }) => (
          <View
            style={[
              styles.listRow,
              index === 0 && styles.listFirst,
              index === last && styles.listLast,
            ]}
          >
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
        )}
      />

      <View style={[styles.footer, { paddingBottom: bottomInset + 12 }]}>
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
      </View>
    </View>
  );
}

/** Provides `openBag(id)`, which presents a native bottom sheet summarising a bag. */
export function BagSheetProvider({ children }: { children: React.ReactNode }) {
  const [bagId, setBagId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const openBag = useCallback((id: string) => {
    setBagId(id);
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    setBagId(null);
  }, []);

  const openBuy = useOpenBuy();
  const buy = useCallback(() => {
    if (!bagId) return;
    const id = bagId;
    dismiss();
    // Let the preview sheet finish dismissing before the buy sheet presents.
    setTimeout(() => openBuy(id), 350);
  }, [bagId, dismiss, openBuy]);

  const openDetail = useCallback(() => {
    if (!bagId) return;
    const id = bagId;
    dismiss();
    router.push({ pathname: "/bag/[id]", params: { id } });
  }, [bagId, dismiss]);

  const value = useMemo(() => ({ openBag }), [openBag]);

  return (
    <BagSheetContext.Provider value={value}>
      {children}
      <NativeSheet isPresented={open && !!bagId} onDismiss={dismiss} testID="bag-sheet">
        {bagId ? (
          <BagSheetBody bagId={bagId} onOpenDetail={openDetail} onBuy={buy} bottomInset={insets.bottom} />
        ) : (
          <View style={styles.fill} />
        )}
      </NativeSheet>
    </BagSheetContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  content: {
    paddingTop: theme.density.sheetTop,
    gap: theme.density.stack,
  },
  header: { gap: theme.density.stack, paddingBottom: theme.density.stack },
  listContent: { paddingTop: theme.density.sheetTop, paddingBottom: theme.density.stack },
  // Rows are separate list cells, so the card background and its rounded ends live on each row.
  listRow: { backgroundColor: theme.ds.canvas },
  listFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderCurve: "continuous", paddingTop: 4 },
  listLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20, borderCurve: "continuous", paddingBottom: 4 },
  footer: {
    gap: 8,
    paddingTop: theme.density.rowY,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ds.line,
  },
  loading: { gap: theme.density.stack },
  art: { ...theme.rounded(22) },
  artStatus: { position: "absolute", top: 10, right: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: theme.density.rowGap },
  flex: { flex: 1, gap: 2 },
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
