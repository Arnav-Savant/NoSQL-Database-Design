import { motion, useReducedMotion } from 'motion/react';
import type { IoEvent } from '@/engine/trace';
import { cn } from '@/utils/cn';

/** The boundary between RAM and disk. It pulses in the material of the work done in this step. */
export function Bus({ io, stepKey, blockedWrites }: { io: IoEvent[]; stepKey: string; blockedWrites?: boolean }) {
  const reduceMotion = useReducedMotion();
  const touchesDisk = io.some((event) => event.kind.startsWith('disk'));
  const touchesRam = io.some((event) => event.kind.startsWith('ram'));
  const tone = touchesDisk ? 'bg-disk' : touchesRam ? 'bg-ram' : 'bg-rule';

  return (
    <div className="relative flex h-6 items-center bg-paper px-3 sm:px-4" aria-hidden>
      <div className="h-px w-full border-t border-dashed border-ink-muted/50" />
      {(touchesDisk || touchesRam) && !reduceMotion && (
        <motion.div
          key={stepKey}
          className={cn('absolute top-1/2 left-0 h-[3px] -translate-y-1/2', tone)}
          initial={{ width: '0%', opacity: 0.9 }}
          animate={{ width: '100%', opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
      {blockedWrites && (
        <span className="absolute right-3 rounded-[2px] bg-fault-wash px-2 text-[11px] text-fault sm:right-4">writes are waiting</span>
      )}
    </div>
  );
}
