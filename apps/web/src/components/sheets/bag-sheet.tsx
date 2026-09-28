import { useNavigate } from "@tanstack/react-router";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { IoAddCircle, IoAlertCircleOutline, IoArrowForward, IoLockClosed, IoMail } from "react-icons/io5";
import { AllocationBar, useAssetColors } from "@/components/stockpile/allocation";
import { BagArt } from "@/components/stockpile/bag-art";
import { bagTradable, researchOnlyReason, TradeStatus } from "@/components/stockpile/bag-card";
import { SaveButton } from "@/components/stockpile/save-button";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { PrimaryButton } from "@/components/ui/button";
import { Divider, MessageState, Skeleton } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { useBag } from "@/hooks/use-bags";
import { useOpenBuy } from "@/hooks/use-navigation";
import { issuerMarkLabel } from "@/lib/pre-ipo";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatBps } from "@/utils/amounts";
import { Sheet } from "./sheet";

type BagSheetValue = { openBag: (bagId: string) => void };

const BagSheetContext = createContext<BagSheetValue>({ openBag: () => {} });

export function useBagSheet() {
  return useContext(BagSheetContext);
}

function BagSheetBody({ bagId, onOpenDetail, onBuy }: { bagId: string; onOpenDetail: () => void; onBuy: () => void }) {
  const { authenticated } = useStockpileAuth();
  const bag = useBag(bagId);
  const colors = useAssetColors(bag.data?.assets ?? []);

  if (!bag.data) {
    return (
      <div className="flex flex-col gap-3 p-4 pt-6">
        {bag.isError ? (
          <MessageState tone="error" icon={IoAlertCircleOutline} title="Bag unavailable" body={bag.error.message} />
        ) : (
          <>
            <Skeleton height={120} radius={22} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={160} radius={18} />
          </>
        )}
      </div>
    );
  }

  const data = bag.data;
  const tradable = bagTradable(data);
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3 pt-5">
        <BagArt bag={data} height={120} logoSize={44} className="shrink-0 rounded-[22px]">
          <div className="absolute right-2.5 top-2.5">
            <TradeStatus bag={data} onArt />
          </div>
        </BagArt>
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <T as="h2" variant="title2">
              {data.title}
            </T>
            <T variant="footnote" tone="secondary">
              {data.subtitle}
            </T>
          </div>
          <SaveButton bagId={data.id} title={data.title} variant="circle" />
        </div>
        <AllocationBar assets={data.assets} height={10} />
        <div className="rounded-[20px] bg-surface py-1">
          {data.assets.map((asset, index) => (
            <div key={`${asset.symbol}-${index}`}>
              {index > 0 ? <Divider inset={64} /> : null}
              <div className="flex items-center gap-2.5 px-3 py-2">
                <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={40} ring={colors[index]} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <T variant="headline">{asset.symbol}</T>
                  <T variant="caption" tone={asset.mint ? "tertiary" : "caution"} lines={1}>
                    {asset.mint ? asset.name : "Mint unverified"}
                  </T>
                  {issuerMarkLabel(asset) ? (
                    <T variant="caption" tone="tertiary" lines={1}>
                      {issuerMarkLabel(asset)}
                    </T>
                  ) : null}
                </div>
                <T variant="title3" className="tabular-nums">
                  {formatBps(asset.weightBps)}
                </T>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-4 pb-4 pt-3">
        {!tradable ? (
          <div className="flex items-center justify-center gap-1.5 text-ink-2">
            <IoLockClosed size={13} />
            <T variant="footnote" tone="secondary">
              {researchOnlyReason(data)}
            </T>
          </div>
        ) : null}
        {tradable ? (
          <PrimaryButton
            label={authenticated ? "Put money in the bag" : "Sign in to buy"}
            icon={authenticated ? IoAddCircle : IoMail}
            onClick={onBuy}
          />
        ) : null}
        <PrimaryButton
          label="See details"
          icon={IoArrowForward}
          variant={tradable ? "ghost" : "solid"}
          size={tradable ? "md" : "lg"}
          onClick={onOpenDetail}
        />
      </div>
    </>
  );
}

/** Provides `openBag(id)`, which presents a sheet summarising a bag. */
export function BagSheetProvider({ children }: { children: ReactNode }) {
  const [bagId, setBagId] = useState<string | null>(null);
  const navigate = useNavigate();
  const openBuy = useOpenBuy();

  const openBag = useCallback((id: string) => setBagId(id), []);
  const dismiss = useCallback(() => setBagId(null), []);

  const buy = useCallback(() => {
    if (!bagId) return;
    const id = bagId;
    dismiss();
    openBuy(id);
  }, [bagId, dismiss, openBuy]);

  const openDetail = useCallback(() => {
    if (!bagId) return;
    const id = bagId;
    dismiss();
    navigate({ to: "/bag/$id", params: { id } });
  }, [bagId, dismiss, navigate]);

  const value = useMemo(() => ({ openBag }), [openBag]);

  return (
    <BagSheetContext.Provider value={value}>
      {children}
      <Sheet open={!!bagId} onClose={dismiss} label="Bag summary">
        {bagId ? <BagSheetBody bagId={bagId} onOpenDetail={openDetail} onBuy={buy} /> : null}
      </Sheet>
    </BagSheetContext.Provider>
  );
}
