import { useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { CodeViewer } from '@/components/codebase/CodeViewer';
import { CompareSwitch } from '@/components/codebase/CompareSwitch';
import { ComponentMapPane } from '@/components/codebase/ComponentMapPane';
import { FileTree } from '@/components/codebase/FileTree';
import { LanguageToggle } from '@/components/codebase/LanguageToggle';
import { filesFor, findFile } from '@/content/codebase/loadSources';
import { componentOf, counterpartIn, defaultFile, fileName } from '@/content/codebase/manifest';
import { ENGINE_LANGUAGES, WHOLE_DATABASE, type EngineLanguage } from '@/content/whole-database';
import { CodebaseLayout } from '@/layouts/CodebaseLayout';
import { cn } from '@/utils/cn';

const isLanguage = (value: string | null | undefined): value is EngineLanguage => ENGINE_LANGUAGES.includes(value as EngineLanguage);

export function CodebasePage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const language = isLanguage(params.language) ? params.language : null;
  const path = params['*'] ?? '';
  const compareParam = searchParams.get('compare');
  const compareWith = isLanguage(compareParam) && compareParam !== language ? compareParam : null;

  const files = useMemo(() => (language ? filesFor(language) : []), [language]);

  if (!language) return <Navigate to="/codebase/javascript/README.md" replace />;
  if (!path) {
    const fallback = defaultFile(language);
    if (fallback) return <Navigate to={`/codebase/${language}/${fallback.path}`} replace />;
  }

  const file = findFile(language, path);
  const component = componentOf(path);
  const compareFile = compareWith ? counterpartIn(path, compareWith) : undefined;

  const go = (nextLanguage: EngineLanguage, nextPath: string, nextCompare: EngineLanguage | null) => {
    const query = nextCompare ? `?compare=${nextCompare}` : '';
    navigate(`/codebase/${nextLanguage}/${nextPath}${query}`);
  };

  const switchLanguage = (next: EngineLanguage) => {
    if (next === language) return;
    const target = counterpartIn(path, next) ?? defaultFile(next);
    // Picking the language being compared with swaps the two panes.
    go(next, target?.path ?? '', compareWith === next ? language : compareWith);
  };

  const setCompare = (next: EngineLanguage | null) => {
    const query = next ? `?compare=${next}` : '';
    navigate(`/codebase/${language}/${path}${query}`, { replace: true });
  };

  // Browsing keeps the comparison on.
  const tree = <FileTree language={language} files={files} currentPath={path} search={compareWith ? `?compare=${compareWith}` : ''} />;

  return (
    <CodebaseLayout
      comparing={compareWith !== null}
      currentPath={path}
      intro={
        <>
          <h1 className="font-wide text-[32px] leading-[1.1] font-[720] tracking-[-0.01em] sm:text-[40px]">The codebase</h1>
          <p className="mt-4 text-[17px] leading-relaxed">
            The same LSM-tree key-value store, written four times: in Java, Python, JavaScript and C++. Every version has the same parts with the same
            names, so you can read whichever language you know best.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            Open a file to see which part of the engine it is and which stage introduces the idea. Turn on comparing to read the same part in two languages
            at once.
          </p>
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <LanguageToggle value={language} onChange={switchLanguage} label="Language" />
          <CompareSwitch primary={language} compareWith={compareWith} onChange={setCompare} />
        </div>
      }
      tree={tree}
      code={
        file ? (
          <div className={cn('grid min-w-0 gap-4', compareWith && 'xl:grid-cols-2')}>
            <CodeViewer key={`${language}/${path}`} file={file} />
            {compareWith ? (
              compareFile ? (
                <CodeViewer key={`${compareWith}/${compareFile.path}`} file={compareFile} />
              ) : (
                <p className="rounded-[4px] border border-rule px-3 py-6 text-[14px] text-ink-muted">
                  The {WHOLE_DATABASE[compareWith].label} version has no file for this part.
                </p>
              )
            ) : null}
          </div>
        ) : (
          <div className="rounded-[4px] border border-rule px-4 py-6">
            <p className="text-[15px]">
              There's no file called <code className="font-mono text-[13px]">{path}</code> in the {WHOLE_DATABASE[language].label} version.
            </p>
            <p className="mt-2 text-[14px]">
              <Link to={`/codebase/${language}/README.md`} className="text-ram underline underline-offset-2">
                Start from the {WHOLE_DATABASE[language].label} README
              </Link>
            </p>
          </div>
        )
      }
      aside={<ComponentMapPane component={file ? component : null} fileName={fileName(path)} />}
    />
  );
}
