import type { IoEvent, Step } from '@/engine/trace';
import { cn } from '@/utils/cn';

const IO_LABEL: Record<IoEvent['kind'], string> = {
  'ram-read': 'RAM read',
  'ram-write': 'RAM write',
  'disk-sequential-read': 'Disk read, sequential',
  'disk-random-read': 'Disk read, random seek',
  'disk-append': 'Disk append',
  'disk-overwrite': 'Disk overwrite',
  'disk-create': 'Disk file created',
  'disk-delete': 'Disk file deleted',
};

export function NarrationPanel({ step }: { step: Step | undefined }) {
  if (!step) return null;
  const problem = step.outcome === 'problem';
  return (
    <div className={cn('border-l-[3px] pl-4', problem ? 'border-fault' : 'border-ink')} aria-live="polite">
      <h3 className={cn('text-[17px] font-[650]', problem && 'text-fault')}>{step.title}</h3>
      <p className="mt-1 max-w-[72ch] text-[15.5px] leading-relaxed">{step.narration}</p>
      {step.io.length > 0 && (
        <ul className="mt-3 space-y-1">
          {step.io.map((event, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span
                className={cn(
                  'rounded-[2px] px-1.5 text-[11.5px]',
                  event.kind.startsWith('ram') ? 'bg-ram-wash text-ram' : 'bg-disk-wash text-disk',
                )}
              >
                {IO_LABEL[event.kind]}
              </span>
              <span className="font-mono text-[12px] text-ink">{event.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
