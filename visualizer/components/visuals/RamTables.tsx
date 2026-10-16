import type { RamComponent } from '@/engine/model';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';
import { ComponentFrame } from './ComponentFrame';
import { RecordChip } from './RecordChip';

type OffsetMap = Extract<RamComponent, { kind: 'offset-map' }>;
type Memtable = Extract<RamComponent, { kind: 'memtable' }>;
type BlockBuffer = Extract<RamComponent, { kind: 'block-buffer' }>;

export function OffsetMapTable({ map }: { map: OffsetMap }) {
  return (
    <ComponentFrame componentId={map.id} material="ram" title={map.label} meta={`${map.rows.length} keys`} className="w-full sm:w-[15rem]">
      {map.rows.length === 0 ? (
        <p className="text-[12px] text-ink-muted">Empty</p>
      ) : (
        <table className="w-full font-mono text-[12px]">
          <tbody>
            {map.rows.map((row) => (
              <tr key={row.key} className="border-t border-rule/70 first:border-t-0">
                <td className="py-0.5 pr-2">{row.key}</td>
                <td className="py-0.5 text-right text-ram">{row.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ComponentFrame>
  );
}

export function MemtableTable({ memtable }: { memtable: Memtable }) {
  const { isRecordFocused, problem } = useHighlight(memtable.id);
  const dirty = memtable.rows.filter((row) => row.state === 'dirty').length;
  const meta = memtable.capacity !== undefined ? `${memtable.rows.length} of ${memtable.capacity} slots, ${dirty} dirty` : `${memtable.rows.length} keys`;
  return (
    <ComponentFrame componentId={memtable.id} material="ram" title={memtable.label} meta={meta} className="w-full sm:w-[17rem]">
      <div className="space-y-px">
        {memtable.rows.length === 0 && <p className="text-[12px] text-ink-muted">Empty</p>}
        {memtable.rows.map((row) => (
          <RecordChip key={row.recordId} record={row} material="ram" focused={isRecordFocused(row.recordId)} problem={problem} />
        ))}
      </div>
      {memtable.rows.some((row) => row.state) && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="inline-block h-3 w-[3px] bg-signal-fill" aria-hidden /> dirty: only in the WAL so far
        </p>
      )}
    </ComponentFrame>
  );
}

export function BlockBufferView({ buffer }: { buffer: BlockBuffer }) {
  const probe = buffer.probe;
  return (
    <ComponentFrame componentId={buffer.id} material="ram" title={buffer.label} meta="binary search in memory" className="w-full sm:w-[17rem]">
      <ol className="space-y-px">
        {buffer.records.map((record, index) => {
          const marks = probe ? [index === probe.low && 'low', index === probe.mid && 'mid', index === probe.high && 'high'].filter(Boolean).join(' ') : '';
          return (
            <li key={record.recordId} className="flex items-center gap-1.5">
              <span className={cn('w-16 shrink-0 text-right text-[10.5px]', index === probe?.mid ? 'text-ram' : 'text-ink-muted')}>{marks}</span>
              <div className={cn('flex-1', index === probe?.mid && 'ring-2 ring-ram')}>
                <RecordChip record={record} material="ram" />
              </div>
            </li>
          );
        })}
      </ol>
    </ComponentFrame>
  );
}
