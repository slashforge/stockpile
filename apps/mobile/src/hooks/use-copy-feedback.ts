import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text and flips a `copied` flag for `ms`. Use inside native sheets, where the
 * toast renders behind the sheet; outside sheets prefer a toast.
 */
export function useCopyFeedback(ms = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), ms);
    },
    [ms],
  );

  return { copied, copy };
}
