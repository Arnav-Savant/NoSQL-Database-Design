import type { RawValue } from '@/engine/values';

/** The products table used in stage 1. */
export const PRODUCTS = [
  { id: 1, name: 'iPhone 11', price: 699, rating: 4.8 },
  { id: 2, name: 'iPhone 12', price: 799, rating: 4.7 },
  { id: 3, name: 'MacBook', price: 1299, rating: 4.9 },
  { id: 4, name: 'iPad', price: 499, rating: 4.6 },
] as const;

export const PRODUCT_COLUMNS = [
  { name: 'id', bytes: 8 },
  { name: 'name', bytes: 60 },
  { name: 'price', bytes: 8 },
  { name: 'rating', bytes: 8 },
] as const;

export const ROW_BYTES = PRODUCT_COLUMNS.reduce((total, column) => total + column.bytes, 0);

export const BASE_WRITES: readonly (readonly [string, RawValue])[] = [
  ['iphone11', 4.8],
  ['iphone12', 4.7],
  ['macbook', 4.9],
  ['ipad', 4.6],
  ['airpods', 4.5],
  ['watch', 4.4],
  ['pixel8', 4.3],
  ['galaxy', 4.2],
  ['kindle', 4.1],
];

export const UPDATES: readonly (readonly [string, RawValue])[] = [
  ['macbook', 'Apple'],
  ['iphone12', 4.9],
  ['airpods', true],
  ['ipad', 'M4'],
  ['macbook', 'M4 Pro'],
];

export const DELETED_KEY = 'watch';
export const ABSENT_KEY = 'nokia';
export const FALSE_POSITIVE_PROBE = 'probe-069';

/** The engines' demo configuration, so block sizes and Bloom bits match the real files. */
export const DEMO_CONFIG = {
  walMaxBytes: 128,
  blockSizeBytes: 64,
  memtableCapacity: 6,
  compactionTrigger: 3,
  bloomBitsPerKey: 6,
} as const;
