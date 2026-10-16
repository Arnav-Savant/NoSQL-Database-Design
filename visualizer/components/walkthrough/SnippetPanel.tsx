import type { Snippet } from '@/content/types';
import { CodeView } from '../code/CodeView';

export function SnippetPanel({ snippet, activeLine }: { snippet: Snippet | undefined; activeLine?: number }) {
  if (!snippet) {
    return <p className="px-4 py-3 text-[13px] text-ink-muted">This step has no code of its own.</p>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="border-b border-rule px-4 py-2 font-mono text-[12px] text-ink-muted">{snippet.title}</p>
      <CodeView code={snippet.lines.join('\n')} language="typescript" activeLine={activeLine} label={`Code for ${snippet.title}`} wrap className="min-h-0 flex-1" />
    </div>
  );
}
