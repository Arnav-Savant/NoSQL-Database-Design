import { CompactionStrategy } from './compactionStrategy.js';

/** Once the table count reaches the trigger, merge the two oldest tables. */
export class OldestPairStrategy extends CompactionStrategy {
  #trigger;

  constructor(trigger) {
    super();
    this.#trigger = trigger;
  }

  // Always merging the two oldest keeps the inputs adjacent in time, so the output's range never
  // overlaps a table it didn't absorb, and newest-first read order stays correct.
  selectInputs(tablesOldestFirst) {
    if (tablesOldestFirst.length < this.#trigger) return null;
    return [tablesOldestFirst[0], tablesOldestFirst[1]];
  }
}
