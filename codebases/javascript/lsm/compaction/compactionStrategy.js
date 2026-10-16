/** Chooses which tables to merge next. */
export class CompactionStrategy {
  /** Receives tables ordered oldest first; returns [older, newer] or null when no merge is due. */
  selectInputs(_tablesOldestFirst) {
    throw new Error('CompactionStrategy.selectInputs must be implemented');
  }
}
