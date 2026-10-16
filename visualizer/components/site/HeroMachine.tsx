import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { heroWrite } from '@/engine/architectures/overviewHero';
import { Machine } from '../machine/Machine';

const STEP_MS = 1100;

/** Plays one write through the machine once, then holds on the final state. */
export function HeroMachine() {
  const steps = useMemo(() => heroWrite(), []);
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(reduceMotion ? steps.length - 1 : 0);

  useEffect(() => {
    if (reduceMotion || index >= steps.length - 1) return;
    const timer = window.setTimeout(() => setIndex((current) => current + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [index, reduceMotion, steps.length]);

  const step = steps[index];
  if (!step) return null;
  return (
    <div className="space-y-3">
      <Machine id="hero" state={step.state} step={step} />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite">
        <p className="font-[640]">{step.title}</p>
        <p className="text-[14.5px] text-ink-muted">{step.narration}</p>
        {index === steps.length - 1 && !reduceMotion && (
          <button type="button" onClick={() => setIndex(0)} className="text-[13.5px] text-ram underline underline-offset-4">
            Play again
          </button>
        )}
      </div>
    </div>
  );
}
