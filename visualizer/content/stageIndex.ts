import type { StageMeta } from './types';

/** The fixed order of the journey. Every other list of stages derives from this one. */
export const STAGE_INDEX: readonly StageMeta[] = [
  { id: 's00', number: 0, slug: 'requirements', title: 'Requirements', problem: 'What the database must do, and how every design is judged.' },
  { id: 's01', number: 1, slug: 'relational-rows', title: 'How a relational database stores rows', problem: 'A fixed schema makes every address computable.' },
  { id: 's02', number: 2, slug: 'naive-key-value', title: 'A naive key-value file', problem: 'Keys of any length break address arithmetic, and growing values corrupt neighbours.' },
  { id: 's03', number: 3, slug: 'pointer-splitting', title: 'Splitting values with pointers', problem: 'Spilling values elsewhere avoids corruption but scatters reads across the disk.' },
  { id: 's04', number: 4, slug: 'append-only', title: 'Append instead of overwrite', problem: 'Never edit in place: every change becomes a new record at the end.' },
  { id: 's05', number: 5, slug: 'hash-index', title: 'An in-memory hash index', problem: 'Reads scan the whole log; remember where each key lives instead.' },
  { id: 's06', number: 6, slug: 'single-log-compaction', title: 'Compacting one huge log', problem: 'Removing stale records from a live file blocks writes and shifts offsets.' },
  { id: 's07', number: 7, slug: 'log-segments', title: 'Many small log segments', problem: 'Split the log so compaction never touches the file being written.' },
  { id: 's08', number: 8, slug: 'memtable', title: 'The memtable', problem: 'Every read still goes to disk; keep the freshest data in RAM.' },
  { id: 's09', number: 9, slug: 'deferred-offset-map', title: 'Deferring the offset map', problem: 'A put writes three places; one of them is redundant.' },
  { id: 's10', number: 10, slug: 'sstable-flush', title: 'Flushing to SSTables', problem: 'Closed segments keep duplicates; write a sorted, deduplicated copy instead.' },
  { id: 's11', number: 11, slug: 'merge-compaction', title: 'Merge compaction', problem: 'The same key lives in several tables; merge them like merge sort.' },
  { id: 's12', number: 12, slug: 'binary-search-tables', title: 'Dropping the offsets', problem: 'One RAM entry per key won’t scale; search sorted tables instead.' },
  { id: 's13', number: 13, slug: 'sparse-index', title: 'The sparse index', problem: 'Binary search jumps across many blocks; read exactly one.' },
  { id: 's14', number: 14, slug: 'tombstones', title: 'Deletes and tombstones', problem: 'Immutable files can’t forget a key; write a marker that hides it.' },
  { id: 's15', number: 15, slug: 'bloom-filters', title: 'Bloom filters', problem: 'Absent keys still cost a block read per table; rule them out from RAM.' },
  { id: 's16', number: 16, slug: 'complete-lsm', title: 'The complete LSM tree', problem: 'Every piece together: the full write, read, flush, compaction and recovery paths.' },
];
