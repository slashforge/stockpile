import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { IoAddCircle, IoAlertCircleOutline, IoLockClosed, IoPersonCircle, IoWalletOutline } from "react-icons/io5";
import { bagTradable, researchOnlyReason } from "@/components/stockpile/bag-card";
import { UsdcLogo } from "@/components/stockpile/token-avatar";
import { Chip, heroSize, Numpad } from "@/components/trade/controls";
import { useBuyFlow } from "@/components/trade/flows";
import { PrimaryButton } from "@/components/ui/button";
import { MessageState, Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { type AmountKey, applyAmountKey, clampAmountDecimals, formatAmountInput } from "@/lib/trade/amount-input";
import { tradeErrorMessage } from "@/lib/trade/legs";
import { useStockpileAuth } from "@/providers/auth-context";
import { formatBaseUnits, formatMoney } from "@/utils/amounts";

export const Route = createFileRoute("/buy/$bagId/")({ component: BuyAmountScreen });

const PRESETS = ["10", "25", "50", "100"];
const KEYS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "."]);

function BuyAmountScreen() {
  const flow = useBuyFlow();
  const auth = useStockpileAuth();
  const navigate = useNavigate();
  const { bag, balance, amountInput, amountPending, amount, insufficient, needsFunds, request, prepare, prepared } = flow;

  const setAmount = (next: string) => {
    flow.setAmount(next);
    prepare.reset();
  };
  const pressKey = (key: AmountKey) => setAmount(applyAmountKey(amountInput, key));

  const review = async () => {
    if (!request || insufficient || prepare.isPending) return;
    // The bag may still be the list's placeholder: the review validates every swap against the
    // bag's assets, so always build against a fresh copy.
    if (bag.isPlaceholderData || bag.isError) {
      const fresh = await bag.refetch();
      if (!fresh.data) return;
    }
    flow.runPrepare(request, {
      onDone: (data) => {
        if (data.status === "ready" && data.transactions.length > 0) {
          navigate({ to: "/buy/$bagId/review", params: { bagId: flow.bagId } });
        }
      },
    });
  };

  // Typing works like the keypad.
  const ready = !!bag.data && auth.authenticated && !!auth.walletAddress && bagTradable(bag.data);
  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector("[role=dialog]")) return;
      if (KEYS.has(event.key)) pressKey(event.key as AmountKey);
      else if (event.key === "Backspace") pressKey("delete");
      else if (event.key === "Enter" && !needsFunds) review();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!bag.data) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-4 pt-6">
        {bag.isError ? (
          <MessageState tone="error" icon={IoAlertCircleOutline} title="Bag unavailable" body={bag.error.message} />
        ) : (
          <>
            <Skeleton height={84} width="60%" radius={20} />
            <Skeleton height={260} radius={24} />
          </>
        )}
      </div>
    );
  }
  if (!auth.authenticated) {
    return <MessageState icon={IoPersonCircle} title="Sign in to continue" body="Sign in to put money in this bag." />;
  }
  if (!bagTradable(bag.data)) {
    return (
      <MessageState
        icon={IoLockClosed}
        title="Not open for buying yet"
        body={researchOnlyReason(bag.data)}
        actionLabel="Close"
        onAction={flow.close}
      />
    );
  }
  if (!auth.walletAddress) {
    return (
      <MessageState
        icon={IoWalletOutline}
        title="Setting up your wallet"
        body="Your Solana wallet isn't ready yet. This usually takes a few seconds after your first sign-in."
      />
    );
  }

  const balanceText =
    balance.status === "known" ? `${formatMoney(balance.raw.toString(), balance.decimals)} USDC available` : balance.reason;
  const unavailable =
    !prepare.isPending &&
    prepared?.status === "unavailable" &&
    prepared.amount === amount &&
    prepared.slippageBps === flow.slippageBps
      ? tradeErrorMessage(prepared.error, prepared.message ?? "The swaps couldn’t be built right now.")
      : null;
  const error = prepare.isError
    ? prepare.error.message
    : bag.isError && bag.isPlaceholderData
      ? "Couldn’t refresh this bag. Check your connection and try again."
      : unavailable;
  const heroText = amountPending ? "—" : `$${formatAmountInput(amountInput)}`;

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
      <div className="flex min-h-[130px] flex-1 flex-col items-center justify-center gap-2">
        <T
          className={cn("w-full text-center font-extrabold tabular-nums", heroSize(heroText), !amount && "text-ink-3")}
          aria-label={amountPending ? "Amount loading" : `Amount ${formatAmountInput(amountInput)} USDC`}
          aria-live="polite"
        >
          {heroText}
        </T>
        <div className="flex items-center justify-center gap-2 px-3">
          <UsdcLogo size={14} />
          <T variant="footnote" tone={insufficient ? "danger" : "tertiary"} align="center" lines={2}>
            {balance.status === "known" && balance.raw === 0n
              ? "No USDC yet. Send USDC on Solana to your wallet."
              : insufficient
                ? `More than your ${balanceText}`
                : balanceText}
          </T>
          {balance.status === "known" && balance.raw > 0n ? (
            <button
              type="button"
              aria-label="Use full USDC balance"
              onClick={() => setAmount(clampAmountDecimals(formatBaseUnits(balance.raw.toString(), balance.decimals, balance.decimals)))}
              className="t-footnote font-semibold text-accent hover:opacity-70"
            >
              Max
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {PRESETS.map((preset) => (
          <Chip key={preset} compact label={`$${preset}`} selected={amountInput === preset} onClick={() => setAmount(preset)} />
        ))}
      </div>
      <Numpad onKey={pressKey} onClear={() => setAmount("")} />
      {error ? (
        <T variant="footnote" tone="danger" align="center" lines={3}>
          {error}
        </T>
      ) : null}
      {needsFunds ? (
        <PrimaryButton label="Add USDC" icon={IoAddCircle} onClick={flow.addFunds} />
      ) : (
        <PrimaryButton
          label="Review"
          onClick={review}
          disabled={!request}
          loading={prepare.isPending || (bag.isPlaceholderData && bag.isFetching)}
        />
      )}
    </div>
  );
}
