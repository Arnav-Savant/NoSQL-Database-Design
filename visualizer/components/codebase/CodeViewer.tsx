import { useEffect, useState } from 'react';
import { CodeView } from '@/components/code/CodeView';
import { WHOLE_DATABASE } from '@/content/whole-database';
import type { SourceFile } from '@/content/codebase/loadSources';
import { highlightLanguage } from '@/content/codebase/manifest';
import { cn } from '@/utils/cn';

interface Loaded {
  id: string;
  text: string | null;
  failed: boolean;
}

const idOf = (file: SourceFile) => `${file.language}/${file.path}`;

/** One source file, fetched when first shown and highlighted for its language. */
export function CodeViewer({ file, className }: { file: SourceFile; className?: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const id = idOf(file);

  useEffect(() => {
    let cancelled = false;
    file.load().then(
      (text) => {
        if (!cancelled) setLoaded({ id, text, failed: false });
      },
      () => {
        if (!cancelled) setLoaded({ id, text: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [file, id]);

  const current = loaded?.id === id ? loaded : null;
  const language = highlightLanguage(file.path);
  const label = `${WHOLE_DATABASE[file.language].label} ${file.path}`;

  return (
    <section aria-label={label} className={cn('flex min-w-0 flex-col overflow-hidden rounded-[4px] border border-rule bg-paper-raised', className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule px-3 py-2">
        <p className="min-w-0 truncate font-mono text-[12.5px] text-ink" title={file.path}>
          {file.path}
        </p>
        <p className="text-[12.5px] text-ink-muted">
          {WHOLE_DATABASE[file.language].label}
          {current?.text != null ? `, ${current.text.trimEnd().split('\n').length} lines` : ''}
        </p>
      </header>
      {current === null ? (
        <p className="px-3 py-6 text-[14px] text-ink-muted" role="status">
          Loading the file
        </p>
      ) : current.failed || current.text === null ? (
        <p className="px-3 py-6 text-[14px] text-fault" role="alert">
          This file couldn't be loaded. Reload the page to try again.
        </p>
      ) : language ? (
        <CodeView code={current.text.trimEnd()} language={language} label={`${label} source`} className="max-h-[75vh] min-h-0 flex-1" />
      ) : (
        <pre
          aria-label={`${label} text`}
          tabIndex={0}
          className="max-h-[75vh] min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-[1.7] break-words whitespace-pre-wrap text-ink"
        >
          {current.text.trimEnd()}
        </pre>
      )}
    </section>
  );
}
