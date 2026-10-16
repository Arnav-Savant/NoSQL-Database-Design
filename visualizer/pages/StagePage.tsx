import { useParams } from 'react-router';
import { Callout } from '@/components/stage/Callout';
import { ComponentList } from '@/components/stage/ComponentList';
import { RequirementScorecard } from '@/components/stage/RequirementScorecard';
import { StageCodeLinks } from '@/components/stage/StageCodeLinks';
import { StageHeader } from '@/components/stage/StageHeader';
import { WhyNext } from '@/components/stage/WhyNext';
import { Machine } from '@/components/machine/Machine';
import { WalkthroughPanel } from '@/components/walkthrough/WalkthroughPanel';
import { neighbours, stageBySlug } from '@/content/registry';
import { NotFoundPage } from './NotFoundPage';

function Prose({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;
  return (
    <section className="max-w-[72ch]">
      <h2 className="font-wide text-[21px] font-[650]">{title}</h2>
      <div className="mt-2 space-y-3 text-[16px] leading-relaxed">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export function StagePage() {
  const { slug } = useParams();
  const stage = stageBySlug(slug);
  if (!stage) return <NotFoundPage />;

  const { meta, content } = stage;
  const { next } = neighbours(meta.id);

  if (!content) {
    return (
      <main className="space-y-6 px-4 py-8 sm:px-8 lg:py-10">
        <StageHeader stage={meta} summary={meta.problem} />
        <p className="max-w-[72ch] text-ink-muted">The walkthrough for this stage is not built yet.</p>
        <WhyNext next={next} />
      </main>
    );
  }

  return (
    <main key={content.id} className="space-y-10 px-4 py-8 sm:px-8 lg:py-10">
      <div className="space-y-5">
        <StageHeader stage={meta} summary={content.summary} />
        <RequirementScorecard requirements={content.requirements} />
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <Prose title="The problem" paragraphs={content.problemDetail} />
        <Prose title={content.number === 0 ? 'What that implies' : 'The change'} paragraphs={content.change} />
      </div>

      {content.components.length > 0 && (
        <section className="max-w-[90ch]">
          <h2 className="mb-3 font-wide text-[21px] font-[650]">{content.number === 0 ? 'Two facts about hardware' : 'Components'}</h2>
          <ComponentList components={content.components} />
        </section>
      )}

      {content.walkthroughs.length > 0 ? (
        <WalkthroughPanel key={content.id} stageId={content.id} walkthroughs={content.walkthroughs} snippets={content.snippets} />
      ) : (
        content.initialState && <Machine id={content.id} state={content.initialState()} />
      )}

      {(content.limitations.length > 0 || content.notes.length > 0 || content.asides.length > 0) && (
        <div className="grid gap-8 lg:grid-cols-2">
          {content.limitations.length > 0 && (
            <section className="min-w-0">
              <h2 className="mb-3 font-wide text-[21px] font-[650]">What is still wrong</h2>
              <div className="space-y-4">
                {content.limitations.map((limitation) => (
                  <Callout key={limitation.title} kind="tradeoff" title={limitation.title}>
                    <p>{limitation.body}</p>
                  </Callout>
                ))}
              </div>
            </section>
          )}
          {(content.notes.length > 0 || content.asides.length > 0) && (
            <section className="min-w-0">
              <h2 className="mb-3 font-wide text-[21px] font-[650]">Worth knowing</h2>
              <div className="space-y-4">
                {content.notes.map((note) => (
                  <Callout key={note.title} kind="note" title={note.title}>
                    <p>{note.body}</p>
                  </Callout>
                ))}
                {content.asides.map((aside) => (
                  <Callout key={aside.title} kind="aside" title={aside.title}>
                    <p>{aside.body}</p>
                    {aside.code && <pre className="overflow-x-auto rounded-[3px] bg-paper-raised p-3 font-mono text-[12px]">{aside.code.source}</pre>}
                  </Callout>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <StageCodeLinks stageSlug={content.slug} />

      <WhyNext text={content.whyNext} next={next} />
    </main>
  );
}
