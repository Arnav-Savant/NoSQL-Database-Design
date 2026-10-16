import { Link } from 'react-router';
import { COMPONENT_CATALOG } from '@/content/codebase/componentCatalog';
import { filesFor } from '@/content/codebase/loadSources';
import { fileName, normaliseStem } from '@/content/codebase/manifest';

/** Links from a stage to the real implementation of every component it introduces. */
export function StageCodeLinks({ stageSlug }: { stageSlug: string }) {
  const components = COMPONENT_CATALOG.filter((component) => component.stageSlug === stageSlug);
  if (components.length === 0) return null;
  const javascriptFiles = filesFor('javascript');

  return (
    <section aria-labelledby="stage-code" className="max-w-[90ch]">
      <h2 id="stage-code" className="font-wide text-[21px] font-[650]">
        In the real code
      </h2>
      <p className="mt-1 text-[14.5px] text-ink-muted">The working engine implements this stage in these files. Each opens in Java, Python, JavaScript or C++.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {components.map((component) => {
          const file = javascriptFiles.find((candidate) => normaliseStem(candidate.path) === component.stems[0]);
          if (!file) return null;
          return (
            <li key={component.id}>
              <Link
                to={`/codebase/javascript/${file.path}`}
                className="inline-flex items-baseline gap-2 rounded-[3px] border border-rule bg-paper-raised px-3 py-1.5 text-ink no-underline hover:border-disk"
              >
                <span className="text-[14px]">{component.name}</span>
                <span className="font-mono text-[11.5px] text-ink-muted">{fileName(file.path)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
