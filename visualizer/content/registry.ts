import { S00 } from './stages/s00';
import { S05 } from './stages/s05';
import { STAGE_INDEX } from './stageIndex';
import type { StageContent, StageMeta } from './types';

const CONTENT: Readonly<Record<string, StageContent>> = Object.fromEntries([S00, S05].map((stage) => [stage.id, stage]));

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

export function stagePath(stage: StageMeta): string {
  return `/stages/${stage.slug}`;
}
