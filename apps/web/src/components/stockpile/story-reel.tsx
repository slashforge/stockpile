import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IoArrowForward,
  IoChevronUp,
  IoDocumentText,
  IoHeadset,
  IoHourglassOutline,
  IoNewspaper,
  IoPlay,
  IoSparkles,
} from "react-icons/io5";
import { gradients, useScheme } from "@/components/ui/theme";
import { T } from "@/components/ui/type";
import { useBagReturns } from "@/hooks/use-returns";
import { parseHex } from "@/lib/asset-colors";
import { bagCurator, isDisclosureStory } from "@/lib/market";
import { isPreIpoBag } from "@/lib/pre-ipo";
import { displayTicker, isSharpEnough, leadAsset, storyAge, storyImageSources } from "@/lib/story";
import { connectionFor, type Story } from "@/services/api/feed";
import type { Bag } from "@/services/api/types";
import { safeIconUrl } from "@/utils/token-icon";
import { bagTheme, hashString, LogoCluster } from "./bag-art";
import { BagReturnsLine, CuratorLine } from "./market";
import { TokenAvatar } from "./token-avatar";

export function formatStoryDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function storyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function rgba(hex: string, alpha: number) {
  const rgb = parseHex(hex);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})` : `rgba(77,163,255,${alpha})`;
}

const INK = "rgba(9,11,20,";
/** Share of the reel height the photo occupies before fading into the text area. */
const PHOTO_SHARE = 0.7;
const COMPANY_SUFFIX = /\s+(xStocks?|PreStocks?|Tokenized.*|Token)$/i;

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: Math.round(entry!.contentRect.width), height: Math.round(entry!.contentRect.height) }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, box };
}

/**
 * Photo layout: the photo fills the top of the reel edge to edge and fades into the dark text area.
 * Photos too small to fill that area sharply are rejected (the poster shows instead).
 */
function PhotoBackdrop({
  uri,
  box,
  onError,
  onSoft,
}: {
  uri: string;
  box: { width: number; height: number };
  onError: () => void;
  onSoft: () => void;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: `${PHOTO_SHARE * 100}%` }} aria-hidden>
      <img
        src={uri}
        alt=""
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full object-cover transition-opacity duration-200"
        style={{ opacity: ready ? 1 : 0 }}
        onError={onError}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (!isSharpEnough({ width: image.naturalWidth, height: image.naturalHeight }, box)) return onSoft();
          setReady(true);
        }}
      />
      {ready ? (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${INK}0) 45%, ${INK}0.35) 68%, ${INK}0.85) 88%, ${INK}1) 100%)`,
          }}
        />
      ) : null}
    </div>
  );
}

/** No-photo layout: a quiet brand-tinted wash with the lead company set as type. */
function PosterBackdrop({ story, bag, showLead }: { story: Story; bag: Bag | undefined; showLead: boolean }) {
  const scheme = useScheme();
  const seed = hashString(story.id);
  const lead = bag ? leadAsset(`${story.title} ${story.summary}`, bag.assets) : undefined;
  const fallback = gradients[scheme][bag ? bagTheme(bag).gradient : (["blue", "rose", "coral", "mint", "sky"] as const)[seed % 5]!];
  const brand = lead?.brandColor && parseHex(lead.brandColor) ? lead.brandColor : fallback[0];
  const company = lead?.name.replace(COMPANY_SUFFIX, "").trim();
  return (
    <div className="absolute inset-0 bg-reel" aria-hidden>
      {showLead ? (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(215deg, ${rgba(brand, 0.55)} 0%, ${rgba(fallback[1], 0.18)} 40%, ${INK}0) 75%)`,
          }}
        />
      ) : null}
      {lead && showLead ? (
        <div className="absolute inset-x-4 top-[88px] flex flex-col gap-1.5 md:inset-x-6">
          <TokenAvatar
            symbol={lead.symbol}
            iconUrl={lead.iconUrl}
            size={56}
            className="mb-2.5 self-start shadow-[0_0_0_2px_rgba(255,255,255,0.2)]"
          />
          <span className="truncate text-[64px] leading-[68px] font-black tracking-[-2px] text-white">
            {displayTicker(lead.symbol)}
          </span>
          {company ? <span className="truncate text-[17px] font-semibold text-white/60">{company}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ReelBackdrop({ story, bag, box }: { story: Story; bag: Bag | undefined; box: { width: number; height: number } }) {
  const imageUrl = safeIconUrl(story.imageUrl);
  const scale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const photoBox = useMemo(
    () => ({ width: box.width * scale, height: box.height * PHOTO_SHARE * scale }),
    [box.width, box.height, scale],
  );
  // Landscape sources cover the photo area at its height, so request the width that needs.
  const sources = useMemo(
    () => (imageUrl && photoBox.width > 0 ? storyImageSources(imageUrl, Math.max(photoBox.width, (photoBox.height * 16) / 9)) : []),
    [imageUrl, photoBox],
  );
  const [failed, setFailed] = useState<string[]>([]);
  const [soft, setSoft] = useState(false);
  const uri = soft ? undefined : sources.find((source) => !failed.includes(source));
  return (
    <>
      <PosterBackdrop story={story} bag={bag} showLead={!uri} />
      {uri ? (
        <PhotoBackdrop
          key={uri}
          uri={uri}
          box={photoBox}
          onError={() => setFailed((prev) => [...prev, uri])}
          onSoft={() => setSoft(true)}
        />
      ) : null}
    </>
  );
}

function GlassChip({ icon: Icon, label }: { icon: typeof IoNewspaper; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full bg-[rgba(16,19,31,0.42)] px-2.5 py-1.5 text-white backdrop-blur-md">
      <Icon size={13} />
      <T as="span" variant="caption" tone="inherit" className="font-semibold">
        {label}
      </T>
    </span>
  );
}

export function StoryReel({
  story,
  bags,
  bottomInset = 0,
  onOpenBag,
}: {
  story: Story;
  bags: Bag[];
  bottomInset?: number;
  onOpenBag: (bagId: string) => void;
}) {
  const { ref, box } = useBox<HTMLElement>();
  const bag = bags[0];
  const returns = useBagReturns();
  const age = storyAge(story.publishedAt);
  const hasImage = !!safeIconUrl(story.imageUrl);
  const connection = bag ? connectionFor(story, bag.id) : undefined;
  const podcast = story.format === "podcast";
  const disclosure = isDisclosureStory(story);
  const lead = bag ? leadAsset(`${story.title} ${story.summary}`, bag.assets) : undefined;
  const kickerColor = lead?.brandColor && parseHex(lead.brandColor) ? lead.brandColor : "var(--ds-accent)";
  const kind = podcast ? "Podcast" : disclosure ? "Disclosure" : "News";
  const cta = podcast ? "Listen" : disclosure ? "View filing" : "Read story";

  return (
    <article
      ref={ref}
      className="relative flex h-full w-full shrink-0 flex-col justify-between overflow-hidden bg-reel"
      aria-label={story.title}
    >
      {box.width > 0 ? <ReelBackdrop key={story.id} story={story} bag={bag} box={box} /> : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[120px]" style={{ background: `linear-gradient(180deg, ${INK}0.55), ${INK}0))` }} />

      <div className="relative flex flex-wrap gap-2 px-4 pt-4 md:px-6 md:pt-5">
        <GlassChip icon={podcast ? IoHeadset : disclosure ? IoDocumentText : IoNewspaper} label={kind} />
        {story.provenance === "ai" ? <GlassChip icon={IoSparkles} label="AI summary" /> : null}
        {bag && isPreIpoBag(bag) ? <GlassChip icon={IoHourglassOutline} label="Pre-IPO" /> : null}
      </div>

      <div className="relative flex flex-col gap-2 px-4 md:px-6" style={{ paddingBottom: bottomInset + 16 }}>
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-[3px] rounded-sm" style={{ backgroundColor: kickerColor }} />
          <T as="span" variant="overline" tone="inherit" lines={1} className="tracking-[1.2px] text-white">
            {story.publisher}
          </T>
          {age ? (
            <T as="span" variant="caption" tone="inherit" className="shrink-0 font-semibold text-white/60">
              {age}
            </T>
          ) : null}
        </div>
        <T as="h2" variant="title1" tone="inherit" lines={4} className="text-shadow-reel font-extrabold tracking-[-0.4px] text-white">
          {story.title}
        </T>
        <T variant="callout" tone="inherit" lines={3} className="text-white/85">
          {story.summary}
        </T>

        <div className="mt-0.5 flex items-center gap-2">
          <a
            href={story.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${cta} at ${story.publisher}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-4 text-[#10131F] transition-opacity hover:opacity-90"
          >
            <T as="span" variant="subhead" tone="inherit" className="font-bold">
              {cta}
            </T>
            {podcast ? <IoPlay size={15} /> : <IoArrowForward size={15} />}
          </a>
          <div className="flex min-w-0 flex-1 flex-col">
            <T variant="caption" tone="inherit" lines={1} className="text-white/60">
              {storyHost(story.sourceUrl)}
            </T>
            {connection && connection.relationship !== "direct" ? (
              <T variant="caption" tone="inherit" lines={1} className="text-white/60">
                Related theme
              </T>
            ) : hasImage && story.imageCredit ? (
              <T variant="caption" tone="inherit" lines={1} className="text-white/60">
                Image: {story.imageCredit}
              </T>
            ) : null}
          </div>
        </div>

        {bag ? (
          <button
            type="button"
            onClick={() => onOpenBag(bag.id)}
            aria-label={`Related bag: ${bag.title}${bags.length > 1 ? `, and ${bags.length - 1} more` : ""}`}
            className="mt-1 flex items-center gap-2.5 rounded-3xl bg-surface p-2.5 pl-3 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            <LogoCluster assets={bag.assets} size={34} limit={3} />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <T variant="headline" lines={1}>
                {bag.title}
              </T>
              <BagReturnsLine entry={returns.data?.[bag.id]} loading={returns.isPending} compact />
              <CuratorLine curator={bagCurator(bag)} />
            </div>
            {bags.length > 1 ? (
              <T as="span" variant="caption" tone="secondary" className="font-bold">
                +{bags.length - 1}
              </T>
            ) : null}
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <IoChevronUp size={18} />
            </span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
