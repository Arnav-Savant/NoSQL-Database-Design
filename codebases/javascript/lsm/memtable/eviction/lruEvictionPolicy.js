import { EvictionPolicy } from './evictionPolicy.js';

/** Least recently used: the key untouched for the longest time goes first. */
export class LruEvictionPolicy extends EvictionPolicy {
  // A Map iterates in insertion order; re-inserting on access keeps the oldest use at the front.
  #recency = new Map();

  get name() {
    return 'lru';
  }

  recordInsert(key) {
    this.recordAccess(key);
  }

  recordAccess(key) {
    this.#recency.delete(key);
    this.#recency.set(key, true);
  }

  recordRemoval(key) {
    this.#recency.delete(key);
  }

  selectVictim(isEvictable) {
    for (const key of this.#recency.keys()) {
      if (isEvictable(key)) return key;
    }
    return null;
  }
}
