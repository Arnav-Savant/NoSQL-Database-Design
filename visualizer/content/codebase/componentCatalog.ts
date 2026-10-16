/** One building block of the engine, implemented once in each of the four languages. */
export interface EngineComponent {
  id: string;
  name: string;
  /**
   * Normalised file stems (lowercase, no separators) that implement this component. The first is
   * the main file; the rest are small companion files some languages split out.
   */
  stems: readonly string[];
  /** The stage that introduces the idea, or null for plumbing that no stage is about. */
  stageSlug: string | null;
  purpose: string;
}

export const COMPONENT_CATALOG: readonly EngineComponent[] = [
  {
    id: 'store-config',
    name: 'Store configuration',
    stems: ['storeconfig'],
    stageSlug: null,
    purpose:
      'Holds every tunable limit in one place: WAL size, block size, memtable capacity and when compaction starts. The demo sets them deliberately tiny so flushes, evictions and merges happen within a few writes.',
  },
  {
    id: 'logger',
    name: 'Logging contract',
    stems: ['logger', 'loglevel'],
    stageSlug: null,
    purpose:
      'Describes how every component reports what it is doing, as a level, a component name, a message and key=value details. Components depend on this contract, never on where the lines end up.',
  },
  {
    id: 'console-logger',
    name: 'Console logger',
    stems: ['consolelogger'],
    stageSlug: null,
    purpose:
      'Prints log lines to the terminal in one aligned shape. It hides lines below the chosen level, so the demo can show every internal step or only the big events.',
  },
  {
    id: 'value',
    name: 'Value',
    stems: ['value', 'valuetype'],
    stageSlug: 'naive-key-value',
    purpose:
      'A self-describing value: null, a boolean, a number, a string, or the tombstone a delete leaves behind. Its type tag travels with the bytes, so the store needs no schema.',
  },
  {
    id: 'entry',
    name: 'Entry',
    stems: ['entry'],
    stageSlug: 'tombstones',
    purpose:
      'One key paired with its value at a point in time. A delete is simply an entry whose value is a tombstone, because files on disk are never edited.',
  },
  {
    id: 'entry-codec',
    name: 'Entry codec',
    stems: ['entrycodec'],
    stageSlug: 'complete-lsm',
    purpose:
      'Turns an entry into length-prefixed bytes and back again. The WAL and the SSTables both store entries in this one format.',
  },
  {
    id: 'key-order',
    name: 'Key order',
    stems: ['keyorder'],
    stageSlug: 'sstable-flush',
    purpose:
      'Compares keys by their UTF-8 bytes, the one ordering every sorted table relies on. All four languages use the same rule, so a table written by one can be searched by another.',
  },
  {
    id: 'big-endian',
    name: 'Big-endian helpers',
    stems: ['bigendian'],
    stageSlug: 'complete-lsm',
    purpose:
      'Reads and writes fixed-size numbers most significant byte first, as every file format here expects. The other languages get this from their standard library; C++ spells it out.',
  },
  {
    id: 'crc32',
    name: 'CRC-32 checksum',
    stems: ['crc32'],
    stageSlug: 'complete-lsm',
    purpose:
      'Computes a checksum of each WAL record as it is written. During recovery a mismatch reveals a record that a crash cut short.',
  },
  {
    id: 'file-names',
    name: 'File names',
    stems: ['filenames'],
    stageSlug: 'merge-compaction',
    purpose:
      'Builds and parses the names of the files on disk, such as wal-000003.log and sst-000001-000003.sst. The numbers in a name say which writes the file holds, which is how recovery orders them.',
  },
  {
    id: 'storage-directory',
    name: 'Storage directory',
    stems: ['storagedirectory'],
    stageSlug: 'complete-lsm',
    purpose:
      'All file-system access goes through here: reading, appending, fsync, truncating and deleting. New tables are written to a temporary file and renamed into place, so a crash never leaves half a table behind.',
  },
  {
    id: 'wal-writer',
    name: 'WAL writer',
    stems: ['walwriter'],
    stageSlug: 'hash-index',
    purpose:
      'Appends each write to the write-ahead log as a checksummed record and fsyncs it before the write counts as done. This is what makes a write survive a crash.',
  },
  {
    id: 'wal-writer-factory',
    name: 'WAL writer factory',
    stems: ['walwriterfactory'],
    stageSlug: 'hash-index',
    purpose:
      'Opens the write-ahead log for a given sequence number, creating the file if it is not there yet. The store asks it for a fresh log every time it flushes.',
  },
  {
    id: 'wal-reader',
    name: 'WAL reader',
    stems: ['walreader', 'walreplay'],
    stageSlug: 'complete-lsm',
    purpose:
      'Replays a write-ahead log record by record after a restart. It stops at the first record that is incomplete or fails its checksum, so a torn tail can be cut off.',
  },
  {
    id: 'memtable',
    name: 'Memtable',
    stems: ['memtable', 'entrystate', 'memtableslot'],
    stageSlug: 'memtable',
    purpose:
      'Keeps the newest values in RAM: dirty entries that so far exist only in the WAL, and clean ones already saved in an SSTable. Only clean entries may be evicted, because they can be read back from disk.',
  },
  {
    id: 'eviction-policy',
    name: 'Eviction policy contract',
    stems: ['evictionpolicy'],
    stageSlug: 'sstable-flush',
    purpose:
      'Describes how to choose which memtable key leaves RAM when room is needed. The memtable asks the policy and never hard-codes a rule.',
  },
  {
    id: 'lru-eviction',
    name: 'Least recently used eviction',
    stems: ['lruevictionpolicy'],
    stageSlug: 'sstable-flush',
    purpose:
      'Evicts the key that has gone untouched for the longest time. It suits workloads where recently used keys are likely to be used again.',
  },
  {
    id: 'lfu-eviction',
    name: 'Least frequently used eviction',
    stems: ['lfuevictionpolicy'],
    stageSlug: 'sstable-flush',
    purpose:
      'Evicts the key used the fewest times, breaking ties by the oldest insert. It keeps popular keys in RAM even when they have not been read lately.',
  },
  {
    id: 'fifo-eviction',
    name: 'First in, first out eviction',
    stems: ['fifoevictionpolicy'],
    stageSlug: 'sstable-flush',
    purpose:
      'Evicts the key that was inserted earliest, however often it is used. It is the simplest policy and a baseline for the other two.',
  },
  {
    id: 'table-range',
    name: 'Table range',
    stems: ['tablerange'],
    stageSlug: 'merge-compaction',
    purpose:
      'Records which WAL sequence numbers a table holds: a flushed table covers one log, a merged table covers its inputs. Ordering tables by this range orders them by the age of their data.',
  },
  {
    id: 'bloom-hasher',
    name: 'Bloom hasher',
    stems: ['bloomhasher'],
    stageSlug: 'bloom-filters',
    purpose:
      'Turns a key into the bit positions a Bloom filter sets or checks. Every table shares the same hasher, so a key always lands on the same bits.',
  },
  {
    id: 'bloom-filter',
    name: 'Bloom filter',
    stems: ['bloomfilter'],
    stageSlug: 'bloom-filters',
    purpose:
      'A compact bit array that answers "definitely absent" or "maybe present" for a key. A table whose filter says absent is skipped without reading the disk.',
  },
  {
    id: 'sparse-index',
    name: 'Sparse index',
    stems: ['sparseindex', 'blockhandle'],
    stageSlug: 'sparse-index',
    purpose:
      'Stores the first key, offset and length of every data block in a table. A lookup finds the one block that could hold the key and reads only that.',
  },
  {
    id: 'table-format',
    name: 'Table format',
    stems: ['tableformat'],
    stageSlug: 'sstable-flush',
    purpose:
      'Defines the layout of an SSTable file: data blocks, then the sparse index, then the Bloom filter, then a fixed-size footer. The footer says where each section starts, so a reader can find them all.',
  },
  {
    id: 'sstable-writer',
    name: 'SSTable writer',
    stems: ['sstablewriter'],
    stageSlug: 'sstable-flush',
    purpose:
      'Writes sorted entries into an immutable SSTable, packing them into blocks and building the index and filter along the way. Flushes and merges both produce their tables through it.',
  },
  {
    id: 'sstable-reader',
    name: 'SSTable reader',
    stems: ['sstablereader'],
    stageSlug: 'sstable-flush',
    purpose:
      'Opens one SSTable and keeps its sparse index and Bloom filter in RAM. A lookup checks the filter, picks a block from the index, reads that block and binary-searches inside it.',
  },
  {
    id: 'sstable-reader-factory',
    name: 'SSTable reader factory',
    stems: ['sstablereaderfactory'],
    stageSlug: 'sstable-flush',
    purpose:
      'Opens SSTables by file name, handing each reader the shared hasher and logger. The store and the compactor use it, so neither has to know how a reader is built.',
  },
  {
    id: 'compaction-strategy',
    name: 'Compaction strategy contract',
    stems: ['compactionstrategy'],
    stageSlug: 'merge-compaction',
    purpose:
      'Describes how to choose which tables to merge next, or that no merge is due. Swapping the strategy changes when and what compacts without touching the merge itself.',
  },
  {
    id: 'oldest-pair-strategy',
    name: 'Oldest pair strategy',
    stems: ['oldestpairstrategy'],
    stageSlug: 'merge-compaction',
    purpose:
      'Once the number of tables reaches the trigger, it picks the two oldest to merge. Merging neighbours in time keeps every table covering one unbroken range of writes.',
  },
  {
    id: 'entry-merger',
    name: 'Entry merger',
    stems: ['entrymerger', 'mergeresult'],
    stageSlug: 'merge-compaction',
    purpose:
      'Merges two sorted lists of entries with two pointers, the way merge sort does. When both hold the same key the newer entry wins, and tombstones are dropped only when nothing older could still hold the key.',
  },
  {
    id: 'compactor',
    name: 'Compactor',
    stems: ['compactor'],
    stageSlug: 'merge-compaction',
    purpose:
      'Repeatedly asks the strategy what to merge, merges it, writes the result as a new table and deletes the inputs. It stops when the strategy says no merge is due.',
  },
  {
    id: 'recovery-manager',
    name: 'Recovery manager',
    stems: ['recoverymanager', 'recoveredstate'],
    stageSlug: 'complete-lsm',
    purpose:
      'Brings the data directory back to a consistent state on startup: it deletes temporary files, tables already covered by a merge and logs already flushed. Then it replays the remaining logs into the memtable, cutting off any torn tail.',
  },
  {
    id: 'contracts',
    name: 'Store contracts',
    stems: ['contracts', 'keyvaluereader', 'keyvaluewriter', 'lifecycle', 'storeinspector', 'storesnapshot'],
    stageSlug: null,
    purpose:
      'The interfaces the store offers: reading keys, writing and deleting them, opening and closing, and taking a snapshot for inspection. Code that uses the store depends on these, not on the store class.',
  },
  {
    id: 'lsm-store',
    name: 'LSM store',
    stems: ['lsmstore'],
    stageSlug: 'complete-lsm',
    purpose:
      'The store itself: the write path, the read path and flushing, built from every other component. A write goes to the WAL then the memtable; a read checks the memtable, then each table from newest to oldest.',
  },
  {
    id: 'store-factory',
    name: 'Store factory',
    stems: ['storefactory'],
    stageSlug: null,
    purpose:
      'The one place where concrete classes are chosen and wired together into a store. Everything else receives its dependencies from here.',
  },
  {
    id: 'demo-main',
    name: 'Demo entry point',
    stems: ['main'],
    stageSlug: null,
    purpose:
      'Starts the narrated demo: it wipes the data folder and runs the walkthrough. Run it to watch the store flush, evict, merge and recover in a few dozen writes.',
  },
  {
    id: 'demo-scenario',
    name: 'Demo scenario',
    stems: ['scenario'],
    stageSlug: null,
    purpose:
      'The ten-chapter walkthrough shared by every language, from the first write to a crash and recovery. Each chapter performs a few operations and explains what to look for.',
  },
  {
    id: 'demo-narrator',
    name: 'Demo narrator',
    stems: ['narrator'],
    stageSlug: null,
    purpose:
      'Prints chapter headings, explanations and operations in a consistent shape. It keeps the demo output readable next to the store’s own log lines.',
  },
  {
    id: 'demo-state-printer',
    name: 'Demo state printer',
    stems: ['stateprinter'],
    stageSlug: null,
    purpose:
      'Renders snapshots of the store as aligned text: the active WAL, every memtable entry and every SSTable. It shows what is in RAM and what is on disk after each key step.',
  },
];
