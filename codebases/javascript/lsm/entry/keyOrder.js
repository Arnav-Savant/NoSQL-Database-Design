// Keys are ordered by their UTF-8 bytes, compared as unsigned values. Every language port uses
// the same rule, so a table sorted by one port can be searched by another.
export function compareKeys(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}
