import type { BloomView } from '@/engine/model';
import { cn } from '@/utils/cn';

/** The Bloom filter's bits, 16 per row. Probed bits are outlined; a probed zero is a fault outline. */
export function BitArray({ bloom, probed = [], zeroBit }: { bloom: BloomView; probed?: number[]; zeroBit?: number }) {
  const setCount = bloom.bits.filter((bit) => bit === 1).length;
  return (
    <div>
      <p className="mb-1 text-[11.5px] text-ink-muted">
        Bloom filter: {setCount} of {bloom.bits.length} bits set, k = {bloom.hashCount}
      </p>
      <div className="grid w-max grid-cols-16 gap-px" role="img" aria-label={`Bloom filter bits, ${setCount} of ${bloom.bits.length} set`}>
        {bloom.bits.map((bit, position) => (
          <span
            key={position}
            title={`bit ${position}: ${bit}`}
            className={cn(
              'size-3 rounded-[1px]',
              bit === 1 ? 'bg-ram' : 'bg-paper ring-1 ring-rule ring-inset',
              probed.includes(position) && 'outline-2 outline-offset-1 outline-ink',
              zeroBit === position && 'outline-2 outline-offset-1 outline-fault',
            )}
          />
        ))}
      </div>
    </div>
  );
}
