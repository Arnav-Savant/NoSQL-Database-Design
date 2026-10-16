import { Button } from '@/components/ui/button';
import type { WalkthroughControls } from '@/hooks/useWalkthrough';
import { cn } from '@/utils/cn';

export function StepControls({ controls }: { controls: WalkthroughControls }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={controls.previous} disabled={controls.isFirst}>
        Previous step
      </Button>
      <Button size="sm" onClick={controls.next} disabled={controls.isLast} className="bg-ink text-paper hover:bg-ink/85">
        Next step
      </Button>
      <p className="text-[13px] text-ink-muted tabular-nums" aria-live="polite">
        Step {controls.index + 1} of {controls.count}
      </p>
      <p className="ml-auto hidden text-[12px] text-ink-muted md:block">Use the arrow keys to step</p>
    </div>
  );
}

export function StepProgress({ controls, problemSteps }: { controls: WalkthroughControls; problemSteps: ReadonlySet<number> }) {
  return (
    <ol className="flex gap-1" aria-label="Steps">
      {Array.from({ length: controls.count }, (_, index) => (
        <li key={index} className="flex-1">
          <button
            type="button"
            onClick={() => controls.goTo(index)}
            aria-label={`Go to step ${index + 1}`}
            aria-current={index === controls.index ? 'step' : undefined}
            className={cn(
              'block h-1.5 w-full rounded-[1px] transition-colors',
              index < controls.index && 'bg-ink/45',
              index === controls.index && (problemSteps.has(index) ? 'bg-fault' : 'bg-ink'),
              index > controls.index && 'bg-rule hover:bg-ink-muted/40',
            )}
          />
        </li>
      ))}
    </ol>
  );
}
