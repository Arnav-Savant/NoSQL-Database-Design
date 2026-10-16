import type { Value } from '@/engine/model';
import { cn } from '@/utils/cn';

export function ValueText({ value, className }: { value: Value; className?: string }) {
  if (value.type === 'tombstone') {
    return <span className={cn('rounded-[2px] bg-ink px-1 font-sans text-[11px] text-paper', className)}>deleted</span>;
  }
  return <span className={cn('font-mono', value.type === 'string' && 'text-disk', className)}>{value.display}</span>;
}
