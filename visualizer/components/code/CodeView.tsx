import { useEffect, useMemo, useRef } from 'react';
import { useHighlighter } from '@/hooks/useHighlighter';
import { tokenize, type CodeLanguage } from '@/utils/highlighter';
import { cn } from '@/utils/cn';

interface CodeViewProps {
  code: string;
  language: CodeLanguage;
  /** 1-based line to mark as the one currently executing. */
  activeLine?: number;
  className?: string;
  label: string;
  /** Wrap long lines instead of scrolling sideways (for narrow panels). */
  wrap?: boolean;
}

/** Highlighted code with line numbers; plain text renders until the highlighter has loaded. */
export function CodeView({ code, language, activeLine, className, label, wrap = false }: CodeViewProps) {
  const highlighter = useHighlighter();
  const lines = useMemo(
    () => (highlighter ? tokenize(highlighter, code, language) : code.split('\n').map((line) => [{ content: line, color: undefined }])),
    [highlighter, code, language],
  );
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeLine]);

  const gutterWidth = `${String(lines.length).length + 1}ch`;

  return (
    <pre className={cn('overflow-auto py-2 font-mono text-[12.5px] leading-[1.7]', className)} aria-label={label} tabIndex={0}>
      <code className={cn('block', wrap ? 'min-w-0' : 'min-w-max')}>
        {lines.map((tokens, index) => {
          const lineNumber = index + 1;
          const active = lineNumber === activeLine;
          return (
            <div
              key={lineNumber}
              ref={active ? activeRef : undefined}
              aria-current={active ? 'step' : undefined}
              className={cn('flex border-l-[3px] border-transparent pr-4', active && 'border-ram bg-ram-wash')}
            >
              <span className="box-content shrink-0 pr-3 pl-2 text-right text-ink-muted/70 select-none tabular-nums" style={{ width: gutterWidth }}>
                {lineNumber}
              </span>
              <span className={cn(wrap && 'min-w-0 whitespace-pre-wrap break-words')}>
                {tokens.length === 0 || (tokens.length === 1 && tokens[0]?.content === '') ? ' ' : null}
                {tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} style={token.color ? { color: token.color } : undefined}>
                    {token.content}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
