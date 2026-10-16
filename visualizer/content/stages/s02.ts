import { corruptingUpdate, insertAirpods, readMacbook } from '@/engine/architectures/s02NaiveKeyValue';
import { S02_SNIPPETS } from '../snippets/s02';
import { STAGE_INDEX } from '../stageIndex';
import type { StageContent } from '../types';

export const S02: StageContent = {
  ...STAGE_INDEX[2]!,
  summary:
    'Keep the relational idea of laying bytes side by side, but store key-value pairs whose keys can be any length. Each record is the key’s bytes, a one-byte separator, then the value.',
  problemDetail: [
    'A relational layout needs a fixed schema. We want something closer to a hash map or a JSON object, where a key maps to a value of any type and any size.',
  ],
  change: [
    'Records are stored as raw bytes in one file: the key, a separator byte ":" that marks where the key ends, then the value. To keep the byte strip short, every value is a rating stored as a 4-byte float.',
    'Keys are lower-case strings of any length, one byte per character. macbook is 7 bytes and iphone11 is 8, so records have different lengths: 13, 13, 12 and 9 bytes, starting at offsets 0, 13, 26 and 38.',
  ],
  components: [
    { name: 'Data file', location: 'disk', purpose: 'Key-value records stored back to back as raw bytes.' },
    { name: 'Separator byte', location: 'disk', purpose: 'Marks where a key ends and its value begins.' },
  ],
  limitations: [
    { title: 'Every read is a linear scan', body: 'The start of the next record depends on the length of the key before it, so a read must examine every byte up to the match: O(size of the file).' },
    { title: 'Growing a value corrupts its neighbour', body: 'A value that needs more bytes than its slot writes over the start of the next record.' },
    { title: 'No type or size changes in place', body: 'An update that turns a number into a longer string can’t be done safely where the old value sits.' },
  ],
  whyNext:
    'There are two failures here: slow linear reads, and updates that destroy their neighbours. The next stage tackles the corruption first, by never writing past a value’s slot.',
  notes: [
    {
      title: 'Four-byte floats are a simplification',
      body: 'Values are 4-byte floats here only to keep the byte strip short. The engines store numbers as 8-byte doubles and record every value’s type and length explicitly.',
    },
  ],
  asides: [],
  requirements: {
    reads: { level: 'unmet', reason: 'Every read scans the file byte by byte; there is no way to jump to a record.' },
    writes: { level: 'partial', reason: 'New keys are cheap appends, but updates that grow a value corrupt the file.' },
    durability: { level: 'met', reason: 'Every record lives in a file on disk.' },
    unstructured: { level: 'partial', reason: 'Keys can be any length, but values are stuck in a fixed 4-byte slot.' },
    scale: { level: 'unmet', reason: 'One file on one machine.' },
  },
  walkthroughs: [
    { id: 'read', title: 'Read macbook', operation: 'read', summary: 'Scan byte by byte, comparing each key, until the match at offset 26.', build: readMacbook },
    { id: 'insert', title: 'Insert airpods', operation: 'insert', summary: 'Append a new record at offset 47.', build: insertAirpods },
    { id: 'update', title: 'Update macbook to "Apple"', operation: 'update', summary: 'A 5-byte value in a 4-byte slot overwrites the first byte of ipad.', build: corruptingUpdate },
  ],
  snippets: S02_SNIPPETS,
};
