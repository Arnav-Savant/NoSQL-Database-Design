/**
 * The span of WAL sequence numbers whose writes a table holds.
 *
 * A flushed table covers one WAL (`3-3`); a merged table covers its inputs (`1-3`). Ordering tables
 * by `max` orders them by the age of their data, which a fresh id after a merge would break.
 */
export class TableRange {
  constructor(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      throw new Error(`Invalid table range ${min}-${max}.`);
    }
    this.min = min;
    this.max = max;
    Object.freeze(this);
  }

  strictlyContains(other) {
    const covers = this.min <= other.min && other.max <= this.max;
    return covers && !(this.min === other.min && this.max === other.max);
  }
}
