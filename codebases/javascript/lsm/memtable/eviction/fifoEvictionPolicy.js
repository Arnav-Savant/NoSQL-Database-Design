import { EvictionPolicy } from './evictionPolicy.js';

/** First in, first out: the key inserted earliest goes first, regardless of use. */
export class FifoEvictionPolicy extends EvictionPolicy {
  #arrivals = new Map();

  get name() {
    return 'fifo';
  }

  recordInsert(key) {
    if (!this.#arrivals.has(key)) this.#arrivals.set(key, true);
  }

  recordAccess(key) {
    this.recordInsert(key);
  }

  recordRemoval(key) {
    this.#arrivals.delete(key);
  }

  selectVictim(isEvictable) {
    for (const key of this.#arrivals.keys()) {
      if (isEvictable(key)) return key;
    }
    return null;
  }
}
