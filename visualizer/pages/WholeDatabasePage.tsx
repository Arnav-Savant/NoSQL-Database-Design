import { useState } from 'react';
import { Link } from 'react-router';
import { CodeView } from '@/components/code/CodeView';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BUILDING_BLOCKS, ENGINE_LANGUAGES, WHOLE_DATABASE, type EngineLanguage } from '@/content/whole-database';

const STORAGE_KEY = 'storage-engine-anatomy:language';

function readStoredLanguage(): EngineLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return ENGINE_LANGUAGES.includes(stored as EngineLanguage) ? (stored as EngineLanguage) : 'java';
  } catch {
    return 'java';
  }
}

export function WholeDatabasePage() {
  const [language, setLanguage] = useState<EngineLanguage>(readStoredLanguage);
  const file = WHOLE_DATABASE[language];

  const choose = (next: string) => {
    if (!next) return;
    setLanguage(next as EngineLanguage);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:py-10">
      <header className="max-w-[72ch]">
        <h1 className="font-wide text-[32px] leading-[1.1] font-[720] tracking-[-0.01em] sm:text-[40px]">The whole database in one file</h1>
        <p className="mt-4 text-[17px] leading-relaxed">
          One class, <code className="font-mono text-[15px]">MyDatabase</code>, showing how every piece fits together: the write path, the read path, flushing, compaction and crash recovery, with a{' '}
          <code className="font-mono text-[15px]">main</code> that uses it.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          The building blocks it calls are used, not re-implemented here. Each one has a complete, runnable implementation in the codebases and its own stage in the walkthrough.
        </p>
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label={`MyDatabase in ${file.label}`} className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup type="single" value={language} onValueChange={choose} aria-label="Language" variant="outline">
              {ENGINE_LANGUAGES.map((candidate) => (
                <ToggleGroupItem key={candidate} value={candidate} className="px-3 text-[13.5px] data-[state=on]:bg-ink data-[state=on]:text-paper">
                  {WHOLE_DATABASE[candidate].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="font-mono text-[12.5px] text-ink-muted">{file.fileName}</p>
          </div>
          <div className="mt-3 overflow-hidden rounded-[4px] border border-rule bg-paper-raised">
            <CodeView key={language} code={file.source.trimEnd()} language={file.highlightAs} label={`${file.fileName} source`} className="max-h-[80vh]" />
          </div>
        </section>

        <aside aria-labelledby="building-blocks" className="xl:sticky xl:top-4 xl:self-start">
          <h2 id="building-blocks" className="font-wide text-[19px] font-[650]">
            Where each piece is built
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Full implementations live in <code className="font-mono text-[12.5px]">{file.codebase}</code>
          </p>
          <ul className="mt-4 space-y-3">
            {BUILDING_BLOCKS.map((block) => (
              <li key={block.name} className="border-l-2 border-rule pl-3">
                <p className="font-mono text-[12.5px] text-ink">{block.name}</p>
                <p className="text-[13.5px] leading-snug">{block.job}</p>
                <Link to={`/stages/${block.stageSlug}`} className="text-[13px] text-ram underline underline-offset-2">
                  See the stage that introduces it
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
