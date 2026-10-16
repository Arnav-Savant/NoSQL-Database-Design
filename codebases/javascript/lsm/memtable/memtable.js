import { compareKeys } from '../entry/keyOrder.js';

/** Written since the last flush (only in the WAL), or already saved in an SSTable. */
export const EntryState = Object.freeze({ DIRTY: 'dirty', CLEAN: 'clean' });

/**
 * In-memory table holding the newest value of recently written keys (dirty) and a cache of
 * recently read keys (clean).
 */
export class Memtable {
  #slots = new Map();
  #capacity;
  #evictionPolicy;
  #logger;

  constructor(capacity, evictionPolicy, logger) {
    this.#capacity = capacity;
    this.#evictionPolicy = evictionPolicy;
    this.#logger = logger;
  }

  get capacity() {
    return this.#capacity;
  }

  get size() {
    return this.#slots.size;
  }

  get dirtyCount() {
    let count = 0;
    for (const slot of this.#slots.values()) if (slot.state === EntryState.DIRTY) count++;
    return count;
  }

  get(key) {
    const slot = this.#slots.get(key);
    if (slot) this.#evictionPolicy.recordAccess(key);
    return slot;
  }

  putDirty(entry) {
    const isNewKey = !this.#slots.has(entry.key);
    if (isNewKey && this.#slots.size >= this.#capacity) this.#evictOneCleanEntry();
    // A dirty entry is stored even past capacity; the store then flushes, which frees room.
    this.#slots.set(entry.key, { entry, state: EntryState.DIRTY });
    if (isNewKey) this.#evictionPolicy.recordInsert(entry.key);
    else this.#evictionPolicy.recordAccess(entry.key);
    this.#logger.debug('Memtable', 'stored', { key: entry.key, value: entry.value.display, state: EntryState.DIRTY, slots: this.#occupancy() });
  }

  putClean(entry) {
    // Anything already here is at least as new as what was read from disk.
    if (this.#slots.has(entry.key)) return;
    if (this.#slots.size >= this.#capacity && !this.#evictOneCleanEntry()) {
      this.#logger.debug('Memtable', 'not cached, every slot is dirty', { key: entry.key, slots: this.#occupancy() });
      return;
    }
    this.#slots.set(entry.key, { entry, state: EntryState.CLEAN });
    this.#evictionPolicy.recordInsert(entry.key);
    this.#logger.debug('Memtable', 'stored', { key: entry.key, value: entry.value.display, state: EntryState.CLEAN, slots: this.#occupancy() });
  }

  isSaturatedWithDirty() {
    return this.dirtyCount >= this.#capacity;
  }

  dirtyEntriesSortedByKey() {
    return [...this.#slots.values()]
      .filter((slot) => slot.state === EntryState.DIRTY)
      .map((slot) => slot.entry)
      .sort((left, right) => compareKeys(left.key, right.key));
  }

  // After a flush the entries stay in memory as a cache; only their state changes.
  markAllClean() {
    for (const slot of this.#slots.values()) slot.state = EntryState.CLEAN;
  }

  rows() {
    return [...this.#slots.entries()]
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, slot]) => ({ key, value: slot.entry.value.display, state: slot.state }));
  }

  // NOTE: only clean entries may be evicted. A dirty entry's newest value exists nowhere else
  // except the WAL, so dropping it would make reads return an older value from disk.
  #evictOneCleanEntry() {
    const victim = this.#evictionPolicy.selectVictim((key) => this.#slots.get(key)?.state === EntryState.CLEAN);
    if (victim === null) return false;
    this.#slots.delete(victim);
    this.#evictionPolicy.recordRemoval(victim);
    this.#logger.debug('Eviction', 'evicted clean entry', { key: victim, policy: this.#evictionPolicy.name, dirtyKept: this.dirtyCount });
    return true;
  }

  #occupancy() {
    return `${this.#slots.size}/${this.#capacity}`;
  }
}
