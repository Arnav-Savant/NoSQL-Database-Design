import { useCallback, useEffect, useState } from 'react';
import type { Step } from '@/engine/trace';

export interface WalkthroughControls {
  step: Step | undefined;
  index: number;
  count: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  previous: () => void;
  first: () => void;
  last: () => void;
  goTo: (index: number) => void;
}

/** Steps through a recorded trace. Changing the trace (another walkthrough or stage) restarts at step 1. */
export function useWalkthrough(steps: readonly Step[]): WalkthroughControls {
  const [index, setIndex] = useState(0);
  const count = steps.length;

  useEffect(() => setIndex(0), [steps]);

  const goTo = useCallback((target: number) => setIndex(Math.max(0, Math.min(count - 1, target))), [count]);
  const clamped = Math.min(index, Math.max(0, count - 1));

  return {
    step: steps[clamped],
    index: clamped,
    count,
    isFirst: clamped === 0,
    isLast: clamped >= count - 1,
    next: () => goTo(clamped + 1),
    previous: () => goTo(clamped - 1),
    first: () => goTo(0),
    last: () => goTo(count - 1),
    goTo,
  };
}
