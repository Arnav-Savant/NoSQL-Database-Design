import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { EngineLanguage } from '@/content/whole-database';
import type { SourceFile } from '@/content/codebase/loadSources';
import { cn } from '@/utils/cn';

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  files: SourceFile[];
}

function buildTree(files: readonly SourceFile[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], files: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.find((candidate) => candidate.name === part);
      if (!child) {
        child = { name: part, path, folders: [], files: [] };
        folder.folders.push(child);
      }
      folder = child;
    }
    folder.files.push(file);
  }
  const sort = (folder: FolderNode) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.files.sort((a, b) => a.path.localeCompare(b.path));
    folder.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** Every folder that contains `path`, from the top down. */
function ancestorsOf(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

interface FileTreeProps {
  language: EngineLanguage;
  files: readonly SourceFile[];
  currentPath: string;
  /** Query string kept on every file link, such as the language being compared with. */
  search?: string;
}

export function FileTree({ language, files, currentPath, search = '' }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());

  // Folders on the way to the current file start open; the reader's own choices win after that.
  const openByDefault = useMemo(() => new Set(ancestorsOf(currentPath)), [currentPath]);
  const isOpen = (path: string) => toggled.get(path) ?? openByDefault.has(path);
  const toggle = (path: string) =>
    setToggled((previous) => {
      const next = new Map(previous);
      next.set(path, !isOpen(path));
      return next;
    });

  const renderFolder = (folder: FolderNode, depth: number) => (
    <ul className="space-y-px">
      {folder.folders.map((child) => {
        const open = isOpen(child.path);
        return (
          <li key={child.path}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => toggle(child.path)}
              className="flex w-full items-center gap-2 rounded-sm py-1 pr-2 text-left text-[13.5px] text-ink hover:bg-ram-wash/60"
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-ink-muted transition-transform duration-150',
                  open && 'rotate-90',
                )}
              />
              <span className="font-mono text-[12.5px]">{child.name}</span>
            </button>
            {open ? renderFolder(child, depth + 1) : null}
          </li>
        );
      })}
      {folder.files.map((file) => {
        const current = file.path === currentPath;
        const name = file.path.slice(file.path.lastIndexOf('/') + 1);
        return (
          <li key={file.path}>
            <Link
              to={`/codebase/${language}/${file.path}${search}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'block truncate border-l-[3px] py-1 pr-2 font-mono text-[12.5px] no-underline hover:bg-ram-wash/60',
                current ? 'border-ram bg-ram-wash text-ink' : 'border-transparent text-ink-muted hover:text-ink',
              )}
              style={{ paddingLeft: `${depth * 14 + 19}px` }}
              title={file.path}
            >
              {name}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return <nav aria-label="Files">{renderFolder(tree, 0)}</nav>;
}
