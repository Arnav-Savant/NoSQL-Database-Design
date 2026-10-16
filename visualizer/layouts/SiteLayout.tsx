import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { cn } from '@/utils/cn';

const NAV_ITEMS = [
  { to: '/stages/requirements', label: 'Stages', matchPrefix: '/stages' },
  { to: '/database', label: 'Whole database', matchPrefix: '/database' },
] as const;

export function SiteLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-paper-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3 sm:px-6">
          <NavLink to="/" className="font-wide text-[15px] font-[680] tracking-tight text-ink no-underline">
            Storage engine anatomy
          </NavLink>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-2">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-sm px-2 py-1 text-sm text-ink-muted no-underline transition-colors hover:text-ink',
                    (isActive || pathname.startsWith(item.matchPrefix)) && 'text-ink underline decoration-ram decoration-2 underline-offset-[6px]',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <div id="content" className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <ScrollRestoration />
    </div>
  );
}
