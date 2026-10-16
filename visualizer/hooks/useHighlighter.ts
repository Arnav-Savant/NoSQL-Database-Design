import { useEffect, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';
import { loadHighlighter } from '@/utils/highlighter';

/** The shared highlighter, loaded once on first use; null until it is ready. */
export function useHighlighter(): HighlighterCore | null {
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadHighlighter().then((loaded) => {
      if (!cancelled) setHighlighter(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return highlighter;
}
