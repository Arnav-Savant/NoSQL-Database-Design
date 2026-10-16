/** Point lookups by key. */
export class KeyValueReader {
  /** Returns the current Value, or undefined when the key is absent or deleted. */
  get(_key) {
    throw new Error('KeyValueReader.get must be implemented');
  }
}

/** Inserts, updates and deletes. */
export class KeyValueWriter {
  put(_key, _value) {
    throw new Error('KeyValueWriter.put must be implemented');
  }

  delete(_key) {
    throw new Error('KeyValueWriter.delete must be implemented');
  }
}

/** Opening (with recovery) and closing. */
export class Lifecycle {
  open() {
    throw new Error('Lifecycle.open must be implemented');
  }

  close() {
    throw new Error('Lifecycle.close must be implemented');
  }
}

/** Read-only view of internal state, for teaching and debugging. */
export class StoreInspector {
  snapshot() {
    throw new Error('StoreInspector.snapshot must be implemented');
  }
}

// JavaScript has single inheritance, so a class satisfies the remaining contracts structurally.
export function assertImplements(instance, contracts) {
  for (const contract of contracts) {
    for (const method of Object.getOwnPropertyNames(contract.prototype)) {
      if (method !== 'constructor' && typeof instance[method] !== 'function') {
        throw new Error(`${instance.constructor.name} does not implement ${contract.name}.${method}`);
      }
    }
  }
}
