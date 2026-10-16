// MyDatabase: the complete LSM-tree key-value store in one class.
//
// This file shows how the pieces fit together. The building blocks it uses (WriteAheadLog,
// Memtable, SSTable, BloomFilter, SparseIndex, EntryMerger) are assumed to exist; their full,
// runnable implementations live in codebases/javascript/lsm/.

const WAL_MAX_BYTES = 4 * 1024 * 1024;
const MEMTABLE_CAPACITY = 100_000;
const COMPACTION_TRIGGER = 4;

export class MyDatabase {
  #directory;
  #memtable = new Memtable(MEMTABLE_CAPACITY, new LruEvictionPolicy());
  #tables = [];                                  // each has a BloomFilter and a SparseIndex
  #wal;

  constructor(directory) {
    this.#directory = directory;
    this.#recover();
  }

  // ------------------------------------------------------------- writes

  put(key, value) {
    this.#write(Entry.of(key, value));
  }

  delete(key) {
    this.#write(Entry.tombstone(key));           // SSTables are immutable, so a delete is a marker
  }

  #write(entry) {
    this.#wal.appendAndSync(entry);              // durable first: a crash after this loses nothing
    this.#memtable.putDirty(entry);              // newest value, never evicted until flushed
    if (this.#wal.sizeBytes >= WAL_MAX_BYTES || this.#memtable.isFullOfDirtyEntries()) {
      this.#flush();
    }
  }

  // -------------------------------------------------------------- reads

  get(key) {
    const cached = this.#memtable.get(key);      // dirty or clean, it is the newest value
    if (cached) return cached.isTombstone() ? undefined : cached.value;

    for (const table of this.#newestFirst()) {   // first match wins, so the newest value wins
      if (!table.bloomFilter.mightContain(key)) continue;            // definitely absent: no disk read
      const found = table.readBlock(table.sparseIndex.locate(key)).find(key);
      if (!found) continue;                      // a Bloom filter false positive cost one block read
      this.#memtable.putClean(found);            // cache it; clean entries may be evicted
      return found.isTombstone() ? undefined : found.value;
    }
    return undefined;
  }

  // -------------------------------------------------------------- flush

  #flush() {
    const dirty = this.#memtable.dirtyEntriesSortedByKey();
    if (dirty.length === 0) return;
    // Blocks + sparse index + Bloom filter + footer, written to a temp file, fsynced, renamed.
    this.#tables.push(SSTable.writeAtomically(this.#directory, this.#wal.sequence, this.#wal.sequence, dirty));
    this.#memtable.markAllClean();               // entries stay in RAM as a cache
    const flushed = this.#wal;
    this.#wal = WriteAheadLog.create(this.#directory, flushed.sequence + 1);
    flushed.closeAndDelete();                    // its data is now safely in the SSTable
    this.#compact();
  }

  // --------------------------------------------------------- compaction

  #compact() {
    while (this.#tables.length >= COMPACTION_TRIGGER) {
      const [older, newer] = [...this.#tables].sort((a, b) => a.maxSequence - b.maxSequence);
      const dropTombstones = true;               // the oldest table is in this merge: nothing older can resurrect a key
      const merged = EntryMerger.merge(older.readAll(), newer.readAll(), dropTombstones); // newer wins on equal keys
      const output = SSTable.writeAtomically(this.#directory, older.minSequence, newer.maxSequence, merged);
      this.#tables = this.#tables.filter((table) => table !== older && table !== newer);
      older.delete();
      newer.delete();
      this.#tables.push(output);
    }
  }

  // ----------------------------------------------------------- recovery

  #recover() {
    Storage.deleteTemporaryFiles(this.#directory);                    // unfinished flushes or merges
    this.#tables = SSTable.openAll(this.#directory);                  // loads each sparse index and Bloom filter
    Storage.deleteTablesContainedInOthers(this.#directory, this.#tables); // inputs of a finished merge
    const flushedUpTo = Math.max(0, ...this.#tables.map((table) => table.maxSequence));
    WriteAheadLog.deleteCoveredBy(this.#directory, flushedUpTo);      // already flushed before the crash

    const unflushed = WriteAheadLog.openLatest(this.#directory);
    for (const entry of unflushed?.replayUntilChecksumFails() ?? []) this.#memtable.putDirty(entry); // torn tail is truncated
    this.#wal = unflushed ?? WriteAheadLog.create(this.#directory, flushedUpTo + 1);
  }

  #newestFirst() {
    return [...this.#tables].sort((a, b) => b.maxSequence - a.maxSequence);
  }

  close() {
    this.#wal.close();
  }
}

// ------------------------------------------------------------------- main

function main() {
  const db = new MyDatabase('./data');
  db.put('iphone11', 4.8);
  db.put('macbook', 4.9);
  db.put('macbook', 'Apple');                    // values can change type: no schema
  db.put('airpods', true);

  console.log(db.get('macbook'));                // "Apple", served from the memtable
  db.delete('airpods');
  console.log(db.get('airpods'));                // undefined, hidden by a tombstone
  db.close();
}

main();
