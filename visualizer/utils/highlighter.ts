import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export type CodeLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'cpp';

export interface CodeToken {
  content: string;
  color: string | undefined;
}

// Token colours are CSS variables defined in styles/code.css, so code follows light and dark
// mode through the same material tokens as the rest of the page.
const THEME = createCssVariablesTheme({ name: 'material-tokens', variablePrefix: '--code-', variableDefaults: {} });

let highlighterPromise: Promise<HighlighterCore> | null = null;

export function loadHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [THEME],
    langs: [
      import('@shikijs/langs/typescript'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/python'),
      import('@shikijs/langs/java'),
      import('@shikijs/langs/cpp'),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

export function tokenize(highlighter: HighlighterCore, code: string, language: CodeLanguage): CodeToken[][] {
  return highlighter
    .codeToTokensBase(code, { lang: language, theme: 'material-tokens' })
    .map((line) => line.map((token) => ({ content: token.content, color: token.color })));
}
