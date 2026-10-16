import { Link } from 'react-router';
import { stagePath } from '@/content/registry';
import type { StageMeta } from '@/content/types';

export function WhyNext({ text, next }: { text?: string; next?: StageMeta }) {
  if (!text && !next) return null;
  return (
    <section aria-labelledby="why-next" className="border-t border-rule pt-8">
      <h2 id="why-next" className="font-wide text-[21px] font-[650]">
        Why the next stage
      </h2>
      {text && <p className="mt-2 max-w-[72ch] text-[16px] leading-relaxed">{text}</p>}
      {next && (
        <Link
          to={stagePath(next)}
          className="mt-5 inline-flex items-baseline gap-3 rounded-sm border border-ink px-4 py-2.5 text-ink no-underline transition-colors hover:bg-ink hover:text-paper"
        >
          <span className="font-widest text-[13px] font-[340] tabular-nums">{String(next.number).padStart(2, '0')}</span>
          <span>Go to {next.title.charAt(0).toLowerCase() + next.title.slice(1)}</span>
        </Link>
      )}
    </section>
  );
}
