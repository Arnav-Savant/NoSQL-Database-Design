import type { EntryState, RamComponent, RecordView, Value } from '../model';
import { compareKeys } from './keyOrder';

interface Slot {
  recordId: string;
  value: Value;
  state: EntryState;
}

export interface PutResult {
  evicted: string | null;
  isNewKey: boolean;
}

/**
 * The memtable with an LRU eviction policy, following the engines' rules: writes store dirty
 * entries, reads cache clean ones, and only clean entries are ever evicted.
 */
export class MemtableModel {
  readonly #slots = new Map<string, Slot>();
  readonly #recency = new Map<string, true>();
  #nextVersion = 0;

  constructor(
    readonly capacity: number,
    readonly id = 'memtable',
    readonly label = 'Memtable',
  ) {}

  get size(): number {
    return this.#slots.size;
  }

  get dirtyCount(): number {
    return [...this.#slots.values()].filter((slot) => slot.state === 'dirty').length;
  }

  has(key: string): boolean {
    return this.#slots.has(key);
  }

  peek(key: string): (Slot & { key: string }) | undefined {
    const slot = this.#slots.get(key);
    return slot ? { ...slot, key } : undefined;
  }

  get(key: string): (Slot & { key: string }) | undefined {
    const slot = this.#slots.get(key);
    if (slot) this.#touch(key);
    return slot ? { ...slot, key } : undefined;
  }

  putDirty(key: string, item: Value): PutResult {
    const isNewKey = !this.#slots.has(key);
    const evicted = isNewKey && this.#slots.size >= this.capacity ? this.#evictOneClean() : null;
    this.#slots.set(key, { recordId: `mem:${key}:${this.#nextVersion++}`, value: item, state: 'dirty' });
    this.#touch(key);
    return { evicted, isNewKey };
  }

  putClean(key: string, item: Value): PutResult & { cached: boolean } {
    if (this.#slots.has(key)) return { evicted: null, isNewKey: false, cached: false };
    let evicted: string | null = null;
    if (this.#slots.size >= this.capacity) {
      evicted = this.#evictOneClean();
      if (evicted === null) return { evicted: null, isNewKey: true, cached: false };
    }
    this.#slots.set(key, { recordId: `mem:${key}:${this.#nextVersion++}`, value: item, state: 'clean' });
    this.#touch(key);
    return { evicted, isNewKey: true, cached: true };
  }

  isSaturatedWithDirty(): boolean {
    return this.dirtyCount >= this.capacity;
  }

  dirtyRecordsSorted(): RecordView[] {
    return this.rows().filter((row) => row.state === 'dirty');
  }

  markAllClean(): void {
    for (const slot of this.#slots.values()) slot.state = 'clean';
  }

  clear(): void {
    this.#slots.clear();
    this.#recency.clear();
  }

  /** Clean keys from least to most recently used: the order LRU would evict them. */
  evictionOrder(): string[] {
    return [...this.#recency.keys()].filter((key) => this.#slots.get(key)?.state === 'clean');
  }

  rows(): RecordView[] {
    return [...this.#slots.entries()]
      .sort(([left], [right]) => compareKeys(left, right))
      .map(([key, slot]) => ({ recordId: slot.recordId, key, value: slot.value, state: slot.state }));
  }

  view(showCapacity = true): RamComponent {
    return { kind: 'memtable', id: this.id, label: this.label, capacity: showCapacity ? this.capacity : undefined, rows: this.rows() };
  }

  #touch(key: string): void {
    this.#recency.delete(key);
    this.#recency.set(key, true);
  }

  #evictOneClean(): string | null {
    for (const key of this.#recency.keys()) {
      if (this.#slots.get(key)?.state === 'clean') {
        this.#slots.delete(key);
        this.#recency.delete(key);
        return key;
      }
    }
    return null;
  }
}
