import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IoAdd,
  IoArrowDown,
  IoArrowUp,
  IoCheckmark,
  IoCheckmarkCircle,
  IoChevronForward,
  IoClose,
  IoCloudOffline,
  IoCloudOfflineOutline,
  IoCopyOutline,
  IoEllipseOutline,
  IoEllipsisHorizontal,
  IoLayers,
  IoPieChart,
  IoRefresh,
  IoRemoveCircleOutline,
  IoSwapHorizontal,
  IoTimeOutline,
  IoWallet,
  IoWalletOutline,
} from "react-icons/io5";
import { useCopyFeedback, useFundSheet } from "@/components/sheets/fund-sheet";
import { AuthGate } from "@/components/stockpile/auth-gate";
import { LogoCluster } from "@/components/stockpile/bag-art";
import { GradientCard, HeroState } from "@/components/stockpile/hero-state";
import { toneClass } from "@/components/stockpile/market";
import { TokenAvatar, UsdcLogo } from "@/components/stockpile/token-avatar";
import { PrimaryButton, Spinner } from "@/components/ui/button";
import { CardSkeleton, Divider, type IconType, Page, Section, Skeleton } from "@/components/ui/layout";
import { cn, T } from "@/components/ui/type";
import { useActivity } from "@/hooks/use-account";
import { indexAssetsByMint, useBags } from "@/hooks/use-bags";
import { useLooseHoldings } from "@/hooks/use-loose-holdings";
import { useOpenSell } from "@/hooks/use-navigation";
import { usePositions } from "@/hooks/use-positions";
import { formatSignedPct } from "@/lib/market";
import {
  activityVisual,
  describeActivity,
  flattenActivity,
  formatHoldingAmount,
  formatUsdValue,
  groupActivityByDay,
  relativeTime,
} from "@/lib/portfolio";
import { USDC_MINT } from "@/lib/solana/transaction";
import { spendableUsdc } from "@/lib/trade/balance";
import { useStockpileAuth } from "@/providers/auth-context";
import { type BagPosition, heldPositions } from "@/services/api/positions";
import type { Activity, Bag, Holding, Portfolio } from "@/services/api/types";
import { formatMoney, formatTokenAmount, shortAddress } from "@/utils/amounts";

export const Route = createFileRoute("/portfolio")({ component: PortfolioScreen });

type AssetIndex = ReturnType<typeof indexAssetsByMint>;

function formatAsOf(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ListCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-3xl bg-surface shadow-card">{children}</div>;
}

function IconBadge({ icon: Icon, className }: { icon: IconType; className: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", className)}>
      <Icon size={18} />
    </span>
  );
}

function StatusCard({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <ListCard>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <IconBadge icon={IoCloudOfflineOutline} className="bg-sunken text-ink-2" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <T variant="headline" lines={1}>
            {title}
          </T>
          <T variant="footnote" tone="secondary" lines={2}>
            {body}
          </T>
        </div>
        <button type="button" onClick={onRetry} className="t-subhead shrink-0 text-accent hover:opacity-70">
          Retry
        </button>
      </div>
    </ListCard>
  );
}

function NoBagTokensHint() {
  return (
    <ListCard>
      <Link to="/bags" className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-sunken">
        <IconBadge icon={IoLayers} className="bg-accent-soft text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <T variant="headline" lines={1}>
            No bag tokens yet
          </T>
          <T variant="footnote" tone="secondary" lines={1}>
            Put money in a bag to see it here
          </T>
        </div>
        <span className="inline-flex items-center gap-1 text-accent">
          <T as="span" variant="subhead" tone="accent">
            Browse
          </T>
          <IoChevronForward size={16} />
        </span>
      </Link>
    </ListCard>
  );
}

function PositionRow({ position, onSell }: { position: BagPosition; onSell: () => void }) {
  const tokens = `${position.legs.length} ${position.legs.length === 1 ? "token" : "tokens"}`;
  const traded = relativeTime(position.lastTradedAt);
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-sunken">
      <Link to="/bag/$id" params={{ id: position.bagId }} className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="min-w-10">
          <LogoCluster assets={position.legs} size={26} limit={3} flat />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <T as="span" variant="headline" lines={1}>
            {position.title}
          </T>
          <T as="span" variant="footnote" tone="secondary" lines={1}>
            {traded ? `${tokens} · traded ${traded}` : tokens}
          </T>
          {!position.reconciled ? (
            <T as="span" variant="caption" tone="caution" lines={2}>
              Some tokens moved out of this wallet
            </T>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <T as="span" variant="numeric" className="leading-[21px]">
            {formatUsdValue(position.valueUsd)}
          </T>
          <T as="span" variant="footnote" tone="inherit" className={cn("tabular-nums", toneClass(position.pnlPct, "text-ink-2"))}>
            {formatSignedPct(position.pnlPct)}
          </T>
        </span>
      </Link>
      {position.sellable ? (
        <button
          type="button"
          onClick={onSell}
          aria-label={`Sell ${position.title}`}
          className="t-subhead min-h-8 shrink-0 rounded-full bg-accent-soft px-3.5 text-accent transition-opacity hover:opacity-80"
        >
          Sell
        </button>
      ) : null}
    </div>
  );
}

function PositionsSection() {
  const positions = usePositions();
  const openSell = useOpenSell();
  if (positions.isPending) return null;
  if (positions.isError || positions.data.status !== "live") {
    return (
      <Section title="Your bags">
        <StatusCard
          title="Bag positions unavailable"
          body={
            positions.data?.message ??
            (positions.isError ? positions.error.message : "We couldn’t work out your bag positions right now.")
          }
          onRetry={() => positions.refetch()}
        />
      </Section>
    );
  }
  const held = heldPositions(positions.data);
  if (held.length === 0) return null;
  return (
    <Section title="Your bags">
      <ListCard>
        {held.map((position, index) => (
          <div key={position.bagId}>
            {index > 0 ? <Divider inset={16} /> : null}
            <PositionRow position={position} onSell={() => openSell(position.bagId)} />
          </div>
        ))}
      </ListCard>
    </Section>
  );
}

function WalletCard({ address, portfolio }: { address: string; portfolio: Portfolio }) {
  const { openFund } = useFundSheet();
  const { copied, copy } = useCopyFeedback();
  const usdc = spendableUsdc(portfolio);
  const live = portfolio.status === "live";
  const usdcLine = usdc.status === "known" ? `${formatMoney(usdc.raw.toString(), usdc.decimals)} USDC available` : usdc.reason;
  const unpriced = live && portfolio.unpricedCount > 0 ? ` · ${portfolio.unpricedCount} unpriced` : "";
  return (
    <GradientCard gradient="blue" decorated={false} className="text-white">
      <div className="flex flex-col gap-0.5">
        <T variant="footnote" tone="inherit" className="text-white/80">
          Total value
        </T>
        <T tone="inherit" lines={1} className="text-[36px] leading-[42px] font-extrabold tracking-[-0.8px] tabular-nums md:text-[44px] md:leading-[50px]">
          {live ? formatUsdValue(portfolio.totalUsd) : "—"}
        </T>
        <div className="mt-0.5 flex items-center gap-1.5">
          {usdc.status === "known" ? <UsdcLogo size={14} /> : null}
          <T variant="footnote" tone="inherit" lines={2} className="text-white/80 tabular-nums">
            {usdcLine}
            {unpriced}
          </T>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => copy(address).catch(() => {})}
          aria-label={copied ? "Wallet address copied" : `Copy wallet address ${shortAddress(address, 4)}`}
          className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/20 px-3.5 transition-opacity hover:opacity-85 md:flex-none"
        >
          <IoWalletOutline size={16} />
          <T as="span" variant="subhead" tone="inherit" lines={1} className="tabular-nums">
            {copied ? "Copied" : shortAddress(address, 4)}
          </T>
          {copied ? <IoCheckmark size={16} /> : <IoCopyOutline size={16} />}
        </button>
        <button
          type="button"
          onClick={openFund}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-white px-3.5 text-[#2563EB] transition-opacity hover:opacity-90"
        >
          <IoAdd size={16} />
          <T as="span" variant="subhead" tone="inherit">
            Add funds
          </T>
        </button>
      </div>
    </GradientCard>
  );
}

type Row = {
  key: string;
  mint: string | null;
  symbol: string;
  name: string;
  iconUrl: string | null | undefined;
  amount: string;
  usdValue: number | null;
};

/** USDC and SOL stay in the wallet: USDC is what you sell into and SOL covers fees outside Stockpile. */
function isSellable(row: Row) {
  return row.mint != null && row.key !== "usdc" && row.key !== "sol";
}

function holdingRows(data: Portfolio, loose: Holding[], assets: AssetIndex): Row[] {
  const rows: Row[] = [];
  if (data.usdc && data.usdc.amount !== "0") {
    rows.push({
      key: "usdc",
      mint: USDC_MINT,
      symbol: "USDC",
      name: "USD Coin",
      iconUrl: null,
      amount: formatHoldingAmount(data.usdc.uiAmount),
      usdValue: data.usdc.usdValue,
    });
  }
  if (data.sol && data.sol.amount !== "0") {
    rows.push({
      key: "sol",
      mint: null,
      symbol: "SOL",
      name: "Solana",
      iconUrl: null,
      amount: formatHoldingAmount(data.sol.uiAmount),
      usdValue: data.sol.usdValue,
    });
  }
  // Bag tokens live in their bag; only what's held outside every bag position is listed here.
  for (const holding of loose) {
    if (holding.amount === "0" || holding.mint === USDC_MINT) continue;
    const asset = assets.get(holding.mint);
    const symbol = holding.symbol ?? asset?.symbol ?? shortAddress(holding.mint);
    const ui =
      holding.uiAmount ??
      formatTokenAmount(holding.amount, holding.decimals, asset?.uiAmountMultiplier ?? 1).replace(/,/g, "");
    rows.push({
      key: holding.mint,
      mint: holding.mint,
      symbol,
      name: holding.name ?? asset?.name ?? "Token",
      iconUrl: holding.iconUrl ?? asset?.iconUrl,
      amount: formatHoldingAmount(ui),
      usdValue: holding.usdValue,
    });
  }
  return rows;
}

function HoldingRow({
  row,
  selecting,
  selected,
  onToggle,
}: {
  row: Row;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const sellable = isSellable(row);
  const content = (
    <>
      {selecting ? (
        selected ? (
          <IoCheckmarkCircle size={22} className="shrink-0 text-accent" />
        ) : sellable ? (
          <IoEllipseOutline size={22} className="shrink-0 text-ink-3" />
        ) : (
          <IoRemoveCircleOutline size={22} className="shrink-0 text-ink-3" />
        )
      ) : null}
      <TokenAvatar symbol={row.symbol} mint={row.mint} iconUrl={row.iconUrl} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <T as="span" variant="headline" lines={1}>
          {row.symbol}
        </T>
        <T as="span" variant="footnote" tone="secondary" lines={1}>
          {row.name}
        </T>
      </span>
      <span className="flex max-w-[50%] shrink-0 flex-col items-end gap-0.5">
        <T as="span" variant="numeric" lines={1} className="leading-[21px]">
          {formatUsdValue(row.usdValue)}
        </T>
        <T as="span" variant="footnote" tone="secondary" lines={1} className="tabular-nums">
          {row.amount} {row.symbol}
        </T>
      </span>
    </>
  );
  const cls = "flex w-full items-center gap-2.5 px-4 py-3";
  if (!selecting || !sellable) {
    return <div className={cn(cls, selecting && "opacity-45")}>{content}</div>;
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(cls, "transition-colors hover:bg-sunken", selected && "bg-sunken")}
    >
      {content}
    </button>
  );
}

type ActivityLeg = Activity["legs"][number];

function LegAvatar({ leg, assets, size }: { leg: ActivityLeg; assets: AssetIndex; size: number }) {
  const asset = assets.get(leg.mint);
  return <TokenAvatar symbol={leg.symbol ?? asset?.symbol ?? "?"} mint={leg.mint} iconUrl={asset?.iconUrl} size={size} />;
}

const ACTION_ICON = {
  "swap-horizontal": IoSwapHorizontal,
  "arrow-down": IoArrowDown,
  "arrow-up": IoArrowUp,
  "ellipsis-horizontal": IoEllipsisHorizontal,
  close: IoClose,
} as const;

function ActivityAvatar({ item, line, assets }: { item: Activity; line: ReturnType<typeof describeActivity>; assets: AssetIndex }) {
  const failed = item.status === "failed";
  if (!failed && item.kind === "swap" && line.front && line.back) {
    return (
      <span className="relative size-11 shrink-0">
        <span className="absolute left-0 top-0">
          <LegAvatar leg={line.back} assets={assets} size={30} />
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-canvas p-0.5">
          <LegAvatar leg={line.front} assets={assets} size={30} />
        </span>
      </span>
    );
  }
  const visual = activityVisual(item);
  const Icon = ACTION_ICON[visual.icon];
  const fill = failed
    ? "bg-danger-soft text-danger"
    : { accent: "bg-accent text-white", positive: "bg-positive text-white", neutral: "bg-ink-3 text-white", danger: "bg-danger text-white" }[
        visual.tone
      ];
  const rotate = visual.icon === "arrow-down" || visual.icon === "arrow-up";
  return (
    <span className="relative size-11 shrink-0">
      <span className={cn("flex size-11 items-center justify-center rounded-full", fill)}>
        <Icon size={22} className={rotate ? "rotate-45" : undefined} />
      </span>
      {line.front ? (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-canvas p-0.5">
          <LegAvatar leg={line.front} assets={assets} size={18} />
        </span>
      ) : null}
    </span>
  );
}

function ActivityRow({ item, bagsById, assets }: { item: Activity; bagsById: Map<string, Bag>; assets: AssetIndex }) {
  const when = relativeTime(item.ts);
  const failed = item.status === "failed";
  const line = describeActivity(item);
  const bag = item.bagId ? bagsById.get(item.bagId) : undefined;
  const detail = failed ? "Failed" : (bag?.title ?? line.detail);
  const amountTone = failed
    ? "text-ink-3 line-through"
    : line.amount?.tone === "negative"
      ? "text-danger"
      : line.amount?.tone === "positive"
        ? "text-positive"
        : "text-accent";
  return (
    <a
      href={item.explorerUrl}
      target="_blank"
      rel="noreferrer"
      className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition-colors hover:bg-sunken"
    >
      <ActivityAvatar item={item} line={line} assets={assets} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <T as="span" variant="headline" lines={1}>
          {line.verb}
          {line.subject ? (
            <T as="span" variant="headline" tone="secondary" className="font-medium">{` ${line.subject}`}</T>
          ) : null}
        </T>
        {detail ? (
          <T as="span" variant="footnote" tone={failed ? "danger" : "secondary"} lines={1} className="tabular-nums">
            {detail}
          </T>
        ) : null}
      </span>
      <span className="flex max-w-[50%] shrink-0 flex-col items-end gap-0.5">
        {line.amount ? (
          <T as="span" variant="numeric" tone="inherit" lines={1} className={cn("leading-[21px]", amountTone)}>
            {line.amount.text}
          </T>
        ) : null}
        {when ? (
          <T as="span" variant="footnote" tone="secondary" lines={1}>
            {when}
          </T>
        ) : null}
      </span>
    </a>
  );
}

function ActivitySection({ bagsById, assets }: { bagsById: Map<string, Bag>; assets: AssetIndex }) {
  const activity = useActivity();
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = activity;
  const first = activity.data?.pages[0];
  const items = flattenActivity(activity.data?.pages);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError]);

  let body: React.ReactNode;
  if (activity.isPending) {
    body = (
      <ListCard>
        <div className="flex flex-col gap-2.5 px-4 py-3">
          <Skeleton height={16} width="70%" />
          <Skeleton height={16} width="45%" />
        </div>
      </ListCard>
    );
  } else if ((activity.isError && !isFetchNextPageError) || (first && first.status !== "live")) {
    body = (
      <StatusCard
        title="Activity unavailable"
        body={
          activity.isError
            ? activity.error.message
            : (first?.error?.message ?? first?.message ?? "We couldn’t read your wallet history right now.")
        }
        onRetry={() => activity.refetch()}
      />
    );
  } else if (items.length === 0) {
    body = (
      <ListCard>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <IconBadge icon={IoTimeOutline} className="bg-sunken text-ink-2" />
          <T variant="headline" tone="secondary">
            No activity yet
          </T>
        </div>
      </ListCard>
    );
  } else {
    body = (
      <div>
        {groupActivityByDay(items).map((group, index) => (
          <div key={`${group.label}-${group.items[0]!.signature}`} className={index > 0 ? "mt-3" : undefined}>
            <T as="h3" className="mb-0.5 text-[17px] leading-[22px] font-bold">
              {group.label}
            </T>
            {group.items.map((item) => (
              <ActivityRow key={item.signature} item={item} bagsById={bagsById} assets={assets} />
            ))}
          </div>
        ))}
        {isFetchingNextPage ? (
          <div className="flex justify-center py-3 text-ink-3">
            <Spinner />
          </div>
        ) : isFetchNextPageError ? (
          <button type="button" onClick={() => fetchNextPage()} className="t-footnote w-full py-3 text-accent">
            Couldn’t load more · Try again
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <Section title="Activity">
      {body}
      <div ref={sentinel} aria-hidden />
    </Section>
  );
}

function PortfolioBody({
  selecting,
  selected,
  onToggle,
  onStartSelecting,
}: {
  selecting: boolean;
  selected: ReadonlySet<string>;
  onToggle: (mint: string) => void;
  onStartSelecting: () => void;
}) {
  const { holdings: loose, portfolio, positions, settled } = useLooseHoldings();
  const bags = useBags();
  const { walletAddress: embeddedWallet } = useStockpileAuth();
  const bagsById = useMemo(() => new Map((bags.data ?? []).map((bag) => [bag.id, bag])), [bags.data]);

  if (portfolio.isPending) return <CardSkeleton />;
  if (portfolio.isError) {
    return (
      <HeroState
        gradient="coral"
        icon={IoCloudOffline}
        title="Couldn’t load your portfolio"
        body={portfolio.error.message}
        actionLabel="Try again"
        actionIcon={IoRefresh}
        onAction={() => portfolio.refetch()}
      />
    );
  }

  const data = portfolio.data;
  const walletAddress = data.walletAddress ?? embeddedWallet;
  const assets = indexAssetsByMint(bags.data);
  const rows = holdingRows(data, loose, assets);
  const hasTokens = rows.some((row) => isSellable(row));
  const hasBags = heldPositions(positions.data).length > 0;
  const asOf = formatAsOf(data.asOf);

  return (
    <div className="grid gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        {walletAddress ? <WalletCard address={walletAddress} portfolio={data} /> : null}
        <PositionsSection />
        {data.status !== "live" ? (
          <Section title="Holdings">
            <StatusCard
              title="Balances unavailable"
              body={data.message ?? "We couldn’t read your on-chain balances right now."}
              onRetry={() => portfolio.refetch()}
            />
          </Section>
        ) : (
          <Section
            title="Holdings"
            trailing={
              hasTokens && !selecting ? (
                <button type="button" onClick={onStartSelecting} className="t-subhead text-accent hover:opacity-70">
                  Select to sell
                </button>
              ) : asOf && !hasTokens ? (
                `Updated ${asOf}`
              ) : null
            }
          >
            {rows.length > 0 ? (
              <ListCard>
                {rows.map((row, index) => (
                  <div key={row.key}>
                    {index > 0 ? <Divider inset={66} /> : null}
                    <HoldingRow
                      row={row}
                      selecting={selecting}
                      selected={!!row.mint && selected.has(row.mint)}
                      onToggle={() => row.mint && onToggle(row.mint)}
                    />
                  </div>
                ))}
              </ListCard>
            ) : null}
            {settled && !hasTokens && !hasBags ? <NoBagTokensHint /> : null}
          </Section>
        )}
      </div>
      <div className="min-w-0">
        <ActivitySection bagsById={bagsById} assets={assets} />
      </div>
    </div>
  );
}

function PortfolioScreen() {
  const navigate = useNavigate();
  const { holdings: loose } = useLooseHoldings();
  const [selecting, setSelecting] = useState(false);
  const [picks, setPicks] = useState<ReadonlySet<string>>(() => new Set());
  // Only picks still listed count: anything sold or moved into a bag drops out on its own.
  const selected = useMemo<ReadonlySet<string>>(() => {
    const present = new Set(loose.map((holding) => holding.mint));
    return new Set([...picks].filter((mint) => present.has(mint)));
  }, [picks, loose]);
  const clear = () => {
    setSelecting(false);
    setPicks(new Set());
  };
  const picked = loose.filter((holding) => selected.has(holding.mint));
  const pickedUsd = picked.every((holding) => holding.usdValue != null)
    ? picked.reduce((sum, holding) => sum + (holding.usdValue ?? 0), 0)
    : null;

  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selecting]);

  return (
    <Page
      title="Portfolio"
      wide
      footer={
        selecting ? (
          <div className="flex items-center gap-2">
            <PrimaryButton label="Cancel" variant="ghost" size="md" onClick={clear} />
            <PrimaryButton
              className="flex-1"
              label={
                picked.length === 0
                  ? "Pick tokens to sell"
                  : `Sell ${picked.length} ${picked.length === 1 ? "token" : "tokens"}${pickedUsd != null ? ` · ≈ ${formatUsdValue(pickedUsd)}` : ""}`
              }
              icon={IoSwapHorizontal}
              size="md"
              disabled={picked.length === 0}
              onClick={() => {
                const mints = picked.map((holding) => holding.mint).join(",");
                clear();
                navigate({ to: "/sell-tokens", search: { mints } });
              }}
            />
          </div>
        ) : undefined
      }
    >
      <AuthGate
        gradient="blue"
        icon={IoPieChart}
        accents={[IoWallet, IoLayers]}
        title="Your bags, on-chain"
        body="Sign in to see your wallet balance, the tokens you hold and your activity."
      >
        <PortfolioBody
          selecting={selecting}
          selected={selected}
          onStartSelecting={() => setSelecting(true)}
          onToggle={(mint) =>
            setPicks((current) => {
              const next = new Set(current);
              if (next.has(mint)) next.delete(mint);
              else next.add(mint);
              return next;
            })
          }
        />
      </AuthGate>
    </Page>
  );
}
