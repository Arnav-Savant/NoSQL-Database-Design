import type { CodeLanguage } from '@/utils/highlighter';
import cppSource from './my_database.cpp?raw';
import javaSource from './MyDatabase.java?raw';
import javascriptSource from './myDatabase.js?raw';
import pythonSource from './my_database.py?raw';

export type EngineLanguage = 'java' | 'python' | 'javascript' | 'cpp';

export const WHOLE_DATABASE: Record<EngineLanguage, { label: string; fileName: string; highlightAs: CodeLanguage; source: string; codebase: string }> = {
  java: { label: 'Java', fileName: 'MyDatabase.java', highlightAs: 'java', source: javaSource, codebase: 'codebases/java/src/lsm/' },
  python: { label: 'Python', fileName: 'my_database.py', highlightAs: 'python', source: pythonSource, codebase: 'codebases/python/lsm/' },
  javascript: { label: 'JavaScript', fileName: 'myDatabase.js', highlightAs: 'javascript', source: javascriptSource, codebase: 'codebases/javascript/lsm/' },
  cpp: { label: 'C++', fileName: 'my_database.cpp', highlightAs: 'cpp', source: cppSource, codebase: 'codebases/cpp/lsm/' },
};

export const ENGINE_LANGUAGES: readonly EngineLanguage[] = ['java', 'python', 'javascript', 'cpp'];

/** The building blocks the one-file class uses, where they are introduced, and their real home. */
export const BUILDING_BLOCKS: readonly { name: string; job: string; stageSlug: string; folder: string }[] = [
  { name: 'WriteAheadLog', job: 'Append-only, fsynced log that makes every write durable first.', stageSlug: 'hash-index', folder: 'wal' },
  { name: 'Memtable', job: 'Newest values in RAM: dirty until flushed, then clean and cacheable.', stageSlug: 'memtable', folder: 'memtable' },
  { name: 'LruEvictionPolicy', job: 'Chooses which clean entry leaves RAM when the memtable is full.', stageSlug: 'sstable-flush', folder: 'memtable/eviction' },
  { name: 'SSTable', job: 'Immutable, sorted file written by a flush or a merge.', stageSlug: 'sstable-flush', folder: 'sstable' },
  { name: 'SparseIndex', job: 'First key and offset of each block, so a lookup reads one block.', stageSlug: 'sparse-index', folder: 'sstable' },
  { name: 'BloomFilter', job: 'Rules out absent keys from RAM, with no disk read.', stageSlug: 'bloom-filters', folder: 'sstable' },
  { name: 'EntryMerger', job: 'Two-pointer merge of two tables; the newer entry wins.', stageSlug: 'merge-compaction', folder: 'compaction' },
  { name: 'Entry.tombstone', job: 'The marker a delete writes, since files are never edited.', stageSlug: 'tombstones', folder: 'entry' },
  { name: 'Storage', job: 'Atomic writes, cleanup of unfinished files during recovery.', stageSlug: 'complete-lsm', folder: 'io and recovery' },
];
