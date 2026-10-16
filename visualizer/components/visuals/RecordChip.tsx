import { motion } from 'motion/react';
import type { RecordView } from '@/engine/model';
import { cn } from '@/utils/cn';
import { ValueText } from './ValueText';

interface RecordChipProps {
  record: RecordView;
  focused?: boolean;
  problem?: boolean;
  material: 'ram' | 'disk';
  prefix?: string;
}

/** One key and its value. Stale is struck through, dirty has a signal edge, focus gets an outline. */
export function RecordChip({ record, focused = false, problem = false, material, prefix }: RecordChipProps) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: record.stale ? 0.45 : 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn(
        'flex min-w-0 items-baseline gap-2 border-l-[3px] border-transparent px-2 py-[3px] font-mono text-[12px] leading-5',
        material === 'ram' ? 'rounded-[2px] bg-paper' : 'rounded-[3px] bg-paper',
        record.state === 'dirty' && 'border-signal-fill',
        focused && !problem && (material === 'ram' ? 'ring-2 ring-ram' : 'ring-2 ring-disk'),
        focused && problem && 'ring-2 ring-fault',
      )}
      data-focused={focused || undefined}
    >
      {prefix !== undefined && <span className="w-7 shrink-0 text-right text-[10.5px] text-ink-muted tabular-nums">{prefix}</span>}
      <span className={cn('truncate text-ink', record.stale && 'line-through decoration-ink-muted')}>{record.key}</span>
      <ValueText value={record.value} className={cn('ml-auto shrink-0', record.stale && 'line-through')} />
    </motion.div>
  );
}
