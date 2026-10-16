import { ENGINE_LANGUAGES, type EngineLanguage } from '@/content/whole-database';

// Every source file and README of the four engines, as raw text loaded on demand. Build output,
// demo data, dependencies and caches are left out.
const modules = import.meta.glob(
  [
    '../../../codebases/**/*.{java,py,js,h,cpp,md}',
    '!../../../codebases/**/data/**',
    '!../../../codebases/**/out/**',
    '!../../../codebases/**/build/**',
    '!../../../codebases/**/node_modules/**',
    '!../../../codebases/**/__pycache__/**',
    '!../../../codebases/**/package.json',
  ],
  { query: '?raw', import: 'default' },
) as Record<string, () => Promise<string>>;

export interface SourceFile {
  language: EngineLanguage;
  /** Path inside the language folder, for example `lsm/sstable/bloomFilter.js`. */
  path: string;
  load: () => Promise<string>;
}

function toSourceFile([key, load]: [string, () => Promise<string>]): SourceFile | null {
  const relative = key.replace(/^(\.\.\/)+codebases\//, '');
  const slash = relative.indexOf('/');
  if (slash < 0) return null;
  const language = relative.slice(0, slash) as EngineLanguage;
  if (!ENGINE_LANGUAGES.includes(language)) return null;
  return { language, path: relative.slice(slash + 1), load };
}

export const SOURCE_FILES: readonly SourceFile[] = Object.entries(modules)
  .map(toSourceFile)
  .filter((file): file is SourceFile => file !== null)
  .sort((a, b) => a.path.localeCompare(b.path));

export function filesFor(language: EngineLanguage): SourceFile[] {
  return SOURCE_FILES.filter((file) => file.language === language);
}

export function findFile(language: EngineLanguage, path: string): SourceFile | undefined {
  return SOURCE_FILES.find((file) => file.language === language && file.path === path);
}
