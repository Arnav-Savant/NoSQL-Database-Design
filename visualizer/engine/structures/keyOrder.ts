const encoder = new TextEncoder();

// Keys sort by their UTF-8 bytes, compared as unsigned values, exactly as in the engines.
export function compareKeys(left: string, right: string): number {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}
