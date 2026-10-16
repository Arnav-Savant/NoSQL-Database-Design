import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';

interface ComponentFrameProps {
  componentId: string;
  material: 'ram' | 'disk';
  title: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The shell around every component in the machine. Disk components look like files with a tab;
 * RAM components are flat panels. The frame lights up when the current step touches it.
 */
export function ComponentFrame({ componentId, material, title, meta, className, children }: ComponentFrameProps) {
  const { isTouched, problem } = useHighlight(componentId);
  return (
    <section
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn('min-w-0', material === 'disk' && 'pt-[18px]', className)}
    >
      {material === 'disk' ? (
        <div className="relative">
          <div
            className={cn(
              'absolute -top-[18px] left-0 flex h-[18px] max-w-[85%] items-center rounded-t-[5px] border border-b-0 px-2 font-mono text-[11px] text-disk',
              isTouched ? (problem ? 'border-fault bg-fault-wash' : 'border-disk bg-paper') : 'border-rule bg-paper-raised',
            )}
          >
            <span className="truncate">{title}</span>
          </div>
          <div
            className={cn(
              'rounded-[6px] rounded-tl-none border bg-paper-raised p-2 transition-colors',
              isTouched ? (problem ? 'border-fault' : 'border-disk') : 'border-rule',
            )}
          >
            {meta && <div className="mb-1.5 text-[11.5px] text-ink-muted">{meta}</div>}
            {children}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'rounded-[2px] border bg-paper-raised p-2 transition-colors',
            isTouched ? (problem ? 'border-fault' : 'border-ram') : 'border-rule',
          )}
        >
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[12.5px] font-[620] text-ram">{title}</span>
            {meta && <span className="ml-auto text-[11.5px] text-ink-muted">{meta}</span>}
          </div>
          {children}
        </div>
      )}
    </section>
  );
}
