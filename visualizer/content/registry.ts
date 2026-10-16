import { S00 } from './stages/s00';
import { S01 } from './stages/s01';
import { S02 } from './stages/s02';
import { S03 } from './stages/s03';
import { S04 } from './stages/s04';
import { S05 } from './stages/s05';
import { S06 } from './stages/s06';
import { S07 } from './stages/s07';
import { S08 } from './stages/s08';
import { S09 } from './stages/s09';
import { S10 } from './stages/s10';
import { S11 } from './stages/s11';
import { S12 } from './stages/s12';
import { S13 } from './stages/s13';
import { S14 } from './stages/s14';
import { S15 } from './stages/s15';
import { S16 } from './stages/s16';
import { STAGE_INDEX } from './stageIndex';
import type { StageContent, StageMeta } from './types';

const CONTENT: Readonly<Record<string, StageContent>> = Object.fromEntries([S00, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15, S16].map((stage) => [stage.id, stage]));

export interface ResolvedStage {
  meta: StageMeta;
  content: StageContent | undefined;
}

export function stageBySlug(slug: string | undefined): ResolvedStage | undefined {
  const meta = STAGE_INDEX.find((stage) => stage.slug === slug);
  return meta ? { meta, content: CONTENT[meta.id] } : undefined;
}

export function neighbours(id: string): { previous: StageMeta | undefined; next: StageMeta | undefined } {
  const index = STAGE_INDEX.findIndex((stage) => stage.id === id);
  return { previous: STAGE_INDEX[index - 1], next: STAGE_INDEX[index + 1] };
}
