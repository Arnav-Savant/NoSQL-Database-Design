import { isTempFileName, parseTableFileName, parseWalFileName } from '../io/fileNames.js';
import { WalReader } from '../wal/walReader.js';

/** Brings the data directory back to a consistent state after a clean shutdown or a crash. */
export class RecoveryManager {
  #directory;
  #readerFactory;
  #logger;

  constructor(directory, readerFactory, logger) {
    this.#directory = directory;
    this.#readerFactory = readerFactory;
    this.#logger = logger;
  }

  /** Returns the live tables (oldest first) and the replayed, not-yet-flushed WALs (oldest first). */
  recover() {
    this.#removeTemporaryFiles();
    const tables = this.#openTables(this.#removeSupersededTables());
    const highestFlushedSequence = Math.max(0, ...tables.map((table) => table.range.max));
    const wals = this.#replayUnflushedWals(highestFlushedSequence);
    return { tables, wals };
  }

  // A *.tmp file is a flush or merge that never reached its rename; its source data still exists.
  #removeTemporaryFiles() {
    for (const name of this.#directory.list().filter(isTempFileName)) {
      this.#directory.remove(name);
      this.#logger.warn('Recovery', 'removed unfinished temporary file', { file: name });
    }
  }

  // A table whose range lies inside another's is the input of a merge that finished writing its
  // output but crashed before deleting the inputs. The output already holds all of its data.
  #removeSupersededTables() {
    const named = this.#directory.list()
      .map((name) => ({ name, range: parseTableFileName(name) }))
      .filter((table) => table.range !== null);
    const survivors = [];
    for (const table of named) {
      const container = named.find((other) => other.range.strictlyContains(table.range));
      if (container) {
        this.#directory.remove(table.name);
        this.#logger.warn('Recovery', 'removed table superseded by a finished merge', { table: table.name, mergedInto: container.name });
      } else {
        survivors.push(table);
      }
    }
    return survivors;
  }

  #openTables(namedTables) {
    const tables = namedTables
      .sort((left, right) => left.range.max - right.range.max)
      .map((table) => this.#readerFactory.open(table.name));
    for (const table of tables) {
      this.#logger.info('Recovery', 'opened table', { table: table.name, entries: table.entryCount, blocks: table.sparseIndex.blocks.length });
    }
    return tables;
  }

  #replayUnflushedWals(highestFlushedSequence) {
    const wals = this.#directory.list()
      .map((name) => ({ name, sequence: parseWalFileName(name) }))
      .filter((wal) => wal.sequence !== null)
      .sort((left, right) => left.sequence - right.sequence);

    const replayed = [];
    for (const wal of wals) {
      // Already flushed: the crash happened after its SSTable was written but before it was deleted.
      if (wal.sequence <= highestFlushedSequence) {
        this.#directory.remove(wal.name);
        this.#logger.info('Recovery', 'removed WAL already covered by a table', { wal: wal.name });
        continue;
      }
      const { entries, lastGoodOffset, tornBytes } = WalReader.replay(this.#directory, wal.name);
      if (tornBytes > 0) {
        this.#directory.truncate(wal.name, lastGoodOffset);
        this.#logger.warn('Recovery', 'torn WAL tail truncated', { wal: wal.name, keptBytes: lastGoodOffset, droppedBytes: tornBytes });
      }
      this.#logger.info('Recovery', 'replayed WAL', { wal: wal.name, records: entries.length });
      replayed.push({ ...wal, entries });
    }
    return replayed;
  }
}
