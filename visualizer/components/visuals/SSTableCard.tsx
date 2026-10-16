import type { DiskComponent } from '@/engine/model';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';
import { BitArray } from './BitArray';
import { ComponentFrame } from './ComponentFrame';
import { RecordChip } from './RecordChip';

type SSTable = Extract<DiskComponent, { kind: 'sstable' }>;

export function SSTableCard({ table }: { table: SSTable }) {
  const { isRecordFocused, focus, problem } = useHighlight(table.id);
  const entryCount = table.blocks.reduce((total, block) => total + block.records.length, 0);
  return (
    <ComponentFrame
      componentId={table.id}
      material="disk"
      title={table.label}
      className={cn('w-full sm:w-[17rem]', table.status === 'deleted' && 'opacity-40', table.status === 'writing' && 'opacity-80')}
      meta={
        <span>
          {table.status === 'writing' ? 'being written' : table.status === 'deleted' ? 'deleted' : 'immutable'}, {entryCount} entries
          {table.showBlocks ? `, ${table.blocks.length} blocks` : ''}
        </span>
      }
    >
      {table.showSparseIndex && (
        <div className="mb-2 rounded-[2px] bg-ram-wash/50 px-2 py-1">
          <p className="text-[11.5px] text-ink-muted">Sparse index, kept in RAM</p>
          <ul className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11.5px]">
            {table.blocks.map((block, index) => (
              <li key={block.offset} className={cn(focus?.blockIndex === index && 'font-[700] text-ram')}>
                {block.firstKey} @{block.offset}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1.5">
        {table.blocks.map((block, index) => (
          <div
            key={block.offset}
            className={cn(table.showBlocks && 'rounded-[3px] border border-dashed border-rule p-1', table.showBlocks && focus?.blockIndex === index && (problem ? 'border-fault' : 'border-disk border-solid'))}
          >
            {table.showBlocks && (
              <p className="px-1 pb-0.5 text-[10.5px] text-ink-muted">
                Block {index + 1}, offset {block.offset}, {block.length} bytes
              </p>
            )}
            <div className="space-y-px">
              {block.records.map((record) => (
                <RecordChip key={record.recordId} record={record} material="disk" focused={isRecordFocused(record.recordId)} problem={problem} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {table.bloom && (
        <div className="mt-2 border-t border-rule pt-2">
          <BitArray bloom={table.bloom} probed={focus?.bits} zeroBit={focus?.zeroBit} />
        </div>
      )}
    </ComponentFrame>
  );
}
