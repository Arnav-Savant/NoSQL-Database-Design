import { useMemo, useRef, useState } from 'react';
import type { Snippet, Walkthrough } from '@/content/types';
import { useStepKeyboard } from '@/hooks/useStepKeyboard';
import { useWalkthrough } from '@/hooks/useWalkthrough';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Machine } from '../machine/Machine';
import { NarrationPanel } from './NarrationPanel';
import { SnippetPanel } from './SnippetPanel';
import { StepControls, StepProgress } from './StepControls';

interface WalkthroughPanelProps {
  stageId: string;
  walkthroughs: Walkthrough[];
  snippets: Snippet[];
}

export function WalkthroughPanel({ stageId, walkthroughs, snippets }: WalkthroughPanelProps) {
  const [selectedId, setSelectedId] = useState(walkthroughs[0]?.id ?? '');
  const walkthrough = walkthroughs.find((candidate) => candidate.id === selectedId) ?? walkthroughs[0];
  const steps = useMemo(() => walkthrough?.build() ?? [], [walkthrough]);
  const controls = useWalkthrough(steps);
  const problemSteps = useMemo(() => new Set(steps.filter((step) => step.outcome === 'problem').map((step) => step.index)), [steps]);
  const region = useRef<HTMLDivElement | null>(null);
  useStepKeyboard(region, controls);

  if (!walkthrough || !controls.step) return null;
  const snippet = snippets.find((candidate) => candidate.id === controls.step?.snippet?.id);

  return (
    <section aria-labelledby={`${stageId}-walkthroughs`} className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <h2 id={`${stageId}-walkthroughs`} className="font-wide text-[21px] font-[650]">
          Walk through it
        </h2>
        {walkthroughs.length > 1 && (
          <Tabs value={walkthrough.id} onValueChange={setSelectedId}>
            <TabsList className="h-auto flex-wrap justify-start bg-transparent p-0">
              {walkthroughs.map((candidate) => (
                <TabsTrigger
                  key={candidate.id}
                  value={candidate.id}
                  className="rounded-none border-b-2 border-transparent px-2.5 py-1 text-[13.5px] text-ink-muted shadow-none data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none"
                >
                  {candidate.title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <p className="text-[14.5px] text-ink-muted">{walkthrough.summary}</p>

      <div
        ref={region}
        tabIndex={-1}
        aria-label={`Walkthrough: ${walkthrough.title}`}
        className="grid gap-5 outline-none xl:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]"
      >
        <div className="min-w-0 space-y-4">
          <StepProgress controls={controls} problemSteps={problemSteps} />
          <Machine id={`${stageId}-${walkthrough.id}`} state={controls.step.state} step={controls.step} />
          <NarrationPanel step={controls.step} />
          <StepControls controls={controls} />
        </div>
        <aside aria-label="Code for this step" className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="overflow-hidden rounded-[4px] border border-rule bg-paper-raised">
            <p className="border-b border-rule px-4 py-2 text-[13px] font-[620]">Code</p>
            <div className="max-h-[28rem]">
              <SnippetPanel snippet={snippet} activeLine={controls.step.snippet?.line} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
