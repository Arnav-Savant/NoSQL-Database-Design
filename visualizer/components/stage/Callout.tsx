import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

type CalloutKind = 'note' | 'tradeoff' | 'aside';

const KIND_STYLE: Record<CalloutKind, { border: string; label: string }> = {
  note: { border: 'border-ram', label: 'Note' },
  tradeoff: { border: 'border-disk', label: 'Trade-off' },
  aside: { border: 'border-rule', label: 'Aside' },
};

export function Callout({ kind, title, children }: { kind: CalloutKind; title: string; children: ReactNode }) {
  const style = KIND_STYLE[kind];
  return (
    <aside className={cn('border-l-[3px] py-1 pl-4', style.border)}>
      <p className="text-[13px] text-ink-muted">{style.label}</p>
      <h3 className="mt-0.5 text-[16px] font-[640]">{title}</h3>
      <div className="mt-1.5 space-y-2 text-[15px] leading-relaxed text-ink">{children}</div>
    </aside>
  );
}
