import { Value, ValueType } from './value.js';

/** One key and its value at a point in time; a delete is an entry whose value is a tombstone. */
export class Entry {
  constructor(key, value) {
    if (typeof key !== 'string' || key.length === 0) throw new Error('Keys must be non-empty strings.');
    this.key = key;
    this.value = value;
    Object.freeze(this);
  }

  static of(key, value) {
    return new Entry(key, value instanceof Value ? value : Value.from(value));
  }

  static tombstone(key) {
    return new Entry(key, Value.tombstone());
  }

  isTombstone() {
    return this.value.type === ValueType.TOMBSTONE;
  }
}
