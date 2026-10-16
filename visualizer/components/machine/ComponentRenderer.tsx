import type { MachineComponent } from '@/engine/model';
import { ByteStrip } from '../visuals/ByteStrip';
import { LogFileCard } from '../visuals/LogFileCard';
import { MergeLanes } from '../visuals/MergeLanes';
import { BlockBufferView, MemtableTable, OffsetMapTable } from '../visuals/RamTables';
import { RowFile } from '../visuals/RowFile';
import { SSTableCard } from '../visuals/SSTableCard';

export function ComponentRenderer({ component }: { component: MachineComponent }) {
  switch (component.kind) {
    case 'offset-map':
      return <OffsetMapTable map={component} />;
    case 'memtable':
      return <MemtableTable memtable={component} />;
    case 'merge-lanes':
      return <MergeLanes merge={component} />;
    case 'block-buffer':
      return <BlockBufferView buffer={component} />;
    case 'row-file':
      return <RowFile file={component} />;
    case 'byte-file':
      return <ByteStrip file={component} />;
    case 'log-file':
      return <LogFileCard file={component} />;
    case 'sstable':
      return <SSTableCard table={component} />;
    default: {
      const unreachable: never = component;
      throw new Error(`No renderer for ${JSON.stringify(unreachable)}`);
    }
  }
}
