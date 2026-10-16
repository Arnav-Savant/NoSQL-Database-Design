import type { EngineLanguage } from '@/content/whole-database';
import type { CodeLanguage } from '@/utils/highlighter';
import { COMPONENT_CATALOG, type EngineComponent } from './componentCatalog';
import { filesFor, type SourceFile } from './loadSources';

const BY_STEM = new Map<string, EngineComponent>();
for (const component of COMPONENT_CATALOG) {
  for (const stem of component.stems) BY_STEM.set(stem, component);
}

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `bloom_filter.cpp`, `BloomFilter.java` and `bloomFilter.js` all become `bloomfilter`. */
export function normaliseStem(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/[_-]/g, '').toLowerCase();
}

export function isReadme(path: string): boolean {
  return /^readme\.md$/i.test(fileName(path));
}

/** The engine component a file implements, or null for a README or other supporting file. */
export function componentOf(path: string): EngineComponent | null {
  if (isReadme(path)) return null;
  return BY_STEM.get(normaliseStem(path)) ?? null;
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** How to highlight a file, or null for prose such as a README. */
export function highlightLanguage(path: string): CodeLanguage | null {
  switch (extension(path)) {
    case 'java':
      return 'java';
    case 'py':
      return 'python';
    case 'js':
      return 'javascript';
    case 'h':
    case 'cpp':
      return 'cpp';
    default:
      return null;
  }
}

/**
 * The file in `language` that plays the same part as `path`: the same component's main file
 * (a `.cpp` before its header), or the README for supporting files.
 */
export function counterpartIn(path: string, language: EngineLanguage): SourceFile | undefined {
  const files = filesFor(language);
  const component = componentOf(path);
  if (!component) return files.find((file) => isReadme(file.path) && !file.path.includes('/'));

  const candidates = files.filter((file) => componentOf(file.path)?.id === component.id);
  const rank = (file: SourceFile) => {
    const stemIndex = component.stems.indexOf(normaliseStem(file.path));
    return stemIndex * 2 + (extension(file.path) === 'h' ? 1 : 0);
  };
  return candidates.sort((a, b) => rank(a) - rank(b))[0];
}

export function defaultFile(language: EngineLanguage): SourceFile | undefined {
  return filesFor(language).find((file) => file.path === 'README.md');
}
