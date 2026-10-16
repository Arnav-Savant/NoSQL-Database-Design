import type { MachineState } from '@/engine/model';
import type { Step } from '@/engine/trace';

export type RequirementId = 'reads' | 'writes' | 'durability' | 'unstructured' | 'scale';
export type Level = 'met' | 'partial' | 'unmet';

export interface StageMeta {
  id: string;
  number: number;
  slug: string;
  title: string;
  /** One line: the problem this stage solves, shown on the overview map. */
  problem: string;
}

export interface Snippet {
  id: string;
  title: string;
  lines: string[];
}

export type Operation = 'read' | 'insert' | 'update' | 'delete' | 'recover' | 'flush' | 'compact' | 'lookup' | 'rollover';

export interface Walkthrough {
  id: string;
  title: string;
  operation: Operation;
  summary: string;
  build: () => readonly Step[];
}

export interface StageComponentInfo {
  name: string;
  location: 'ram' | 'disk' | 'logic';
  purpose: string;
}

export interface Paragraphs {
  title: string;
  body: string[];
}

export interface StageContent extends StageMeta {
  summary: string;
  problemDetail: string[];
  change: string[];
  components: StageComponentInfo[];
  limitations: { title: string; body: string }[];
  whyNext?: string;
  notes: { title: string; body: string }[];
  asides: { title: string; body: string; code?: { language: string; source: string } }[];
  requirements: Record<RequirementId, { level: Level; reason: string }>;
  walkthroughs: Walkthrough[];
  snippets: Snippet[];
  initialState?: () => MachineState;
}
