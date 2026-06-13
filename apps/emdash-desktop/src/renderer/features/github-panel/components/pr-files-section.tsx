import {
  ChevronDown,
  ChevronRight,
  SquareArrowRight,
  SquareMinus,
  SquarePlus,
  SquareX,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { FileIcon } from '@renderer/lib/editor/file-icon';
import { Spinner } from '@renderer/lib/ui/spinner';
import { formatDiffLineCount } from '@renderer/utils/format-diff-line-count';
import { cn } from '@renderer/utils/utils';
import type { PanelPrFile } from '@shared/github-panel';
import type { PrDetailStore } from '../stores/pr-detail-store';

// ─── Patch parser ───────────────────────────────────────────────────────────

type DiffLineKind = 'added' | 'removed' | 'context' | 'hunk';

interface DiffLine {
  kind: DiffLineKind;
  content: string;
  oldNum: number | null;
  newNum: number | null;
}

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(raw);
      if (m) {
        oldLine = parseInt(m[1], 10);
        newLine = parseInt(m[2], 10);
      }
      lines.push({ kind: 'hunk', content: raw, oldNum: null, newNum: null });
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'added', content: raw.slice(1), oldNum: null, newNum: newLine++ });
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'removed', content: raw.slice(1), oldNum: oldLine++, newNum: null });
    } else {
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      lines.push({ kind: 'context', content: text, oldNum: oldLine++, newNum: newLine++ });
    }
  }
  return lines;
}

// ─── File status icon (matches existing Emdash diff viewer style) ────────────

function FileStatusIcon({ status }: { status: PanelPrFile['status'] }) {
  switch (status) {
    case 'added':
      return <SquarePlus className="size-3.5 shrink-0 text-foreground-diff-added" />;
    case 'removed':
      return <SquareX className="size-3.5 shrink-0 text-foreground-diff-deleted" />;
    case 'renamed':
      return <SquareArrowRight className="size-3.5 shrink-0 text-foreground-muted" />;
    default:
      return <SquareMinus className="size-3.5 shrink-0 text-foreground-diff-modified" />;
  }
}

// ─── Addition/deletion stats bar ─────────────────────────────────────────────

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  const blocks = 5;
  const addBlocks = total > 0 ? Math.round((additions / total) * blocks) : 0;
  const delBlocks = blocks - addBlocks;

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs leading-none tabular-nums">
      {additions > 0 && (
        <span className="text-foreground-diff-added">+{formatDiffLineCount(additions)}</span>
      )}
      {deletions > 0 && (
        <span className="text-foreground-diff-deleted">−{formatDiffLineCount(deletions)}</span>
      )}
      <div className="flex gap-px">
        {Array.from({ length: blocks }, (_, i) => (
          <span
            key={i}
            className={cn(
              'inline-block h-2 w-2 rounded-[2px]',
              i < addBlocks ? 'bg-foreground-diff-added/70' : 'bg-foreground-diff-deleted/60'
            )}
          />
        ))}
        {delBlocks === 0 && addBlocks === 0 && (
          <span className="inline-block h-2 w-2 rounded-[2px] bg-border" />
        )}
      </div>
    </div>
  );
}

// ─── Inline diff renderer ────────────────────────────────────────────────────

function InlineDiff({ patch }: { patch: string }) {
  const lines = parsePatch(patch);

  return (
    <div className="overflow-x-auto font-mono text-[11px] leading-[1.6]">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.kind === 'hunk') {
              return (
                <tr key={i} className="bg-background-1">
                  <td className="w-10 border-r border-border px-2 py-px text-right text-foreground-passive opacity-60 select-none">
                    …
                  </td>
                  <td className="w-10 border-r border-border px-2 py-px text-right text-foreground-passive opacity-60 select-none">
                    …
                  </td>
                  <td className="px-3 py-px text-foreground-passive">{line.content}</td>
                </tr>
              );
            }

            const isAdded = line.kind === 'added';
            const isRemoved = line.kind === 'removed';

            return (
              <tr
                key={i}
                className={cn(
                  isAdded && 'bg-foreground-diff-added/8',
                  isRemoved && 'bg-foreground-diff-deleted/8'
                )}
              >
                <td
                  className={cn(
                    'select-none px-2 py-px text-right tabular-nums w-10 border-r border-border/60',
                    isAdded ? 'text-foreground-diff-added/40' : 'text-foreground-passive opacity-50'
                  )}
                >
                  {line.oldNum ?? ''}
                </td>
                <td
                  className={cn(
                    'select-none px-2 py-px text-right tabular-nums w-10 border-r border-border/60',
                    isRemoved
                      ? 'text-foreground-diff-deleted/40'
                      : 'text-foreground-passive opacity-50'
                  )}
                >
                  {line.newNum ?? ''}
                </td>
                <td
                  className={cn(
                    'px-3 py-px whitespace-pre',
                    isAdded && 'text-foreground-diff-added',
                    isRemoved && 'text-foreground-diff-deleted',
                    !isAdded && !isRemoved && 'text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'mr-1.5 select-none',
                      isAdded && 'text-foreground-diff-added/70',
                      isRemoved && 'text-foreground-diff-deleted/70',
                      !isAdded && !isRemoved && 'text-foreground-passive opacity-0'
                    )}
                  >
                    {isAdded ? '+' : isRemoved ? '−' : ' '}
                  </span>
                  {line.content}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── File row ────────────────────────────────────────────────────────────────

function getFilename(path: string) {
  return path.split('/').pop() ?? path;
}

function getDirectory(path: string) {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

function FileRow({ file }: { file: PanelPrFile }) {
  const [expanded, setExpanded] = useState(false);
  const hasPatch = !!file.patch;
  const displayPath = file.previousFilename
    ? `${file.previousFilename} → ${file.filename}`
    : file.filename;
  const filename = getFilename(file.filename);
  const directory = getDirectory(file.filename);

  return (
    <div className="border-b border-border last:border-b-0">
      {/* File header */}
      <button
        type="button"
        onClick={() => hasPatch && setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
          hasPatch ? 'cursor-pointer hover:bg-background-1' : 'cursor-default'
        )}
      >
        {/* Expand chevron */}
        <span className="shrink-0 text-foreground-passive">
          {hasPatch ? (
            expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : (
            <span className="inline-block size-3.5" />
          )}
        </span>

        {/* File status icon */}
        <FileStatusIcon status={file.status} />

        {/* File icon + name */}
        <FileIcon filename={filename} size={12} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="shrink-0 truncate text-xs text-foreground">{filename}</span>
          {directory && (
            <span className="min-w-0 shrink truncate text-[11px] text-foreground-muted">
              {file.previousFilename ? displayPath : directory}
            </span>
          )}
        </span>

        {/* Diff stats */}
        <DiffStats additions={file.additions} deletions={file.deletions} />
      </button>

      {/* Inline diff */}
      {expanded && file.patch && (
        <div className="border-t border-border bg-background">
          <InlineDiff patch={file.patch} />
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export const PrFilesSection = observer(function PrFilesSection({
  store,
}: {
  store: PrDetailStore;
}) {
  const files = store.files.data ?? [];
  const isLoading = store.files.loading && files.length === 0;

  if (isLoading) {
    return (
      <div className="flex h-12 items-center justify-center">
        <Spinner size="sm" className="text-foreground-passive" />
      </div>
    );
  }

  if (store.files.error && files.length === 0) {
    return <p className="py-3 text-center text-xs text-foreground-error">{store.files.error}</p>;
  }

  if (files.length === 0) {
    return <p className="py-3 text-center text-xs text-foreground-passive">No changed files</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {files.map((file) => (
        <FileRow key={file.filename} file={file} />
      ))}
    </div>
  );
});
