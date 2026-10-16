import { Link } from 'react-router';
import type { EngineComponent } from '@/content/codebase/componentCatalog';
import { STAGE_INDEX } from '@/content/stageIndex';

/** "Where this fits": which engine component a file is, the stage that introduces it, and its job. */
export function ComponentMapPane({ component, fileName }: { component: EngineComponent | null; fileName: string }) {
  const stage = component?.stageSlug ? STAGE_INDEX.find((candidate) => candidate.slug === component.stageSlug) : undefined;

  return (
    <section aria-labelledby="where-this-fits">
      <h2 id="where-this-fits" className="font-wide text-[19px] leading-tight font-[650]">
        Where this fits
      </h2>
      {component ? (
        <div className="mt-3 border-l-2 border-ram pl-3">
          <p className="text-[16px] font-[620]">{component.name}</p>
          {stage ? (
            <p className="mt-1 text-[13.5px]">
              <Link to={`/stages/${stage.slug}`} className="text-ram underline underline-offset-2">
                Introduced in Stage {stage.number}: {stage.title}
              </Link>
            </p>
          ) : (
            <p className="mt-1 text-[13.5px] text-ink-muted">No single stage introduces it. It supports the pieces the stages describe.</p>
          )}
          <p className="mt-3 text-[14.5px] leading-relaxed">{component.purpose}</p>
        </div>
      ) : (
        <div className="mt-3 border-l-2 border-rule pl-3">
          <p className="text-[16px] font-[620]">Supporting file</p>
          <p className="mt-2 text-[14.5px] leading-relaxed">
            <code className="font-mono text-[12.5px]">{fileName}</code> isn't one of the engine's components. It explains how to run this version and where each piece lives.
          </p>
        </div>
      )}
    </section>
  );
}
