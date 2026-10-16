import type { StageComponentInfo } from '@/content/types';
import { cn } from '@/utils/cn';

const LOCATION_LABEL = { ram: 'RAM', disk: 'Disk', logic: 'Logic' } as const;

export function ComponentList({ components }: { components: StageComponentInfo[] }) {
  if (components.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {components.map((component) => (
        <div key={component.name} className="contents">
          <dt className="flex items-baseline gap-2">
            <span
              className={cn(
                'rounded-[2px] px-1.5 text-[11.5px] leading-5',
                component.location === 'ram' && 'bg-ram-wash text-ram',
                component.location === 'disk' && 'bg-disk-wash text-disk',
                component.location === 'logic' && 'bg-paper-raised text-ink-muted ring-1 ring-rule',
              )}
            >
              {LOCATION_LABEL[component.location]}
            </span>
            <span className="font-[620]">{component.name}</span>
          </dt>
          <dd className="text-[15px] leading-relaxed text-ink">{component.purpose}</dd>
        </div>
      ))}
    </dl>
  );
}
