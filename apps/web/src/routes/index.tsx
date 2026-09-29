import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { BagArt, LogoCluster } from "@/components/stockpile/bag-art";
import { ImpactBreakdown, ImpactChip, ImpactCompare, UnavailableNotice } from "@/components/stockpile/story-impact";
import { formatStoryDate, StoryReel, storyHost } from "@/components/stockpile/story-reel";
import { TokenAvatar } from "@/components/stockpile/token-avatar";
import { IconButton, PrimaryButton } from "@/components/ui/button";
import { type IconType, Skeleton } from "@/components/ui/layout";
import { useMediaQuery } from "@/components/ui/theme";
import { cn, T } from "@/components/ui/type";
import { useBags } from "@/hooks/use-bags";
import { collectStories, useFeed } from "@/hooks/use-feed";
import { storyImpact } from "@/lib/story-impact";
import { connectionFor, relatedBags, type Story } from "@/services/api/feed";
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
    <div
      className="flex h-dvh items-center justify-center md:gap-5 md:px-6 xl:gap-8"
      role="progressbar"
      aria-label="Loading stories"
    >
      <ReelFrame>
        <ReelCard>
          <div className="flex h-full flex-col justify-end gap-3 p-5 pb-32 md:pb-8">
            <Skeleton height={32} width="80%" radius={10} className="opacity-20" />
            <Skeleton height={32} width="60%" radius={10} className="opacity-20" />
            <Skeleton height={18} width="90%" className="opacity-20" />
            <Skeleton height={64} radius={24} className="opacity-20" />
          </div>
        </ReelCard>
      </ReelFrame>

      <div className="hidden flex-col items-center gap-3 md:flex">
        <Skeleton height={44} width={44} radius={22} />
        <Skeleton height={12} width={32} />
        <Skeleton height={44} width={44} radius={22} />
      </div>

      <aside className="hidden h-dvh w-[340px] shrink-0 flex-col gap-3 overflow-hidden py-6 xl:flex 2xl:w-[380px]">
        <Skeleton height={12} width={140} />
        <div className="overflow-hidden rounded-3xl bg-surface shadow-card">
          <Skeleton height={104} radius={0} />
          <div className="flex flex-col gap-2.5 p-4">
            <Skeleton height={64} radius={16} />
            <Skeleton height={44} radius={22} className="mt-1" />
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
          <Skeleton height={12} width={60} />
          <Skeleton height={16} width="50%" />
          <Skeleton height={12} width="70%" />
        </div>
      </aside>
    </div>
  );
}

/** Desktop companion: select a bag, inspect exposure, then explore the evidence. */
function StoryContext({ story, bags }: { story: Story; bags: Bag[] }) {
  const [selectedBagId, setSelectedBagId] = useState<string | null>(null);
  const date = formatStoryDate(story.publishedAt);
  const impacts = useMemo(
    () => bags.map((bag) => ({ bag, impact: storyImpact(story, bag, connectionFor(story, bag.id)) })),
    [story, bags],
  );
  const primary = impacts.find(({ bag }) => bag.id === selectedBagId) ?? impacts[0];
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <T variant="overline" tone="tertiary">Story impact</T>
        <T variant="caption" tone="secondary">{bags.length} linked {bags.length === 1 ? "bag" : "bags"}</T>
      </div>
      {primary ? (
        <>
          {impacts.length > 1 ? (
            <div className="flex flex-col gap-1.5" role="group" aria-label="Choose a bag to view its story implications">
              <ImpactCompare rows={impacts} onOpen={setSelectedBagId} selectedBagId={primary.bag.id} />
              {impacts.some(({ impact }) => impact.signal !== "unavailable" && impact.holdings.length > 0) ? (
                <T variant="caption" tone="tertiary">Bars show the affected share of a bag's target allocation, not expected gains or losses.</T>
              ) : null}
            </div>
          ) : null}
          <section key={`${story.id}:${primary.bag.id}`} aria-label={`Story implications for ${primary.bag.title}`} className="overflow-hidden rounded-3xl bg-surface shadow-card">
            <BagArt bag={primary.bag} height={104} logoSize={28} showThemeIcon={false} logosOnTop>
              <div className="relative flex flex-col px-4 pb-3">
                <T variant="title3" lines={1} tone="inherit" className="text-white">{primary.bag.title}</T>
                <T variant="caption" lines={1} tone="inherit" className="font-semibold text-white/85">{primary.bag.subtitle}</T>
              </div>
            </BagArt>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-3" aria-live="polite">
                {primary.impact.signal === "unavailable" ? (
                  <UnavailableNotice impact={primary.impact} />
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <ImpactChip impact={primary.impact} />
                      <T variant="headline">{primary.impact.headline}</T>
                    </div>
                    <div className="rounded-2xl bg-sunken p-3">
                      <T variant="caption" tone="tertiary" className="mb-1 font-semibold uppercase tracking-wide">Why it could matter</T>
                      <T variant="footnote" tone="secondary">{primary.impact.points.find((point) => point.label === "Why it could matter")?.text ?? primary.impact.points[0]?.text}</T>
                    </div>
                  </>
                )}
              </div>
              {primary.impact.holdings.length ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <T variant="subhead">Affected holdings</T>
                    <T variant="caption" tone="secondary" className="font-semibold tabular-nums">{formatBps(primary.impact.exposureBps)} of bag</T>
                  </div>
                  {primary.impact.holdings.map((asset) => (
                    <Link key={asset.symbol} to="/asset/$symbol" params={{ symbol: asset.symbol }} search={{ bag: primary.bag.id }}
                      aria-label={`Explore ${asset.name}, ${formatBps(asset.weightBps)} target allocation`}
                      className={cn("flex min-h-12 items-center gap-2 rounded-xl border border-line p-2 hover:bg-sunken", focus)}>
                      <TokenAvatar symbol={asset.symbol} iconUrl={asset.iconUrl} size={30} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex justify-between gap-2"><T variant="subhead">{asset.symbol}</T><T variant="caption" tone="secondary">{formatBps(asset.weightBps)}</T></div>
                        <div className="h-1 overflow-hidden rounded-full bg-sunken" aria-hidden><div className="h-full bg-accent" style={{ width: `${asset.weightBps / 100}%` }} /></div>
                      </div>
                      <IoArrowForward size={15} className="text-accent" aria-hidden />
                    </Link>
                  ))}
                  <T variant="caption" tone="tertiary">Explore a holding for its details. Allocation is not a forecast of price impact.</T>
                </div>
              ) : null}
              {primary.impact.model ? (
                <details className="group rounded-2xl border border-line">
                  <summary className={cn("flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl p-3 text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden", focus)}>
                    Evidence, uncertainty & what to watch
                    <IoChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="border-t border-line p-3"><ImpactBreakdown impact={primary.impact} /></div>
                </details>
              ) : null}
              <Link to="/bag/$id" params={{ id: primary.bag.id }} className={cn("t-subhead inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent-soft px-4 text-accent hover:opacity-80", focus)}>
                Explore bag & risks <IoArrowForward size={17} aria-hidden />
              </Link>
              {primary.impact.model ? (
                <T variant="caption" tone="tertiary">AI interpretation of supplied excerpts, not full articles or investment advice.</T>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card">
          <T variant="headline">No bag linked yet</T>
          <T variant="footnote" tone="secondary">Explore the bags to see what Stockpile tracks.</T>
          <Link to="/bags" className={cn("t-subhead inline-flex min-h-11 items-center gap-1 text-accent", focus)}>Browse bags <IoArrowForward size={14} /></Link>
        </div>
      )}
      <a href={story.sourceUrl} target="_blank" rel="noreferrer" className={cn("flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:bg-sunken", focus)}>
        <IoNewspaper size={22} className="shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <T variant="subhead">{story.format === "podcast" ? "Listen to source" : story.format === "disclosure" ? "View filing" : "Read original source"}</T>
          <T variant="caption" tone="secondary">{story.publisher} · Opens in a new tab</T>
          <T variant="caption" tone="tertiary">{[date, storyHost(story.sourceUrl)].filter(Boolean).join(" · ")}</T>
        </div>
        <IoArrowForward size={18} className="shrink-0 text-accent" aria-hidden />
      </a>
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
                hasContextSidebar={!!active}
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
        <aside className="no-scrollbar hidden h-dvh w-[340px] shrink-0 overflow-y-auto py-6 xl:block 2xl:w-[380px]">
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
    return <FeedLoading />;
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
