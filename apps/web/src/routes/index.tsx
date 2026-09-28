import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IoAddCircle,
  IoArrowForward,
  IoChevronDown,
  IoChevronUp,
  IoCloudOffline,
  IoLayers,
  IoNewspaper,
  IoRefresh,
  IoSparkles,
} from "react-icons/io5";
import { useBagSheet } from "@/components/sheets/bag-sheet";
import { AllocationBar } from "@/components/stockpile/allocation";
import { BagArt, LogoCluster } from "@/components/stockpile/bag-art";
import { bagTradable, TradeStatus } from "@/components/stockpile/bag-card";
import { BagReturnsLine, CuratorLine } from "@/components/stockpile/market";
import { formatStoryDate, StoryReel, storyHost } from "@/components/stockpile/story-reel";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { IconButton, PrimaryButton } from "@/components/ui/button";
import { type IconType, Skeleton } from "@/components/ui/layout";
import { useMediaQuery } from "@/components/ui/theme";
import { cn, T } from "@/components/ui/type";
import { useBags } from "@/hooks/use-bags";
import { collectStories, useFeed } from "@/hooks/use-feed";
import { useOpenBuy } from "@/hooks/use-navigation";
import { useBagReturns } from "@/hooks/use-returns";
import { bagCurator } from "@/lib/market";
import { relatedBags, type Story } from "@/services/api/feed";
import type { Bag } from "@/services/api/types";
import { formatBps } from "@/utils/amounts";

export const Route = createFileRoute("/")({ component: FeedScreen });

/** Mobile floating tab bar footprint (64 tall + 12 gap + breathing room). */
const TAB_INSET = 88;

/** Full-bleed, bright, honest state used for unavailable/empty/error. */
function FeedState({
  icon: Icon,
  title,
  body,
  bags,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onOpenBag,
}: {
  icon: IconType;
  title: string;
  body: string;
  bags?: Bag[];
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onOpenBag?: (bagId: string) => void;
}) {
  const logos = (bags ?? [])
    .flatMap((bag) => bag.assets)
    .filter((asset, index, all) => all.findIndex((other) => other.symbol === asset.symbol) === index);
  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--ds-accent-soft)_0%,var(--ds-tertiary-soft)_45%,var(--ds-canvas)_100%)]" />
      <div className="absolute -right-20 -top-16 size-[280px] rounded-full bg-coral-soft" />
      <div className="absolute -left-[70px] bottom-[120px] size-[200px] rounded-full bg-mint-soft" />
      <div className="relative mx-auto flex max-w-[520px] flex-col items-center gap-3 px-5 pb-40 pt-10 md:pb-24">
        {logos.length > 0 ? (
          <LogoCluster assets={logos} size={62} limit={5} />
        ) : (
          <div className="mb-2 flex size-[84px] -rotate-6 items-center justify-center rounded-[28px] bg-accent text-white">
            <Icon size={34} />
          </div>
        )}
        <T as="h1" variant="title1" align="center">
          {title}
        </T>
        <T variant="callout" tone="secondary" align="center" className="max-w-[320px]">
          {body}
        </T>
        {actionLabel && onAction ? (
          <PrimaryButton label={actionLabel} onClick={onAction} icon={IoLayers} className="mt-2 min-w-[220px]" />
        ) : null}
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} onClick={onSecondary} variant="ghost" size="md" icon={IoRefresh} />
        ) : null}
      </div>
      {onOpenBag && bags && bags.length > 0 ? (
        <div className="absolute inset-x-0 bottom-28 flex flex-col gap-2 md:bottom-8">
          <T variant="overline" tone="tertiary" align="center">
            Peek inside a bag
          </T>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 md:justify-center">
            {bags.map((bag) => (
              <button
                key={bag.id}
                type="button"
                onClick={() => onOpenBag(bag.id)}
                className="flex shrink-0 items-center gap-2 rounded-full bg-surface py-2 pl-2 pr-3.5 shadow-[0_4px_10px_rgba(27,34,80,0.08)] transition-opacity hover:opacity-85"
              >
                <LogoCluster assets={bag.assets} size={28} limit={3} />
                <T as="span" variant="subhead" lines={1}>
                  {bag.title}
                </T>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-reel md:w-auto md:max-w-full md:aspect-[9/16] md:bg-transparent">
      {children}
    </div>
  );
}

/** One story: full-bleed on phones, a floating rounded card (peeking neighbours) on larger screens. */
function ReelCard({ children, active = true }: { children: ReactNode; active?: boolean }) {
  return (
    <div className="h-full md:px-1 md:py-3">
      <div
        className={cn(
          "h-full overflow-hidden bg-reel md:rounded-[28px] md:shadow-[0_18px_44px_-12px_rgba(9,11,20,0.45)] md:ring-1 md:ring-white/10 md:transition-[transform,opacity] md:duration-300",
          !active && "md:scale-[0.96] md:opacity-60",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function FeedLoading() {
  return (
    <ReelFrame>
      <ReelCard>
        <div className="flex h-full flex-col justify-end gap-3 p-5 pb-32 md:pb-8" role="progressbar" aria-label="Loading stories">
          <Skeleton height={32} width="80%" radius={10} className="opacity-20" />
          <Skeleton height={32} width="60%" radius={10} className="opacity-20" />
          <Skeleton height={18} width="90%" className="opacity-20" />
          <Skeleton height={64} radius={24} className="opacity-20" />
        </div>
      </ReelCard>
    </ReelFrame>
  );
}

/** Desktop companion to the reel: what the active story is about and where to go next. */
function StoryContext({ story, bags }: { story: Story; bags: Bag[] }) {
  const returns = useBagReturns();
  const openBuy = useOpenBuy();
  const date = formatStoryDate(story.publishedAt);
  return (
    <div className="flex flex-col gap-3">
      <T variant="overline" tone="tertiary">
        {bags.length > 1 ? `${bags.length} bags in this story` : bags.length === 1 ? "Bag in this story" : "In this story"}
      </T>
      {bags.length === 0 ? (
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
          <T variant="headline">No bag linked yet</T>
          <T variant="footnote" tone="secondary">
            This story is market context. Explore the bags to see what Stockpile tracks.
          </T>
          <Link to="/bags" className="t-subhead mt-1 inline-flex items-center gap-1 text-accent hover:underline">
            Browse bags <IoArrowForward size={14} />
          </Link>
        </div>
      ) : null}
      {bags.slice(0, 3).map((bag, index) => {
        const tradable = bagTradable(bag);
        const top = [...bag.assets].sort((a, b) => b.weightBps - a.weightBps).slice(0, index === 0 ? 4 : 0);
        return (
          <div key={bag.id} className="overflow-hidden rounded-3xl bg-surface shadow-card">
            <Link to="/bag/$id" params={{ id: bag.id }} className="block">
              <BagArt bag={bag} height={index === 0 ? 116 : 88} logoSize={index === 0 ? 40 : 32} showThemeIcon={false}>
                <div className="absolute right-2.5 top-2.5">
                  <TradeStatus bag={bag} onArt />
                </div>
              </BagArt>
            </Link>
            <div className="flex flex-col gap-2 p-4">
              <Link to="/bag/$id" params={{ id: bag.id }} className="flex flex-col gap-0.5 hover:opacity-80">
                <T variant="title3" lines={1}>
                  {bag.title}
                </T>
                <T variant="footnote" tone="secondary" lines={2}>
                  {bag.subtitle}
                </T>
              </Link>
              <CuratorLine curator={bagCurator(bag)} />
              <BagReturnsLine entry={returns.data?.[bag.id]} loading={returns.isPending} />
              {top.length > 0 ? (
                <>
                  <AllocationBar assets={bag.assets} />
                  <div className="flex flex-col">
                    {top.map((asset) => (
                      <Link
                        key={asset.symbol}
                        to="/asset/$symbol"
                        params={{ symbol: asset.symbol }}
                        search={{ bag: bag.id }}
                        className="-mx-2 flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-sunken"
                      >
                        <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={28} />
                        <T as="span" variant="subhead" lines={1} className="flex-1">
                          {asset.symbol}
                        </T>
                        <T as="span" variant="footnote" tone="secondary" className="tabular-nums">
                          {formatBps(asset.weightBps)}
                        </T>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
              {index === 0 ? (
                <div className="mt-1 flex flex-col gap-1">
                  {tradable ? (
                    <PrimaryButton label="Put money in the bag" icon={IoAddCircle} size="md" onClick={() => openBuy(bag.id)} />
                  ) : null}
                  <Link
                    to="/bag/$id"
                    params={{ id: bag.id }}
                    className="t-subhead inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full text-accent hover:bg-accent-soft"
                  >
                    See details <IoArrowForward size={15} />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-1 rounded-3xl bg-surface p-4 shadow-card">
        <T variant="overline" tone="tertiary">
          Source
        </T>
        <T variant="subhead">{story.publisher}</T>
        <T variant="caption" tone="tertiary">
          {[date, storyHost(story.sourceUrl), story.provenance === "ai" ? "AI summary" : null].filter(Boolean).join(" · ")}
        </T>
        <a
          href={story.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="t-subhead mt-1 inline-flex items-center gap-1 self-start text-accent hover:underline"
        >
          {story.format === "podcast" ? "Listen" : story.format === "disclosure" ? "View filing" : "Read story"}
          <IoArrowForward size={14} />
        </a>
      </div>
    </div>
  );
}

function ReelViewer({
  stories,
  bagsById,
  onEndReached,
  loadingMore,
}: {
  stories: Story[];
  bagsById: Map<string, Bag>;
  onEndReached: () => void;
  loadingMore: boolean;
}) {
  const { openBag } = useBagSheet();
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const wide = useMediaQuery("(min-width: 48rem)");
  const active = stories[Math.min(index, stories.length - 1)];

  const goTo = useCallback((next: number) => {
    const node = scroller.current;
    if (!node) return;
    const clamped = Math.max(0, Math.min(next, node.childElementCount - 1));
    node.scrollTo({ top: clamped * node.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (index >= stories.length - 3) onEndReached();
  }, [index, stories.length, onEndReached]);

  // Arrow keys / j k browse stories, like swiping on mobile.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
      if (document.querySelector("[role=dialog]")) return;
      if (event.key === "ArrowDown" || event.key === "j" || event.key === "PageDown") {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "ArrowUp" || event.key === "k" || event.key === "PageUp") {
        event.preventDefault();
        goTo(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const related = useMemo(() => (active ? relatedBags(active, bagsById) : []), [active, bagsById]);

  return (
    <div className="flex h-dvh items-center justify-center md:gap-5 md:px-6 xl:gap-8">
      <ReelFrame>
        <div
          ref={scroller}
          className="reel-scroller no-scrollbar h-full overflow-y-auto"
          aria-label="Story feed. Scroll or use the arrow keys for the next story."
          onScroll={(event) => {
            const node = event.currentTarget;
            const next = Math.round(node.scrollTop / Math.max(node.clientHeight, 1));
            if (next !== index) setIndex(next);
          }}
        >
          {stories.map((story, storyIndex) => (
            <ReelCard key={story.id} active={!wide || storyIndex === index}>
              <StoryReel
                story={story}
                bags={relatedBags(story, bagsById)}
                bottomInset={wide ? 0 : TAB_INSET}
                onOpenBag={openBag}
              />
            </ReelCard>
          ))}
        </div>
      </ReelFrame>

      <div className="hidden flex-col items-center gap-3 md:flex">
        <IconButton label="Previous story" onClick={() => goTo(index - 1)} className={cn(index === 0 && "pointer-events-none opacity-40")}>
          <IoChevronUp size={20} />
        </IconButton>
        <T variant="caption" tone="tertiary" className="font-semibold tabular-nums">
          {index + 1} / {stories.length}
          {loadingMore ? "+" : ""}
        </T>
        <IconButton
          label="Next story"
          onClick={() => goTo(index + 1)}
          className={cn(index >= stories.length - 1 && "pointer-events-none opacity-40")}
        >
          <IoChevronDown size={20} />
        </IconButton>
      </div>

      {active ? (
        <aside className="no-scrollbar hidden h-[calc(100dvh-48px)] w-[340px] shrink-0 overflow-y-auto xl:block 2xl:w-[380px]">
          <StoryContext story={active} bags={related} />
          <T variant="caption" tone="tertiary" align="center" className="mt-4">
            Use ↑ ↓ to browse stories
          </T>
        </aside>
      ) : null}
    </div>
  );
}

function FeedScreen() {
  const feed = useFeed();
  const bags = useBags();
  const { openBag } = useBagSheet();
  const navigate = useNavigate();
  const bagsById = useMemo(() => new Map((bags.data ?? []).map((bag) => [bag.id, bag])), [bags.data]);
  const collected = collectStories(feed.data?.pages);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isPending || collected.status === "pending") {
    return (
      <div className="flex h-dvh items-center justify-center md:px-6">
        <FeedLoading />
      </div>
    );
  }
  if (feed.isError) {
    return (
      <FeedState
        icon={IoCloudOffline}
        title="Couldn't load stories"
        body={feed.error.message}
        secondaryLabel="Try again"
        onSecondary={() => feed.refetch()}
        actionLabel="Browse bags"
        onAction={() => navigate({ to: "/bags" })}
      />
    );
  }
  if (collected.status === "unavailable") {
    return (
      <FeedState
        icon={IoNewspaper}
        title="Stories are coming"
        body={`${collected.message} Bags are ready to explore meanwhile.`}
        bags={bags.data}
        actionLabel="Browse bags"
        onAction={() => navigate({ to: "/bags" })}
        secondaryLabel="Check again"
        onSecondary={() => feed.refetch()}
        onOpenBag={openBag}
      />
    );
  }
  if (collected.stories.length === 0) {
    return (
      <FeedState
        icon={IoSparkles}
        title="All caught up"
        body="New stories appear here as sources publish them."
        bags={bags.data}
        actionLabel="Browse bags"
        onAction={() => navigate({ to: "/bags" })}
        onOpenBag={openBag}
      />
    );
  }
  return (
    <ReelViewer stories={collected.stories} bagsById={bagsById} onEndReached={loadMore} loadingMore={isFetchingNextPage} />
  );
}
