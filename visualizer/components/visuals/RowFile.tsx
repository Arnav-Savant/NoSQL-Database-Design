import type { DiskComponent } from '@/engine/model';
import { cn } from '@/utils/cn';
import { useHighlight } from '../machine/machineContext';
import { ComponentFrame } from './ComponentFrame';

type RowFileComponent = Extract<DiskComponent, { kind: 'row-file' }>;

/** Fixed-size rows drawn with column widths proportional to their byte sizes. */
export function RowFile({ file }: { file: RowFileComponent }) {
  const { focus } = useHighlight(file.id);
  const rowBytes = file.columns.reduce((total, column) => total + column.bytes, 0);
  return (
    <ComponentFrame componentId={file.id} material="disk" title={file.label} meta={`${file.rows.length} rows of ${rowBytes} bytes`}>
      <div className="overflow-x-auto">
        <div className="min-w-[30rem] space-y-1">
          <div className="grid gap-px pl-12 text-[10.5px] text-ink-muted" style={{ gridTemplateColumns: file.columns.map((c) => `${c.bytes}fr`).join(' ') }}>
            {file.columns.map((column) => (
              <span key={column.name} className="truncate px-1">
                {column.name} <span className="tabular-nums">{column.bytes} B</span>
              </span>
            ))}
          </div>
          {file.rows.map((row, index) => {
            const focused = focus?.recordIds?.includes(`row:${row.id}`);
            const focusedColumn = focused ? focus?.blockIndex : undefined;
            return (
              <div key={row.id} className="flex items-stretch gap-2">
                <span className="w-10 shrink-0 self-center text-right font-mono text-[10.5px] text-ink-muted tabular-nums">{index * rowBytes}</span>
                <div
                  className={cn('grid flex-1 gap-px rounded-[3px] bg-rule p-px', focused && 'ring-2 ring-disk')}
                  style={{ gridTemplateColumns: file.columns.map((c) => `${c.bytes}fr`).join(' ') }}
                >
                  {row.cells.map((cell, cellIndex) => (
                    <span
                      key={file.columns[cellIndex]?.name}
                      className={cn(
                        'truncate bg-paper px-1.5 py-1 font-mono text-[12px]',
                        focusedColumn === cellIndex && 'bg-disk-wash text-disk outline-2 -outline-offset-2 outline-disk',
                      )}
                    >
                      {cell}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ComponentFrame>
  );
}
