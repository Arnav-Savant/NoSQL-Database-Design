import type { RamComponent, RecordView } from '@/engine/model';
import { cn } from '@/utils/cn';
import { ComponentFrame } from './ComponentFrame';
import { ValueText } from './ValueText';

type Merge = Extract<RamComponent, { kind: 'merge-lanes' }>;

function Lane({ label, records, pointer }: { label: string; records: RecordView[]; pointer?: number }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
      <span className="pt-4 text-[11.5px] text-ink-muted">{label}</span>
      <ol className="flex flex-wrap gap-1">
        {records.map((record, index) => (
          <li key={record.recordId} className="flex flex-col items-center">
            <span
              aria-hidden
              className={cn(
                'mb-0.5 size-0 border-x-[5px] border-t-[6px] border-x-transparent',
                index === pointer ? 'border-t-ram' : 'border-t-transparent',
              )}
            />
            <span
              className={cn(
                'rounded-[2px] bg-paper px-1.5 py-0.5 font-mono text-[11.5px]',
                pointer !== undefined && index < pointer && 'opacity-40',
                index === pointer && 'ring-2 ring-ram',
              )}
            >
              {record.key} <ValueText value={record.value} />
            </span>
          </li>
        ))}
        {pointer !== undefined && pointer >= records.length && <li className="self-end pb-0.5 text-[11px] text-ink-muted">done</li>}
      </ol>
    </div>
  );
}

export function MergeLanes({ merge }: { merge: Merge }) {
  return (
    <ComponentFrame componentId={merge.id} material="ram" title={merge.label} meta="two-pointer merge" className="w-full">
      <div className="space-y-2">
        <Lane label={merge.older.name} records={merge.older.records} pointer={merge.olderPointer} />
        <Lane label={merge.newer.name} records={merge.newer.records} pointer={merge.newerPointer} />
        <div className="border-t border-rule pt-2">
          <Lane label="Output" records={merge.output} />
        </div>
        {merge.decision && <p className="text-[12.5px] leading-snug text-ink">{merge.decision}</p>}
      </div>
    </ComponentFrame>
  );
}
