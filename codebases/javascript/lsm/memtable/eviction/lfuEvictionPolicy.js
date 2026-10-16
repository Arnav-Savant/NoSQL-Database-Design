import { EvictionPolicy } from './evictionPolicy.js';

/** Least frequently used: the key with the fewest uses goes first; ties go to the oldest insert. */
export class LfuEvictionPolicy extends EvictionPolicy {
  #useCounts = new Map();
  #insertOrder = new Map();
  #nextInsert = 0;

  get name() {
    return 'lfu';
  }

  recordInsert(key) {
    this.#useCounts.set(key, 1);
    this.#insertOrder.set(key, this.#nextInsert++);
  }

  recordAccess(key) {
    if (!this.#useCounts.has(key)) {
      this.recordInsert(key);
      return;
    }
    this.#useCounts.set(key, this.#useCounts.get(key) + 1);
  }

  recordRemoval(key) {
    this.#useCounts.delete(key);
    this.#insertOrder.delete(key);
  }

  selectVictim(isEvictable) {
    let victim = null;
    for (const [key, uses] of this.#useCounts) {
      if (!isEvictable(key)) continue;
      const fewerUses = victim === null || uses < this.#useCounts.get(victim);
      const olderTie = victim !== null && uses === this.#useCounts.get(victim) && this.#insertOrder.get(key) < this.#insertOrder.get(victim);
      if (fewerUses || olderTie) victim = key;
    }
    return victim;
  }
}
