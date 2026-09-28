import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchBagStories, fetchStories, type StoriesResult } from "@/services/api/feed";
import { queryKeys } from "./query-keys";

const nextCursor = (page: StoriesResult) => (page.status === "live" ? (page.nextCursor ?? undefined) : undefined);

/** Paginated public story feed (newest first). */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.feed,
    queryFn: ({ pageParam }) => fetchStories(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    staleTime: 2 * 60 * 1000,
  });
}

export function useBagStories(bagId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.bagStories(bagId ?? ""),
    queryFn: ({ pageParam }) => fetchBagStories(bagId as string, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled: !!bagId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Flattens pages; `unavailable` is reported from the first page. */
export function collectStories(pages: StoriesResult[] | undefined) {
  const first = pages?.[0];
  if (!first) return { status: "pending" as const };
  if (first.status === "unavailable") return { status: "unavailable" as const, message: first.message };
  const stories = pages.flatMap((page) => (page.status === "live" ? page.stories : []));
  const seen = new Set<string>();
  return {
    status: "live" as const,
    stories: stories.filter((story) => (seen.has(story.id) ? false : (seen.add(story.id), true))),
  };
}
