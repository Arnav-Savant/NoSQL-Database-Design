import { useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CodebaseLayoutProps {
  intro: ReactNode;
  controls: ReactNode;
  tree: ReactNode;
  /** The open file, shown on the button that reveals the file tree on narrow screens. */
  currentPath: string;
  code: ReactNode;
  aside: ReactNode;
  /** Two code panes need the width the third column would take. */
  comparing: boolean;
}

/**
 * Three panes on wide screens: files, code, and where the file fits. When comparing, "where this
 * fits" moves under the file tree so the two code panes can sit side by side. On narrow screens
 * the panes stack and the file tree folds away behind a button.
 */
export function CodebaseLayout({ intro, controls, tree, currentPath, code, aside, comparing }: CodebaseLayoutProps) {
  const [treeOpenFor, setTreeOpenFor] = useState<string | null>(null);
  // Picking a file closes the tree again on narrow screens.
  const treeOpen = treeOpenFor === currentPath;

  return (
    <main className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-8 sm:px-6 lg:py-10">
      <header className="max-w-[72ch]">{intro}</header>
      <div className="mt-6">{controls}</div>

      <div
        className={cn(
          'mt-6 grid min-w-0 items-start gap-6 lg:grid-rows-[auto_1fr]',
          comparing ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]',
        )}
      >
        <div
          className={cn(
            'min-w-0 lg:col-start-1 lg:row-start-1',
            comparing ? '' : 'lg:row-span-2 xl:row-span-1',
          )}
        >
          <button
            type="button"
            aria-expanded={treeOpen}
            aria-controls="codebase-files"
            onClick={() => setTreeOpenFor(treeOpen ? null : currentPath)}
            className="flex w-full items-center gap-2 rounded-[4px] border border-rule px-3 py-2 text-left text-[14px] lg:hidden"
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-ink-muted transition-transform duration-150',
                treeOpen && 'rotate-90',
              )}
            />
            <span>Files</span>
            <span className="ml-auto min-w-0 truncate font-mono text-[12.5px] text-ink-muted">{currentPath}</span>
          </button>
          <div
            id="codebase-files"
            className={cn('mt-2 min-w-0 lg:mt-0 lg:block lg:max-h-[75vh] lg:overflow-y-auto', treeOpen ? 'block' : 'hidden')}
          >
            {tree}
          </div>
        </div>

        <div
          className={cn(
            'min-w-0 lg:col-start-2 lg:row-start-1',
            comparing && 'lg:row-span-2',
          )}
        >
          {code}
        </div>

        <aside
          className={cn(
            'min-w-0',
            comparing ? 'lg:col-start-1 lg:row-start-2' : 'lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1',
          )}
        >
          {aside}
        </aside>
      </div>
    </main>
  );
}
