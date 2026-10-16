import { useEffect, useRef } from 'react';
import type { ByteCell, DiskComponent } from '@/engine/model';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';
import { ComponentFrame } from './ComponentFrame';

type ByteFile = Extract<DiskComponent, { kind: 'byte-file' }>;

const ROLE_STYLE: Record<ByteCell['role'], string> = {
  key: 'bg-paper text-ink',
  separator: 'bg-paper text-ink-muted',
  value: 'bg-disk-wash text-disk',
  pointer: 'bg-ram-wash text-ram',
  spill: 'bg-disk-wash text-disk',
  free: 'bg-transparent text-transparent',
  overwritten: 'bg-fault-wash text-fault ring-2 ring-inset ring-fault',
};

/** One cell per byte on disk, with an offset tick every 8 bytes. */
export function ByteStrip({ file }: { file: ByteFile }) {
  const { focus } = useHighlight(file.id);
  const [from, to] = focus?.byteRange ?? [-1, -2];
  const scroller = useRef<HTMLDivElement | null>(null);

  // The strip is wider than the screen; keep the bytes this step is about in view.
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>('[data-attention="true"]');
    if (!target) return;
    const left = target.offsetLeft - container.clientWidth / 3;
    container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [from, to, file.cells]);

  return (
    <ComponentFrame componentId={file.id} material="disk" title={file.label} meta={`${file.cells.length} bytes`} className="w-full">
      <div ref={scroller} className="relative overflow-x-auto pb-1" tabIndex={0} aria-label={`Bytes of ${file.label}`}>
        <div className="flex w-max gap-px">
          {file.cells.map((cell) => {
            const inRange = cell.offset >= from && cell.offset <= to;
            const attention = (inRange && cell.offset === from) || cell.role === 'overwritten';
            return (
              <div key={cell.offset} className="flex w-[22px] flex-col items-center" data-attention={attention || undefined}>
                <span className="h-3.5 text-[9.5px] leading-none text-ink-muted tabular-nums">{cell.offset % 8 === 0 ? cell.offset : ''}</span>
                <span
                  className={cn(
                    'flex h-7 w-[22px] items-center justify-center font-mono text-[12px]',
                    ROLE_STYLE[cell.role],
                    inRange && cell.role !== 'overwritten' && 'outline-2 -outline-offset-2 outline-disk',
                  )}
                >
                  {cell.role === 'free' ? '' : cell.char === ' ' ? ' ' : cell.char}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ComponentFrame>
  );
}
