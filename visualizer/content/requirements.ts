import type { RequirementId } from './types';

export const REQUIREMENTS: readonly { id: RequirementId; name: string; description: string }[] = [
  { id: 'reads', name: 'Fast reads', description: 'Looking up a key should be as fast as we can make it.' },
  { id: 'writes', name: 'Fast writes', description: 'The priority. Reads can lean on caching; every write must eventually reach the disk.' },
  { id: 'durability', name: 'Durability', description: 'Once a write is acknowledged, a crash or power cut must not lose it.' },
  { id: 'unstructured', name: 'Unstructured values', description: 'No schema. A value can be a number today and a string tomorrow.' },
  { id: 'scale', name: 'A few petabytes', description: 'More than one machine can hold, so data must be splittable across machines.' },
];
