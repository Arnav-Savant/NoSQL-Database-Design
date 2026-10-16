import { Link } from 'react-router';
import { REQUIREMENTS } from '@/content/requirements';
import { stagePath } from '@/content/registry';
import { STAGE_INDEX } from '@/content/stageIndex';

export function OverviewPage() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-8 lg:py-16">
      <section className="max-w-[60ch]">
        <h1 className="font-wide text-[36px] leading-[1.08] font-[740] tracking-[-0.015em] sm:text-[52px]">
          See how a key-value database grows from one file into an LSM tree.
        </h1>
        <p className="mt-5 text-[18px] leading-relaxed">
          Seventeen stages, each fixing a problem the last one left behind. Every stage shows RAM and disk side by side, so you can watch each read, write, flush and merge move data between them.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/stages/requirements" className="rounded-sm bg-ink px-5 py-2.5 text-paper no-underline hover:bg-ink/85">
            Start with the requirements
          </Link>
          <Link to="/database" className="rounded-sm border border-ink px-5 py-2.5 text-ink no-underline hover:bg-ink hover:text-paper">
            Read the whole database in one file
          </Link>
        </div>
      </section>

      <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-labelledby="requirements-heading">
          <h2 id="requirements-heading" className="font-wide text-[21px] font-[650]">
            What it must do
          </h2>
          <dl className="mt-4 space-y-4">
            {REQUIREMENTS.map((requirement) => (
              <div key={requirement.id}>
                <dt className="font-[620]">{requirement.name}</dt>
                <dd className="text-[15px] leading-relaxed text-ink-muted">{requirement.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="map-heading">
          <h2 id="map-heading" className="font-wide text-[21px] font-[650]">
            The journey
          </h2>
          <ol className="mt-4 divide-y divide-rule border-y border-rule">
            {STAGE_INDEX.map((stage) => (
              <li key={stage.id}>
                <Link to={stagePath(stage)} className="group grid grid-cols-[3rem_1fr] gap-x-3 py-3 text-ink no-underline">
                  <span className="font-widest text-[20px] leading-tight font-[280] text-ink-muted tabular-nums group-hover:text-ram">
                    {String(stage.number).padStart(2, '0')}
                  </span>
                  <span>
                    <span className="block font-[620] group-hover:text-ram">{stage.title}</span>
                    <span className="block text-[14.5px] leading-snug text-ink-muted">{stage.problem}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
