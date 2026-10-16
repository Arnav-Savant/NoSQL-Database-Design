import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

const BAND = {
  ram: { title: 'RAM', subtitle: 'Fast. Cleared when power is lost.', wash: 'bg-ram-wash/55', ink: 'text-ram' },
  disk: { title: 'Disk', subtitle: 'Slower to reach. Survives restarts.', wash: 'bg-disk-wash/55', ink: 'text-disk' },
} as const;

export function MachineBand({ location, children, empty }: { location: 'ram' | 'disk'; children: ReactNode; empty?: string }) {
  const band = BAND[location];
  return (
    <div className={cn('grid gap-3 px-3 py-3 sm:grid-cols-[6.5rem_1fr] sm:px-4', band.wash)}>
      <div>
        <p className={cn('font-wide text-[15px] font-[700]', band.ink)}>{band.title}</p>
        <p className="text-[11.5px] leading-snug text-ink-muted">{band.subtitle}</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-3">{children ?? <p className="py-2 text-[12.5px] text-ink-muted">{empty}</p>}</div>
    </div>
  );
}
