import fs from 'node:fs';
import { Value } from '../lsm/entry/value.js';

// An absent key whose bits all happen to be set in a table's Bloom filter at chapter 7.
export const FALSE_POSITIVE_PROBE = 'probe-069';
export const ABSENT_KEY = 'nokia';

/** The ten-chapter walkthrough shared by every language's demo. */
export class Scenario {
  #openStore;
  #narrator;
  #printer;
  #dataDirectory;
  #store = null;

  constructor({ openStore, narrator, printer, dataDirectory }) {
    this.#openStore = openStore;
    this.#narrator = narrator;
    this.#printer = printer;
    this.#dataDirectory = dataDirectory;
  }

  run() {
    this.#openingAnEmptyStore();
    this.#firstWrites();
    this.#valuesWithoutASchema();
    this.#insideTheFirstSSTable();
    this.#readsServedFromMemory();
    this.#fillingTheCache();
    this.#readsThatReachTheDisk();
    this.#deletingAKey();
    this.#compaction();
    this.#crashAndRecovery();
    this.#summary();
  }

  #openingAnEmptyStore() {
    this.#narrator.chapter(1, 'Opening an empty store', [
      'The store keeps everything in one data directory. Opening it first runs recovery, which finds nothing to recover in an empty directory, and then creates the first write-ahead log (WAL): an append-only file that every write reaches before anything else happens.',
      'Writing to the WAL first is what makes the store durable. Once a write is in the WAL and forced to disk, a crash can no longer lose it.',
    ]);
    this.#store = this.#openStore();
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #firstWrites() {
    this.#narrator.chapter(2, 'First writes', [
      'Each put does two things: it appends a record to the WAL and forces it to disk, then stores the key in the memtable, an in-memory table of recent writes. The memtable entry is marked dirty, meaning its newest value so far exists only in the WAL.',
    ]);
    this.#put('iphone11', 4.8);
    this.#put('iphone12', 4.7);
    this.#put('macbook', 4.9);

    this.#narrator.explain([
      'Here is the first WAL record, byte by byte. The checksum lets recovery detect a record that was only partly written when a crash happened; the length says where the next record starts.',
    ]);
    const walBytes = fs.readFileSync(`${this.#dataDirectory}/${this.#store.snapshot().activeWal.name}`);
    this.#printer.printWalRecord(walBytes.subarray(0, 8 + walBytes.readUInt32BE(4)));
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #valuesWithoutASchema() {
    this.#narrator.chapter(3, 'Values without a schema', [
      'Values carry their own type, so a key can switch from a number to a string. The update is appended to the WAL as a second macbook record; the first one is left untouched. The memtable, being a map, keeps only the newest value.',
    ]);
    this.#put('macbook', 'Apple');
    this.#printer.printSnapshot(this.#store.snapshot());

    this.#narrator.explain([
      'The next write pushes the WAL past its size limit, so the store flushes: it sorts the dirty entries by key, writes them to a new SSTable (a sorted, immutable file), marks them clean, starts a new WAL and deletes the old one. Clean entries stay in memory as a cache.',
    ]);
    this.#put('ipad', 4.6);
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #insideTheFirstSSTable() {
    this.#narrator.chapter(4, 'Inside the first SSTable', [
      'The table holds one entry per key, sorted by the bytes of the key, which is why ipad comes before iphone11. The stale macbook = 4.9 never reached it: only the memtable\'s newest value was written.',
      'Entries are packed into blocks of at most 64 bytes. The sparse index stores the first key and offset of each block, so a lookup reads exactly one block. The Bloom filter is a small bit array that can prove a key is absent without reading the disk at all.',
    ]);
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #readsServedFromMemory() {
    this.#narrator.chapter(5, 'Reads served from memory', [
      'A read checks the memtable first. Both keys are there as clean entries, so they are answered from memory with no disk access. Anything in the memtable is the newest value, because every write passes through it.',
    ]);
    this.#get('macbook');
    this.#get('iphone11');
  }

  #fillingTheCache() {
    this.#narrator.chapter(6, 'Filling the cache', [
      'The memtable has room for 6 entries. When a new key arrives and it is full, the eviction policy (least recently used here) removes a clean entry, one already saved in an SSTable. Dirty entries are never evicted: their newest value exists only in the WAL, so dropping them would make reads return stale data.',
      'Watch the eviction lines below, and the second flush when the WAL fills up again.',
    ]);
    this.#put('airpods', 4.5);
    this.#put('watch', 4.4);
    this.#put('pixel8', 4.3);
    this.#put('galaxy', 4.2);
    this.#put('kindle', 4.1);
    this.#put('iphone12', 4.9);
    this.#put('airpods', true);
    this.#put('ipad', 'M4');
    this.#put('macbook', 'M4 Pro');
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #readsThatReachTheDisk() {
    this.#narrator.chapter(7, 'Reads that reach the disk', [
      'watch was evicted from the memtable, so its read goes to disk. Tables are checked newest first, and the first match wins, which guarantees the newest value. For each table the Bloom filter is asked first; only on a "maybe" does the sparse index pick one block to read. A value found on disk is cached as a clean entry.',
    ]);
    this.#get('watch');

    this.#narrator.explain([
      `${ABSENT_KEY} was never written. Every table's Bloom filter rules it out, so the read finishes without touching the disk.`,
    ]);
    this.#get(ABSENT_KEY);

    this.#narrator.explain([
      `${FALSE_POSITIVE_PROBE} was never written either, but in one table all of its Bloom filter bits happen to be set by other keys. That "maybe" is a false positive: it costs one block read before the read moves on.`,
    ]);
    this.#get(FALSE_POSITIVE_PROBE);
  }

  #deletingAKey() {
    this.#narrator.chapter(8, 'Deleting a key', [
      'SSTables are immutable, so a delete can\'t remove watch from the table that holds it. Instead it writes a tombstone: an entry that means "deleted". The read finds the tombstone in the memtable first and reports the key as absent, so the older value on disk is never consulted.',
    ]);
    this.#delete('watch');
    this.#get('watch');
    this.#printer.printSnapshot(this.#store.snapshot());
  }

  #compaction() {
    this.#narrator.chapter(9, 'Compaction', [
      'Every flush adds a table, and the same key can live in several of them. When the table count reaches 3, the compactor merges the two oldest tables like merge sort: two pointers walk both sorted tables, and on equal keys the newer entry wins. The output is named by the range of WAL numbers it covers, so it still sorts as older than the tables it didn\'t absorb.',
      'A tombstone may be dropped only when the merge includes the oldest table, because then no older copy of the key can exist anywhere. The next write triggers a flush and the first merge.',
    ]);
    this.#put('pixel8', 4.4);

    this.#narrator.explain([
      'Five more writes fill the WAL again. This time the merge includes the table holding the watch tombstone together with the oldest data, so both the old watch = 4.4 and its tombstone disappear for good.',
    ]);
    this.#put('kindle', 'Paperwhite');
    this.#put('galaxy', false);
    this.#put('iphone11', 4.7);
    this.#put('airpods', 4.6);
    this.#put('ipad', 4.5);
    this.#printer.printSnapshot(this.#store.snapshot());
    this.#get('watch');
  }

  #crashAndRecovery() {
    this.#narrator.chapter(10, 'Crash and recovery', [
      'Two more writes, then the process "crashes": the store is abandoned without being closed, and 5 bytes of a half-written record are appended to the WAL, as if power failed in the middle of a write.',
    ]);
    this.#put('galaxy', 4.3);
    this.#put('kindle', 4.2);
    const walName = this.#store.snapshot().activeWal.name;
    fs.appendFileSync(`${this.#dataDirectory}/${walName}`, Buffer.from([0x00, 0x00, 0x00, 0x2a, 0x00]));
    this.#store = null;

    this.#narrator.explain([
      'A new store opens the same directory. Recovery removes unfinished temporary files, opens the tables, and replays the WAL. The torn record fails its checksum check, so the WAL is truncated just before it; that write was never acknowledged, so nothing promised is lost. The memtable comes back with only the dirty entries; the cache refills as keys are read.',
    ]);
    this.#store = this.#openStore();
    this.#printer.printSnapshot(this.#store.snapshot());
    this.#get('galaxy');
    this.#get('macbook');
    this.#get('watch');
  }

  #summary() {
    this.#narrator.chapter('—', 'Summary', [
      'Fast writes: every write is one sequential WAL append plus one memory update; sorting, flushing and merging happen later, in bulk.',
      'Fast reads: recent and popular keys come from the memtable; otherwise each table costs a Bloom filter check in memory and at most one block read.',
      'Durability: the WAL is forced to disk before a write returns, tables are published by atomic rename, and recovery repairs torn writes.',
      'Unstructured values: every value carries its own type and length.',
      'Scale: data lives in immutable SSTables that can be copied to and spread across machines, with only a few bits per key and one index entry per block kept in memory.',
    ]);
    this.#store.close();
  }

  #put(key, raw) {
    const value = Value.from(raw);
    this.#narrator.operation(`put ${key} = ${value.display}`);
    this.#store.put(key, value);
  }

  #delete(key) {
    this.#narrator.operation(`delete ${key}`);
    this.#store.delete(key);
  }

  #get(key) {
    this.#narrator.operation(`get ${key}`);
    const value = this.#store.get(key);
    this.#narrator.result(value === undefined ? 'not found' : value.display);
  }
}
