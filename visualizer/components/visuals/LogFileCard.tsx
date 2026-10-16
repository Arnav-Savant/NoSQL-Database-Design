import type { DiskComponent } from '@/engine/model';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';
import { ComponentFrame } from './ComponentFrame';
import { RecordChip } from './RecordChip';

type LogFile = Extract<DiskComponent, { kind: 'log-file' }>;

const STATUS_LABEL = { active: 'active, takes writes', closed: 'closed, read-only', deleted: 'deleted' } as const;

export function LogFileCard({ file }: { file: LogFile }) {
  const { isRecordFocused, problem } = useHighlight(file.id);
  const fill = file.capacityBytes ? Math.min(100, (file.usedBytes / file.capacityBytes) * 100) : undefined;
  return (
    <ComponentFrame
      componentId={file.id}
      material="disk"
      title={file.label}
      className={cn('w-full sm:w-[17rem]', file.status === 'deleted' && 'opacity-40')}
      meta={
        <span className="flex items-center gap-2">
          <span className={cn(file.status === 'active' && 'text-signal')}>{STATUS_LABEL[file.status]}</span>
          <span className="ml-auto tabular-nums">
            {file.usedBytes}
            {file.capacityBytes ? ` of ${file.capacityBytes}` : ''} bytes
          </span>
        </span>
      }
    >
      {fill !== undefined && (
        <div className="mb-2 h-1 w-full bg-rule" aria-hidden>
          <div className={cn('h-full', fill >= 100 ? 'bg-signal-fill' : 'bg-disk')} style={{ width: `${fill}%` }} />
        </div>
      )}
      <div className="space-y-px">
        {file.records.length === 0 && <p className="px-2 py-1 text-[12px] text-ink-muted">Empty</p>}
        {file.records.map((record) => (
          <RecordChip key={record.recordId} record={record} material="disk" prefix={String(record.offset)} focused={isRecordFocused(record.recordId)} problem={problem} />
        ))}
        {file.tornBytes !== undefined && (
          <div className="flex items-center gap-2 px-2 py-[3px]">
            <span className="w-7 text-right text-[10.5px] text-ink-muted">tail</span>
            <span className="flex gap-px">
              {Array.from({ length: file.tornBytes }, (_, index) => (
                <span key={index} className="size-3.5 bg-fault-wash ring-1 ring-fault ring-inset" />
              ))}
            </span>
            <span className="text-[11.5px] text-fault">{file.tornBytes} torn bytes</span>
          </div>
        )}
      </div>
    </ComponentFrame>
  );
}
