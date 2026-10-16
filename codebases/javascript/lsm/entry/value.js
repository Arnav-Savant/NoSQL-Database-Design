/** Type tag stored in front of every value; the numbers are part of the on-disk format. */
export const ValueType = Object.freeze({
  NULL: 0,
  BOOLEAN: 1,
  NUMBER: 2,
  STRING: 3,
  TOMBSTONE: 4,
});

const TYPE_NAMES = Object.freeze(['null', 'boolean', 'number', 'string', 'tombstone']);

/** A self-describing value: its type travels with it, so no schema is needed. */
export class Value {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    Object.freeze(this);
  }

  static null() {
    return new Value(ValueType.NULL, null);
  }

  static boolean(flag) {
    return new Value(ValueType.BOOLEAN, Boolean(flag));
  }

  static number(number) {
    if (!Number.isFinite(number)) throw new Error(`Only finite numbers can be stored, got ${number}.`);
    return new Value(ValueType.NUMBER, number);
  }

  static string(text) {
    return new Value(ValueType.STRING, String(text));
  }

  static tombstone() {
    return new Value(ValueType.TOMBSTONE, null);
  }

  static from(raw) {
    if (raw === null) return Value.null();
    if (typeof raw === 'boolean') return Value.boolean(raw);
    if (typeof raw === 'number') return Value.number(raw);
    if (typeof raw === 'string') return Value.string(raw);
    throw new Error(`Unsupported value type "${typeof raw}". Use null, boolean, number or string.`);
  }

  get typeName() {
    return TYPE_NAMES[this.type];
  }

  get display() {
    switch (this.type) {
      case ValueType.NULL:
        return 'null';
      case ValueType.BOOLEAN:
        return this.data ? 'true' : 'false';
      case ValueType.NUMBER:
        return formatNumber(this.data);
      case ValueType.STRING:
        return `"${this.data}"`;
      default:
        return '<tombstone>';
    }
  }
}

// NOTE: the four language ports must print numbers identically, so integers drop the decimal
// point and everything else uses the shortest representation that round-trips.
function formatNumber(number) {
  return Number.isInteger(number) ? number.toFixed(0) : String(number);
}
