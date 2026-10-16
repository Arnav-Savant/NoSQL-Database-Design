import type { StageMeta } from './types';

/** URL of a stage page. Kept apart from the registry so linking to a stage doesn't load its content. */
export function stagePath(stage: StageMeta): string {
  return `/stages/${stage.slug}`;
}
