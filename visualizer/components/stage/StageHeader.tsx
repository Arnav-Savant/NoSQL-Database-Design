import type { StageMeta } from '@/content/types';

export function StageHeader({ stage, summary }: { stage: StageMeta; summary?: string }) {
  return (
    <header className="max-w-[72ch]">
      <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span aria-hidden className="font-widest text-[44px] leading-none font-[260] text-ink-muted tabular-nums">
          {String(stage.number).padStart(2, '0')}
        </span>
        <span className="sr-only">Stage {stage.number}: </span>
        <span className="font-wide text-[32px] leading-[1.1] font-[720] tracking-[-0.01em] sm:text-[40px]">{stage.title}</span>
      </h1>
      {summary && <p className="mt-4 text-[17px] leading-relaxed text-ink">{summary}</p>}
    </header>
  );
}
