import type { StageContent } from '../types';
import { STAGE_INDEX } from '../stageIndex';

export const S00: StageContent = {
  ...STAGE_INDEX[0]!,
  summary:
    'Five requirements judge every design that follows. Each later stage exists because the previous design failed at least one of them.',
  problemDetail: [
    'We are designing a key-value database from scratch. Before choosing any file format or data structure, fix what "good" means, so every decision can be measured against it.',
  ],
  change: [
    'Writes come first. If the same keys are read often, a copy in memory (a cache) answers most reads without touching the disk. Writes have no such shortcut: every write must eventually reach durable storage, so making them cheap is the harder problem.',
    'A few petabytes is more than any single disk or server holds. Data must live in pieces that can sit on different machines, and anything kept in RAM for every key becomes a problem once there are billions of keys.',
  ],
  components: [
    { name: 'RAM', location: 'ram', purpose: 'Around 100 nanoseconds per access, but small and lost when power goes.' },
    { name: 'Disk', location: 'disk', purpose: 'Large and durable, but a random seek on a spinning disk takes around 10 milliseconds. Reading neighbouring bytes is far cheaper than jumping around.' },
  ],
  limitations: [],
  whyNext:
    'Start with the storage engine most engineers already know: a relational table. Seeing why it is fast shows exactly what we lose once values stop having a fixed type.',
  notes: [],
  asides: [
    {
      title: 'How to read the scorecard',
      body: 'Every stage rates itself against the five requirements: met, partial (works, but with a cost that hurts at scale) or unmet.',
    },
  ],
  requirements: {
    reads: { level: 'unmet', reason: 'Nothing exists yet.' },
    writes: { level: 'unmet', reason: 'Nothing exists yet.' },
    durability: { level: 'unmet', reason: 'Nothing exists yet.' },
    unstructured: { level: 'unmet', reason: 'Nothing exists yet.' },
    scale: { level: 'unmet', reason: 'Nothing exists yet.' },
  },
  walkthroughs: [],
  snippets: [],
};
