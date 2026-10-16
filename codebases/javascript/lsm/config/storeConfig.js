/** Tunable limits of the store. */
export const DEFAULT_CONFIG = Object.freeze({
  walMaxBytes: 4 * 1024 * 1024,
  blockSizeBytes: 4096,
  memtableCapacity: 100_000,
  compactionTrigger: 4,
  bloomBitsPerKey: 10,
  evictionPolicy: 'lru',
  logLevel: 'info',
});

// Deliberately tiny so the demo triggers flushes, evictions and compactions within a few writes.
export const DEMO_CONFIG = Object.freeze({
  walMaxBytes: 128,
  blockSizeBytes: 64,
  memtableCapacity: 6,
  compactionTrigger: 3,
  bloomBitsPerKey: 6,
  evictionPolicy: 'lru',
  logLevel: 'debug',
});

export function createConfig(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  for (const field of ['walMaxBytes', 'blockSizeBytes', 'memtableCapacity', 'compactionTrigger', 'bloomBitsPerKey']) {
    if (!Number.isInteger(config[field]) || config[field] < 1) {
      throw new Error(`Config field "${field}" must be a positive integer, got ${config[field]}.`);
    }
  }
  if (config.compactionTrigger < 2) {
    throw new Error('Config field "compactionTrigger" must be at least 2, because a merge needs two tables.');
  }
  return Object.freeze(config);
}
