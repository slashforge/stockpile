import { useQueryClient } from "@tanstack/react-query";
import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { IoCheckmark, IoCheckmarkCircle, IoClipboardOutline, IoOpenOutline, IoTimeOutline } from "react-icons/io5";
import { TokenAvatar } from "@/components/newsbid/token-avatar";
import { SlideToConfirm } from "@/components/trade/slide-to-confirm";
import { PrimaryButton, Spinner } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Divider, Notice } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { usePortfolio } from "@/hooks/use-account";
import { indexAssetsByMint, useBags } from "@/hooks/use-bags";
import { queryKeys } from "@/hooks/query-keys";
import { formatUsdValue } from "@/lib/portfolio";
import { waitForConfirmation } from "@/lib/solana/rpc";
import { explorerTxUrl } from "@/lib/solana/transaction";
import { displayAmount, isSolanaAddress, parseAmount, withdrawableAssets, withdrawalProblems, type WithdrawAsset } from "@/lib/solana/withdraw";
import { SubmissionError } from "@/lib/trade/signing";
import { useNewsbidAuth } from "@/providers/auth-context";
import { prepareWithdrawal } from "@/services/api/newsbid";
import type { WithdrawPrepared } from "@/services/api/types";
import { formatBaseUnits, shortAddress } from "@/utils/amounts";
import { Sheet } from "./sheet";

/** Prepared transfers carry a recent blockhash (~60-90s); rebuild before signing once this old. */
const REBUILD_AFTER_MS = 45_000;

type Draft = { asset: WithdrawAsset; raw: bigint; destination: string };
type Ready = { draft: Draft; prepared: WithdrawPrepared & { transaction: string }; preparedAt: number; problems: string[] };
type Stage =
  | { name: "form" }
  | { name: "review"; ready: Ready }
  | { name: "sending"; ready: Ready; signature: string | null }
  | { name: "done"; ready: Ready; signature: string; confirmed: boolean }
  | { name: "failed"; ready: Ready; error: string; signature: string | null };

function usdOf(asset: WithdrawAsset, raw: bigint): string | null {
  if (asset.usdPrice == null) return null;
  const ui = Number(displayAmount(asset, raw, asset.decimals).replace(/,/g, ""));
  return Number.isFinite(ui) ? formatUsdValue(ui * asset.usdPrice) : null;
}

async function prepare(draft: Draft, walletAddress: string): Promise<Ready> {
  const prepared = await prepareWithdrawal({ asset: draft.asset.asset, amount: draft.raw.toString(), destination: draft.destination });
  if (prepared.status !== "ready" || !prepared.transaction) throw new Error(prepared.error?.message ?? prepared.message ?? "Couldn’t prepare this transfer.");
  const problems = withdrawalProblems(prepared.transaction, { walletAddress, destination: draft.destination, asset: draft.asset.asset, amount: draft.raw });
  return { draft, prepared: { ...prepared, transaction: prepared.transaction }, preparedAt: Date.now(), problems };
}

function AssetPicker({ assets, selected, onSelect }: { assets: WithdrawAsset[]; selected: string | null; onSelect: (asset: WithdrawAsset) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <T as="span" variant="footnote" tone="secondary" className="font-semibold">
        Asset
      </T>
      <div role="radiogroup" aria-label="Asset" className="max-h-[208px] overflow-y-auto rounded-2xl border border-line-strong bg-surface">
        {assets.map((asset, index) => {
          const active = asset.asset === selected;
          return (
            <div key={asset.asset}>
              {index > 0 ? <Divider inset={56} /> : null}
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(asset)}
                className={cn("flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-sunken", active && "bg-sunken")}
              >
                <TokenAvatar symbol={asset.symbol} mint={asset.mint} iconUrl={asset.iconUrl} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <T as="span" variant="subhead" lines={1} className="font-semibold">
                    {asset.symbol}
                  </T>
                  <T as="span" variant="caption" tone="secondary" lines={1} className="tabular-nums">
                    {displayAmount(asset, asset.raw)} available
                  </T>
                </span>
                {active ? <IoCheckmarkCircle size={22} className="shrink-0 text-accent" /> : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormStep({ assets, initialAsset, onReady }: { assets: WithdrawAsset[]; initialAsset?: string; onReady: (ready: Ready) => void }) {
  const { walletAddress } = useNewsbidAuth();
  const [assetKey, setAssetKey] = useState<string | null>(
    () => assets.find((asset) => asset.asset === initialAsset)?.asset ?? assets[0]?.asset ?? null,
  );
  const asset = assets.find((candidate) => candidate.asset === assetKey) ?? null;
  const [amount, setAmount] = useState("");
  const [max, setMax] = useState(false);
  const [destination, setDestination] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const raw = asset ? (max ? asset.raw : parseAmount(asset, amount)) : null;
  const to = destination.trim();
  const amountError =
    !asset || !amount.trim() ? null : raw == null ? "Enter a valid amount." : raw > asset.raw ? "That’s more than you have." : null;
  const addressError = !to
    ? null
    : !isSolanaAddress(to)
      ? "That isn’t a Solana address."
      : to === walletAddress
        ? "That’s your Newsbid wallet. Enter the address you want to send to."
        : null;
  const canReview = !!asset && raw != null && raw > 0n && !amountError && !!to && !addressError && !!walletAddress;
  const usd = asset && raw != null && !amountError ? usdOf(asset, raw) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canReview || !asset || raw == null || !walletAddress) return;
    setBusy(true);
    setError(null);
    try {
      onReady(await prepare({ asset, raw, destination: to }, walletAddress));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t prepare this transfer.");
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setDestination(text);
    } catch {
      // Clipboard access denied; the user can paste manually.
    }
  };

  if (!asset) {
    return (
      <Notice tone="info">
        <T variant="footnote" tone="inherit">
          Your wallet is empty, so there’s nothing to withdraw yet.
        </T>
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AssetPicker
        assets={assets}
        selected={asset.asset}
        onSelect={(next) => {
          setAssetKey(next.asset);
          setAmount("");
          setMax(false);
          setError(null);
        }}
      />
      <div className="flex flex-col gap-1.5">
        <Field
          label={`Amount (${asset.symbol})`}
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value.replace(/[^\d.,]/g, ""));
            setMax(false);
            setError(null);
          }}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          className="tabular-nums"
          error={touched || amount ? amountError : null}
        />
        <div className="flex items-center justify-between gap-2 px-1">
          <T variant="caption" tone="secondary" className="tabular-nums">
            {usd ? `≈ ${usd} · ` : ""}
            {displayAmount(asset, asset.raw)} {asset.symbol} available
          </T>
          <button
            type="button"
            onClick={() => {
              setAmount(displayAmount(asset, asset.raw, asset.decimals).replace(/,/g, ""));
              setMax(true);
              setError(null);
            }}
            className={cn("t-footnote rounded-full px-2.5 py-1 font-semibold transition-colors", max ? "bg-accent text-on-accent" : "bg-accent-soft text-accent hover:opacity-80")}
          >
            Max
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Field
          label="To address"
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
            setError(null);
          }}
          placeholder="Solana wallet address"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono text-[14px]"
          error={touched || to ? addressError : null}
        />
        {typeof navigator !== "undefined" && "readText" in (navigator.clipboard ?? {}) ? (
          <button type="button" onClick={paste} className="t-footnote inline-flex items-center gap-1 self-start px-1 font-semibold text-accent hover:opacity-70">
            <IoClipboardOutline size={14} />
            Paste
          </button>
        ) : null}
      </div>
      {error ? (
        <Notice tone="error">
          <T variant="footnote" tone="inherit">
            {error}
          </T>
        </Notice>
      ) : null}
      <PrimaryButton type="submit" label="Review" loading={busy} disabled={!canReview} />
      <T variant="caption" tone="tertiary" align="center">
        Only send to an address on the Solana network. Network fees are on Newsbid.
      </T>
    </form>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <T variant="footnote" tone="secondary" className="shrink-0">
        {label}
      </T>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function Summary({ ready }: { ready: Ready }) {
  const { draft, prepared } = ready;
  const usd = usdOf(draft.asset, draft.raw);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1 py-2 text-center">
        <TokenAvatar symbol={draft.asset.symbol} mint={draft.asset.mint} iconUrl={draft.asset.iconUrl} size={44} />
        <T variant="title1" className="mt-1 tabular-nums">
          {displayAmount(draft.asset, draft.raw, draft.asset.decimals)} {draft.asset.symbol}
        </T>
        {usd ? (
          <T variant="footnote" tone="secondary" className="tabular-nums">
            ≈ {usd}
          </T>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
        <SummaryRow label="To">
          <T variant="footnote" className="break-all font-mono">
            {draft.destination}
          </T>
        </SummaryRow>
        <Divider inset={16} />
        <SummaryRow label="Network fee">
          <T variant="footnote">Paid by Newsbid</T>
        </SummaryRow>
        {prepared.createsAccount ? (
          <>
            <Divider inset={16} />
            <SummaryRow label="Recipient account">
              <T variant="footnote">
                Opened for them · {formatBaseUnits(String(prepared.rentLamports ?? 0), 9, 6)} SOL from your wallet
              </T>
            </SummaryRow>
          </>
        ) : null}
      </div>
    </div>
  );
}

function WithdrawBody({ initialAsset, onClose }: { initialAsset?: string; onClose: () => void }) {
  const { walletAddress, signAndSendTransaction } = useNewsbidAuth();
  const portfolio = usePortfolio();
  const bags = useBags();
  const queryClient = useQueryClient();
  const assets = useMemo(() => withdrawableAssets(portfolio.data, indexAssetsByMint(bags.data)), [portfolio.data, bags.data]);
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [rebuilding, setRebuilding] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio });
    queryClient.invalidateQueries({ queryKey: queryKeys.activity });
    queryClient.invalidateQueries({ queryKey: queryKeys.positions });
  };

  const send = async (current: Ready) => {
    if (sendingRef.current || !walletAddress || !signAndSendTransaction) return;
    sendingRef.current = true;
    setReviewError(null);
    let ready = current;
    try {
      if (Date.now() - ready.preparedAt > REBUILD_AFTER_MS) {
        setRebuilding(true);
        ready = await prepare(ready.draft, walletAddress);
        setRebuilding(false);
        if (ready.problems.length) {
          setStage({ name: "review", ready });
          return;
        }
      }
      setStage({ name: "sending", ready, signature: null });
      let signature: string;
      try {
        ({ signature } = await signAndSendTransaction(ready.prepared.transaction));
      } catch (error) {
        // Signed but the broadcast outcome is unknown: track it by signature rather than offering a re-send.
        if (error instanceof SubmissionError && !error.definite) signature = error.signature;
        else throw error;
      }
      setStage({ name: "sending", ready, signature });
      const result = await waitForConfirmation(signature, { lastValidBlockHeight: ready.prepared.lastValidBlockHeight });
      refresh();
      if (result.status === "failed") {
        setStage({ name: "failed", ready, signature, error: result.error === "expired" ? "The transfer expired before it landed. Nothing was sent." : "The transfer failed on-chain. Nothing was sent." });
      } else {
        setStage({ name: "done", ready, signature, confirmed: result.status === "confirmed" });
      }
    } catch (error) {
      // Nothing was broadcast (cancelled, rebuild failed or rejected before sending), so the user can simply retry.
      setRebuilding(false);
      setStage({ name: "review", ready });
      setReviewError(error instanceof Error ? error.message : "Couldn’t send this transfer.");
    } finally {
      sendingRef.current = false;
    }
  };

  const header = (title: string, body: string) => (
    <div className="flex flex-col gap-1 pr-10">
      <T as="h2" variant="title2">
        {title}
      </T>
      <T variant="callout" tone="secondary">
        {body}
      </T>
    </div>
  );

  let content: ReactNode;
  if (stage.name === "form") {
    content = (
      <>
        {header("Withdraw", "Send funds from your Newsbid wallet to any Solana wallet.")}
        {portfolio.isPending ? (
          <div className="h-40 animate-pulse rounded-2xl bg-sunken" />
        ) : portfolio.data?.status !== "live" ? (
          <Notice tone="error">
            <T variant="footnote" tone="inherit">
              {portfolio.data?.message ?? portfolio.error?.message ?? "Your balances are unavailable right now. Try again in a moment."}
            </T>
          </Notice>
        ) : (
          <FormStep assets={assets} initialAsset={initialAsset} onReady={(ready) => setStage({ name: "review", ready })} />
        )}
      </>
    );
  } else if (stage.name === "review") {
    const { ready } = stage;
    content = (
      <>
        {header("Review withdrawal", "Check the address. Transfers on Solana can’t be reversed.")}
        <Summary ready={ready} />
        {ready.problems.length ? (
          <Notice tone="error">
            <T variant="footnote" tone="inherit" className="font-semibold">
              Blocked: this transaction doesn’t match your request.
            </T>
            {ready.problems.map((problem) => (
              <T key={problem} variant="footnote" tone="inherit">
                {problem}
              </T>
            ))}
          </Notice>
        ) : (
          <Notice tone="caution">
            <T variant="footnote" tone="inherit">
              Anything sent to a wrong or non-Solana address is gone for good.
            </T>
          </Notice>
        )}
        {reviewError ? (
          <Notice tone="error">
            <T variant="footnote" tone="inherit">
              {reviewError}
            </T>
          </Notice>
        ) : null}
        {!ready.problems.length ? (
          <SlideToConfirm label="Slide to send" onConfirm={() => void send(ready)} loading={rebuilding} disabled={!signAndSendTransaction} resetKey={reviewError ?? ready.preparedAt} />
        ) : null}
        <PrimaryButton label="Edit" variant="ghost" size="md" onClick={() => setStage({ name: "form" })} />
      </>
    );
  } else if (stage.name === "sending") {
    content = (
      <>
        {header("Sending…", stage.signature ? "Waiting for the network to confirm." : "Signing with your wallet.")}
        <Summary ready={stage.ready} />
        <div className="flex justify-center py-3 text-accent">
          <Spinner size={28} />
        </div>
      </>
    );
  } else if (stage.name === "done") {
    const { ready, signature, confirmed } = stage;
    content = (
      <>
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <span className={cn("flex size-14 items-center justify-center rounded-full text-white", confirmed ? "bg-positive" : "bg-caution")}>
            {confirmed ? <IoCheckmark size={30} /> : <IoTimeOutline size={28} />}
          </span>
          <T as="h2" variant="title2">
            {confirmed ? "Sent" : "Sent, still confirming"}
          </T>
          <T variant="callout" tone="secondary" className="tabular-nums">
            {displayAmount(ready.draft.asset, ready.draft.raw, ready.draft.asset.decimals)} {ready.draft.asset.symbol} to{" "}
            {shortAddress(ready.draft.destination, 5)}
          </T>
        </div>
        <PrimaryButton label="View on Solscan" variant="outline" size="md" icon={IoOpenOutline} onClick={() => window.open(explorerTxUrl(signature), "_blank", "noopener")} />
        <PrimaryButton label="Done" onClick={onClose} />
      </>
    );
  } else {
    const { error, signature } = stage;
    content = (
      <>
        {header("Withdrawal didn’t go through", error)}
        {signature ? (
          <PrimaryButton label="View on Solscan" variant="outline" size="md" icon={IoOpenOutline} onClick={() => window.open(explorerTxUrl(signature), "_blank", "noopener")} />
        ) : null}
        <PrimaryButton label="Try again" onClick={() => setStage({ name: "form" })} />
      </>
    );
  }

  return <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-5 pt-6">{content}</div>;
}

type WithdrawSheetValue = { openWithdraw: (asset?: string) => void };

const WithdrawSheetContext = createContext<WithdrawSheetValue>({ openWithdraw: () => {} });

export function useWithdrawSheet() {
  return useContext(WithdrawSheetContext);
}

export function WithdrawSheetProvider({ children }: { children: ReactNode }) {
  const { walletAddress } = useNewsbidAuth();
  const [open, setOpen] = useState<{ key: number; asset?: string } | null>(null);
  const openWithdraw = useCallback((asset?: string) => setOpen((current) => ({ key: (current?.key ?? 0) + 1, asset })), []);
  const close = useCallback(() => setOpen(null), []);
  const value = useMemo(() => ({ openWithdraw }), [openWithdraw]);
  return (
    <WithdrawSheetContext.Provider value={value}>
      {children}
      <Sheet open={!!open && !!walletAddress} onClose={close} label="Withdraw" size="sm">
        {open && walletAddress ? <WithdrawBody key={open.key} initialAsset={open.asset} onClose={close} /> : null}
      </Sheet>
    </WithdrawSheetContext.Provider>
  );
}
