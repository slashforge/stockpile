import { QRCodeSVG } from "qrcode.react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { IoCard, IoCheckmark, IoCopyOutline, IoShareOutline } from "react-icons/io5";
import { PrimaryButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { T } from "@/components/ui/type";
import { useStockpileAuth } from "@/providers/auth-context";
import { shortAddress } from "@/utils/amounts";
import { Sheet } from "./sheet";

export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);
  return { copied, copy };
}

function FundBody({ address }: { address: string }) {
  const { fundWithCard } = useStockpileAuth();
  const [opening, setOpening] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const { copied, copy } = useCopyFeedback();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex flex-col gap-2.5 overflow-y-auto px-4 pb-4 pt-6">
      <div className="flex flex-col gap-1 pr-10">
        <T as="h2" variant="title2">
          Add funds
        </T>
        <T variant="callout" tone="secondary">
          Send USDC on Solana to your wallet. It shows up in a few seconds.
        </T>
      </div>
      <div
        className="mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center rounded-[28px] border border-line bg-white p-4"
        role="img"
        aria-label="QR code of your Solana wallet address"
      >
        <QRCodeSVG value={address} size={512} className="size-full" fgColor="#10131F" bgColor="#FFFFFF" level="M" />
      </div>
      <T variant="numeric" align="center" className="break-all text-[13px] text-ink-2">
        {shortAddress(address, 10)}
      </T>
      <div className="flex gap-2">
        <PrimaryButton
          className="flex-1"
          label={copied ? "Copied" : "Copy address"}
          variant="outline"
          size="md"
          icon={copied ? IoCheckmark : IoCopyOutline}
          onClick={() => copy(address).catch(() => {})}
        />
        {canShare ? (
          <PrimaryButton
            className="flex-1"
            label="Share"
            variant="outline"
            size="md"
            icon={IoShareOutline}
            onClick={() => navigator.share({ text: address }).catch(() => {})}
          />
        ) : null}
      </div>
      {fundWithCard ? (
        <PrimaryButton
          label="Buy USDC with card"
          icon={IoCard}
          size="md"
          loading={opening}
          onClick={async () => {
            setOpening(true);
            setCardError(null);
            try {
              await fundWithCard();
            } catch (error) {
              setCardError(error instanceof Error ? error.message : "Card purchase is unavailable right now");
            } finally {
              setOpening(false);
            }
          }}
        />
      ) : null}
      {cardError ? (
        <Notice tone="error">
          <T variant="footnote" tone="danger">
            {cardError}
          </T>
        </Notice>
      ) : null}
      <T variant="caption" tone="tertiary" align="center">
        Only send USDC on the Solana network to this address.
      </T>
    </div>
  );
}

type FundSheetValue = { openFund: () => void };

const FundSheetContext = createContext<FundSheetValue>({ openFund: () => {} });

export function useFundSheet() {
  return useContext(FundSheetContext);
}

export function FundSheetProvider({ children }: { children: ReactNode }) {
  const { walletAddress } = useStockpileAuth();
  const [open, setOpen] = useState(false);
  const openFund = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openFund }), [openFund]);
  return (
    <FundSheetContext.Provider value={value}>
      {children}
      <Sheet open={open && !!walletAddress} onClose={close} label="Add funds" size="sm">
        {walletAddress ? <FundBody address={walletAddress} /> : null}
      </Sheet>
    </FundSheetContext.Provider>
  );
}
