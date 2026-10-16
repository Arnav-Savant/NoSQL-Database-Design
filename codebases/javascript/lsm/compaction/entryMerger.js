import { compareKeys } from '../entry/keyOrder.js';

/** Two-pointer merge of two sorted entry lists; on equal keys the newer entry wins. */
export class EntryMerger {
  merge(olderEntries, newerEntries, dropTombstones) {
    const entries = [];
    let duplicatesDropped = 0;
    let tombstonesDropped = 0;

    const emit = (entry) => {
      if (dropTombstones && entry.isTombstone()) tombstonesDropped++;
      else entries.push(entry);
    };

    let older = 0;
    let newer = 0;
    while (older < olderEntries.length && newer < newerEntries.length) {
      const order = compareKeys(olderEntries[older].key, newerEntries[newer].key);
      if (order < 0) emit(olderEntries[older++]);
      else if (order > 0) emit(newerEntries[newer++]);
      else {
        emit(newerEntries[newer++]);
        older++;
        duplicatesDropped++;
      }
    }
    while (older < olderEntries.length) emit(olderEntries[older++]);
    while (newer < newerEntries.length) emit(newerEntries[newer++]);

    return { entries, duplicatesDropped, tombstonesDropped };
  }
}
