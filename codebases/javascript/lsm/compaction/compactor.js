import { TableRange } from '../sstable/tableRange.js';

/** Merges tables chosen by the strategy until no merge is due. */
export class Compactor {
  #strategy;
  #merger;
  #writer;
  #readerFactory;
  #directory;
  #logger;

  constructor(strategy, merger, writer, readerFactory, directory, logger) {
    this.#strategy = strategy;
    this.#merger = merger;
    this.#writer = writer;
    this.#readerFactory = readerFactory;
    this.#directory = directory;
    this.#logger = logger;
  }

  /** Returns the new set of live tables, oldest first. */
  compactUntilStable(tables) {
    let live = sortOldestFirst(tables);
    for (let inputs = this.#strategy.selectInputs(live); inputs !== null; inputs = this.#strategy.selectInputs(live)) {
      const [older, newer] = inputs;
      const output = this.#merge(older, newer, live);
      live = sortOldestFirst([...live.filter((table) => table !== older && table !== newer), ...(output ? [output] : [])]);
    }
    return live;
  }

  #merge(older, newer, live) {
    // NOTE: a tombstone may only be dropped when no table older than this merge could still hold
    // the key; otherwise the deleted value would reappear from that older table.
    const dropTombstones = live.every((table) => table.range.min >= older.range.min);
    this.#logger.info('Compaction', 'merging', { older: older.name, newer: newer.name, dropTombstones });

    // NOTE: both tables are loaded whole because they are small here. Real compactors stream
    // through the inputs one entry at a time, so memory use doesn't grow with table size.
    const result = this.#merger.merge(older.readAllEntries(), newer.readAllEntries(), dropTombstones);
    const range = new TableRange(older.range.min, newer.range.max);
    const outputName = result.entries.length > 0 ? this.#writer.write(range, result.entries) : null;

    // The output is fully on disk before the inputs disappear. A crash in between leaves inputs
    // whose ranges sit inside the output's range, which recovery recognises and removes.
    this.#directory.remove(older.name);
    this.#directory.remove(newer.name);
    this.#logger.info('Compaction', 'merged', {
      output: outputName ?? 'none',
      kept: result.entries.length,
      duplicatesDropped: result.duplicatesDropped,
      tombstonesDropped: result.tombstonesDropped,
    });
    return outputName ? this.#readerFactory.open(outputName) : null;
  }
}

function sortOldestFirst(tables) {
  return [...tables].sort((left, right) => left.range.max - right.range.max);
}
