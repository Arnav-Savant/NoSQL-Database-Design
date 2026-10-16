import { NavLink } from 'react-router';
import { stagePath } from '@/content/paths';
import { STAGE_INDEX } from '@/content/stageIndex';
import { cn } from '@/utils/cn';

export function StageList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ol className="space-y-px">
      {STAGE_INDEX.map((stage) => (
        <li key={stage.id}>
          <NavLink
            to={stagePath(stage)}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group grid grid-cols-[2.25rem_1fr] items-baseline gap-1 border-l-2 border-transparent py-1.5 pr-2 pl-3 text-[13.5px] leading-snug text-ink-muted no-underline transition-colors hover:text-ink',
                isActive && 'border-ram bg-ram-wash/60 text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('font-widest text-[13px] font-[340] tabular-nums', isActive ? 'text-ram' : 'text-ink-muted')}>
                  {String(stage.number).padStart(2, '0')}
                </span>
                <span className={cn(isActive && 'font-[560]')}>{stage.title}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ol>
  );
}

export function StageRail() {
  return (
    <nav aria-label="Stages" className="sticky top-0 hidden max-h-dvh overflow-y-auto border-r border-rule py-6 lg:block">
      <p className="mb-3 px-3 text-[13px] text-ink-muted">The journey, in order</p>
      <StageList />
      <div className="mt-6 border-t border-rule px-3 pt-4">
        <NavLink to="/database" className="text-[13.5px] text-ink no-underline hover:text-ram">
          The whole database in one file
        </NavLink>
      </div>
    </nav>
  );
}
