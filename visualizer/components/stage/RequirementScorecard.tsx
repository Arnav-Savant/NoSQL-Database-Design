import { REQUIREMENTS } from '@/content/requirements';
import type { Level, StageContent } from '@/content/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const LEVEL_LABEL: Record<Level, string> = { met: 'met', partial: 'partly met', unmet: 'not met' };

/** A filled, half-filled or empty square: a shape, so the level never depends on colour alone. */
function LevelMark({ level }: { level: Level }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-3 shrink-0 rounded-[2px] border-[1.5px] border-ink',
        level === 'met' && 'bg-ink',
        level === 'partial' && 'bg-[linear-gradient(135deg,var(--ink)_50%,transparent_50%)]',
      )}
    />
  );
}

export function RequirementScorecard({ requirements }: { requirements: StageContent['requirements'] }) {
  return (
    <section aria-label="How this design scores">
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {REQUIREMENTS.map((requirement) => {
          const score = requirements[requirement.id];
          return (
            <li key={requirement.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-sm text-[13.5px] text-ink hover:text-ram"
                    aria-label={`${requirement.name}: ${LEVEL_LABEL[score.level]}. ${score.reason}`}
                  >
                    <LevelMark level={score.level} />
                    <span>{requirement.name}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-64 text-[13px] leading-snug">
                  <span className="font-[620]">{LEVEL_LABEL[score.level][0]!.toUpperCase() + LEVEL_LABEL[score.level].slice(1)}.</span> {score.reason}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
