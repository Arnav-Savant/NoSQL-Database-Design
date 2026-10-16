/** Decides which memtable key to drop when room is needed. */
export class EvictionPolicy {
  get name() {
    throw new Error('EvictionPolicy.name must be implemented');
  }

  recordInsert(_key) {
    throw new Error('EvictionPolicy.recordInsert must be implemented');
  }

  recordAccess(_key) {
    throw new Error('EvictionPolicy.recordAccess must be implemented');
  }

  recordRemoval(_key) {
    throw new Error('EvictionPolicy.recordRemoval must be implemented');
  }

  /** Returns the key to evict among those `isEvictable` accepts, or null if none qualifies. */
  selectVictim(_isEvictable) {
    throw new Error('EvictionPolicy.selectVictim must be implemented');
  }
}
