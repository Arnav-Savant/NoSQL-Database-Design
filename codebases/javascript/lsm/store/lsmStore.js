import { Entry } from '../entry/entry.js';
import { TableRange } from '../sstable/tableRange.js';
import { Lifecycle } from './contracts.js';

/**
 * A log-structured merge tree key-value store.
 *
 * @implements {KeyValueReader} @implements {KeyValueWriter} @implements {StoreInspector}
 */
export class LsmStore extends Lifecycle {
  #config;
  #directory;
  #logger;
  #memtable;
  #walFactory;
  #tableWriter;
  #tableReaderFactory;
  #compactor;
  #recoveryManager;

  #wal = null;
  #tables = [];
  #unflushedWalNames = [];
  #oldestUnflushedSequence = 0;

  constructor({ config, directory, logger, memtable, walFactory, tableWriter, tableReaderFactory, compactor, recoveryManager }) {
    super();
    this.#config = config;
    this.#directory = directory;
    this.#logger = logger;
    this.#memtable = memtable;
    this.#walFactory = walFactory;
    this.#tableWriter = tableWriter;
    this.#tableReaderFactory = tableReaderFactory;
    this.#compactor = compactor;
    this.#recoveryManager = recoveryManager;
  }

  open() {
    this.#directory.ensureExists();
    const { tables, wals } = this.#recoveryManager.recover();
    this.#tables = tables;

    for (const wal of wals) for (const entry of wal.entries) this.#memtable.putDirty(entry);

    const highestTableSequence = Math.max(0, ...tables.map((table) => table.range.max));
    const activeSequence = wals.length > 0 ? wals[wals.length - 1].sequence : highestTableSequence + 1;
    this.#wal = this.#walFactory.open(activeSequence);
    this.#unflushedWalNames = wals.length > 0 ? wals.map((wal) => wal.name) : [this.#wal.name];
    this.#oldestUnflushedSequence = wals.length > 0 ? wals[0].sequence : activeSequence;

    this.#logger.info('Store', 'opened', {
      tables: tables.length,
      activeWal: this.#wal.name,
      recoveredEntries: this.#memtable.size,
    });
    // Several unflushed WALs mean a crash interrupted a flush; fold them into one table now.
    if (wals.length > 1 || this.#flushIsDue()) this.#flush('recovery');
  }

  close() {
    this.#wal?.close();
    this.#wal = null;
    this.#logger.info('Store', 'closed');
  }

  put(key, value) {
    this.#write(Entry.of(key, value));
  }

  delete(key) {
    this.#write(Entry.tombstone(key));
  }

  get(key) {
    const cached = this.#memtable.get(key);
    if (cached) {
      this.#logger.debug('Read', 'memtable hit', { key, state: cached.state, value: cached.entry.value.display });
      return cached.entry.isTombstone() ? undefined : cached.entry.value;
    }
    this.#logger.debug('Read', 'memtable miss, checking tables newest first', { key, tables: this.#tables.length });

    for (const table of this.#tablesNewestFirst()) {
      if (!table.mightContain(key)) {
        this.#logger.debug('Read', 'bloom filter says definitely absent, table skipped', { key, table: table.name });
        continue;
      }
      const entry = table.find(key);
      if (entry === null) {
        this.#logger.debug('Read', 'bloom filter false positive, key not in block', { key, table: table.name });
        continue;
      }
      this.#logger.debug('Read', 'found on disk', { key, table: table.name, value: entry.value.display });
      this.#memtable.putClean(entry);
      return entry.isTombstone() ? undefined : entry.value;
    }
    this.#logger.debug('Read', 'not found in any table', { key });
    return undefined;
  }

  snapshot() {
    return {
      activeWal: { name: this.#wal.name, sizeBytes: this.#wal.sizeBytes, records: this.#wal.recordCount },
      memtable: { capacity: this.#memtable.capacity, rows: this.#memtable.rows() },
      tables: this.#tablesNewestFirst().map((table) => table.describe()),
    };
  }

  #write(entry) {
    // Durable first: once the WAL append returns, a crash can no longer lose this write.
    this.#wal.append(entry);
    this.#memtable.putDirty(entry);
    if (this.#flushIsDue()) this.#flush(this.#memtable.isSaturatedWithDirty() ? 'memtable full of dirty entries' : 'WAL reached its size limit');
  }

  #flushIsDue() {
    return this.#wal.sizeBytes >= this.#config.walMaxBytes || this.#memtable.isSaturatedWithDirty();
  }

  #flush(reason) {
    const entries = this.#memtable.dirtyEntriesSortedByKey();
    if (entries.length === 0) return;
    this.#logger.info('Flush', 'started', { reason, dirtyEntries: entries.length });

    const range = new TableRange(this.#oldestUnflushedSequence, this.#wal.sequence);
    const tableName = this.#tableWriter.write(range, entries);
    this.#tables.push(this.#tableReaderFactory.open(tableName));
    this.#memtable.markAllClean();

    // Only now that the table is durable can the WALs it replaces be deleted.
    const nextSequence = this.#wal.sequence + 1;
    this.#wal.close();
    for (const walName of this.#unflushedWalNames) {
      this.#directory.remove(walName);
      this.#logger.info('Wal', 'deleted, its entries are in the new table', { wal: walName });
    }
    this.#wal = this.#walFactory.open(nextSequence);
    this.#unflushedWalNames = [this.#wal.name];
    this.#oldestUnflushedSequence = nextSequence;
    this.#logger.info('Flush', 'finished', { table: tableName, cleanEntries: this.#memtable.size });

    this.#tables = this.#compactor.compactUntilStable(this.#tables);
  }

  #tablesNewestFirst() {
    return [...this.#tables].sort((left, right) => right.range.max - left.range.max);
  }
}
