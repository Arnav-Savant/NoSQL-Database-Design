import type { RecordView } from '../model';
import { compareKeys } from './keyOrder';

export interface MergeStep {
  olderPointer: number;
  newerPointer: number;
  decision: string;
  emitted: RecordView | null;
  output: RecordView[];
}

/** Yields every comparison of a two-pointer merge; on equal keys the newer record wins. */
export function* mergeSteps(older: readonly RecordView[], newer: readonly RecordView[], dropTombstones: boolean): Generator<MergeStep> {
  const output: RecordView[] = [];
  let left = 0;
  let right = 0;

  const emit = (record: RecordView): RecordView | null => {
    if (dropTombstones && record.value.type === 'tombstone') return null;
    const kept = { ...record, recordId: `merged:${record.key}` };
    output.push(kept);
    return kept;
  };

  while (left < older.length || right < newer.length) {
    const olderRecord = older[left];
    const newerRecord = newer[right];
    const pointers = { olderPointer: left, newerPointer: right };

    if (olderRecord && newerRecord) {
      const order = compareKeys(olderRecord.key, newerRecord.key);
      if (order < 0) {
        const emitted = emit(olderRecord);
        left++;
        yield { ...pointers, decision: `${olderRecord.key} sorts first, so take it from the older table`, emitted, output: [...output] };
      } else if (order > 0) {
        const emitted = emit(newerRecord);
        right++;
        yield { ...pointers, decision: `${newerRecord.key} sorts first, so take it from the newer table`, emitted, output: [...output] };
      } else {
        const emitted = emit(newerRecord);
        left++;
        right++;
        const dropped = emitted === null ? ' It is a tombstone and this merge includes the oldest data, so it is dropped too.' : '';
        yield { ...pointers, decision: `Both tables have ${newerRecord.key}. The newer value ${newerRecord.value.display} wins and ${olderRecord.value.display} is discarded.${dropped}`, emitted, output: [...output] };
      }
    } else if (olderRecord) {
      const emitted = emit(olderRecord);
      left++;
      yield { ...pointers, decision: `The newer table is done; copy ${olderRecord.key} from the older table`, emitted, output: [...output] };
    } else if (newerRecord) {
      const emitted = emit(newerRecord);
      right++;
      yield { ...pointers, decision: `The older table is done; copy ${newerRecord.key} from the newer table`, emitted, output: [...output] };
    }
  }
}
