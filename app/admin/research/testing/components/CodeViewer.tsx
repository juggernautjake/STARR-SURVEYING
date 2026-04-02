// CodeViewer.tsx — Multi-tab code viewer with syntax highlighting, line-state
// tracking (success/failed/executing), edit mode, and GitHub file browser.
'use client';

import { useEffect, useRef, useState } from 'react';
import { BROWSER_ROOT_DIRS, isPathAllowed, isPathEditable } from './allowedPaths';

// ── Types ────────────────────────────────────────────────────────────────────

export type LineState = 'success' | 'failed' | 'executing';

export interface CodeFile {
  path: string;
  content: string;
  language: string;
  highlightedLines?: number[];
  /** Per-line execution state from trace events */
  lineStates?: Map<number, LineState>;
}

interface CodeViewerProps {
  files: CodeFile[];
  activeFileIndex: number;
  activeLine?: number;
  readOnly: boolean;
  /** Current branch for the file browser */
  branch?: string;
  onFileSelect?: (index: number) => void;
  onSave?: (file: CodeFile) => void;
  onContentChange?: (index: number, content: string) => void;
  /** Called when user wants to open a file from the file browser */
  onOpenFile?: (path: string) => void;
}

// ── Lightweight syntax tokens ────────────────────────────────────────────────

const TS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'void', 'throw', 'try', 'catch', 'finally', 'class',
  'extends', 'implements', 'interface', 'type', 'enum', 'import', 'export',
  'from', 'default', 'as', 'async', 'await', 'yield', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'this', 'super',
]);

function highlightSyntax(line: string): string {
  let escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (/^\s*\/\//.test(escaped)) {
    return `<span class="cv-comment">${escaped}</span>`;
  }

  // Tokenize: split into strings and non-string segments
  const parts: string[] = [];
  const stringRe = /(['"`])(?:(?!\1|\\).|\\.)*?\1/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = stringRe.exec(escaped)) !== null) {
    if (match.index > lastIndex) {
      parts.push(highlightNonString(escaped.slice(lastIndex, match.index)));
    }
    parts.push(`<span class="cv-string">${match[0]}</span>`);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < escaped.length) {
    parts.push(highlightNonString(escaped.slice(lastIndex)));
  }
  return parts.join('');
}

function highlightNonString(text: string): string {
  let result = text.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    (m) => TS_KEYWORDS.has(m) ? `<span class="cv-keyword">${m}</span>` : m
  );
  result = result.replace(
    /\b(\d+\.?\d*)\b/g,
    (m) => `<span class="cv-number">${m}</span>`
  );
  return result;
}

// ── File Browser (mini tree for browsing GitHub files) ───────────────────────

interface FileBrowserEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

function FileBrowser({ branch, onOpenFile }: { branch: string; onOpenFile: (path: string) => void }) {
  // '' = show the STARR RECON root directory listing (curated)
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load directory contents whenever the path or branch changes
  useEffect(() => {
    // Root view: show the curated STARR RECON directory listing
    if (!currentPath) {
      setEntries(BROWSER_ROOT_DIRS.map((d) => ({
        name: d.name,
        path: d.path,
        type: 'dir' as const,
      })));
      setLoading(false);
      setError(null);
      return;
    }

    // Only allow navigating into allowed directories
    if (!isPathAllowed(currentPath + '/') && !isPathAllowed(currentPath)) {
      setError(`Access restricted: ${currentPath}`);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/research/testing/files?path=${encodeURIComponent(currentPath)}&branch=${encodeURIComponent(branch)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.type === 'dir' && Array.isArray(data.files)) {
            const sorted = (data.files as FileBrowserEntry[]).sort((a, b) => {
              if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            setEntries(sorted);
          } else {
            setError(`Not a directory: ${currentPath}`);
          }
        } else {
          setError(`Could not load: ${currentPath}`);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load files');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [currentPath, branch]);

  const handleClick = (entry: FileBrowserEntry) => {
    if (entry.type === 'dir') {
      setCurrentPath(entry.path);
    } else if (entry.name.match(/\.(ts|tsx|js|jsx|json|css|md)$/)) {
      onOpenFile(entry.path);
    }
  };

  const navigateUp = () => {
    if (!currentPath) return;
    const parent = currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '';
    // If parent is not in allowed paths, go back to root
    if (!parent || (!isPathAllowed(parent + '/') && !isPathAllowed(parent))) {
      setCurrentPath('');
    } else {
      setCurrentPath(parent);
    }
  };

  return (
    <div className="code-viewer__browser">
      <div className="code-viewer__browser-header">
        <span className="code-viewer__browser-title">STARR RECON Files</span>
        <span className="code-viewer__browser-branch">{branch}</span>
      </div>
      <div className="code-viewer__browser-path">
        {currentPath !== '' && (
          <button className="code-viewer__browser-up" onClick={navigateUp} title="Go up">
            ..
          </button>
        )}
        <span className="code-viewer__browser-current">{currentPath || 'STARR RECON'}</span>
      </div>
      {loading && <div className="code-viewer__browser-loading">Loading...</div>}
      {error && <div className="code-viewer__browser-error">{error}</div>}
      <div className="code-viewer__browser-list">
        {entries.map((entry) => (
          <button
            key={entry.path}
            className={`code-viewer__browser-entry code-viewer__browser-entry--${entry.type}`}
            onClick={() => handleClick(entry)}
            title={entry.path}
          >
            <span className="code-viewer__browser-icon">
              {entry.type === 'dir' ? '📁' : '📄'}
            </span>
            {entry.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CodeViewer({
  files,
  activeFileIndex,
  activeLine,
  readOnly,
  branch = 'main',
  onFileSelect,
  onSave,
  onContentChange,
  onOpenFile,
}: CodeViewerProps) {
  const codeRef = useRef<HTMLDivElement>(null);
  const safeIndex = Math.min(Math.max(0, activeFileIndex), Math.max(0, files.length - 1));
  const activeFile = files[safeIndex];
  const [editContent, setEditContent] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  // Force read-only for files outside the editable STARR RECON scope
  const effectiveReadOnly = readOnly || (activeFile ? !isPathEditable(activeFile.path) : true);

  useEffect(() => {
    if (activeFile) setEditContent(activeFile.content);
  }, [activeFile]);

  useEffect(() => {
    if (!activeLine || !codeRef.current) return;
    const lineEl = codeRef.current.querySelector(`[data-line="${activeLine}"]`);
    if (lineEl) {
      lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLine]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    onContentChange?.(activeFileIndex, e.target.value);
  }, [activeFileIndex, onContentChange]);

  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (activeFile && onSave) {
        onSave({ ...activeFile, content: editContent });
      }
    }
  }, [activeFile, editContent, onSave]);

  if (files.length === 0 || !activeFile) {
    return (
      <div className="code-viewer code-viewer--empty">
        <div className="code-viewer__placeholder">
          {onOpenFile ? (
            <>
              <p>No code trace available.</p>
              <button
                className="code-viewer__browse-btn"
                onClick={() => setShowBrowser(!showBrowser)}
              >
                Browse Files
              </button>
              {showBrowser && (
                <FileBrowser branch={branch} onOpenFile={onOpenFile} />
              )}
            </>
          ) : (
            'No code trace available. Run a test to see live execution.'
          )}
        </div>
      </div>
    );
  }

  const lines = (effectiveReadOnly ? activeFile.content : editContent).split('\n');
  const highlighted = activeFile.highlightedLines
    ? new Set(activeFile.highlightedLines)
    : new Set<number>();
  const lineStates = activeFile.lineStates || new Map<number, LineState>();

  return (
    <div className="code-viewer">
      {/* Tab bar + file browser toggle */}
      <div className="code-viewer__tabs">
        {files.map((f, i) => (
          <button
            key={f.path}
            className={`code-viewer__tab ${i === safeIndex ? 'code-viewer__tab--active' : ''}`}
            onClick={() => onFileSelect?.(i)}
            title={f.path}
          >
            {f.path.split('/').pop()}
          </button>
        ))}
        {onOpenFile && (
          <button
            className={`code-viewer__tab code-viewer__tab--browse ${showBrowser ? 'code-viewer__tab--active' : ''}`}
            onClick={() => setShowBrowser(!showBrowser)}
            title="Browse repository files"
          >
            + Browse
          </button>
        )}
      </div>

      {/* File browser panel */}
      {showBrowser && onOpenFile && (
        <FileBrowser branch={branch} onOpenFile={(path) => {
          onOpenFile(path);
          setShowBrowser(false);
        }} />
      )}

      {/* File path + status bar */}
      <div className="code-viewer__filepath">
        <span className="code-viewer__filepath-text">{activeFile.path}</span>
        {!effectiveReadOnly && <span className="code-viewer__edit-badge">EDIT MODE</span>}
        {effectiveReadOnly && activeLine && (
          <span className="code-viewer__line-badge">Line {activeLine}</span>
        )}
        {lineStates.size > 0 && (
          <span className="code-viewer__trace-stats">
            <span className="code-viewer__trace-stat code-viewer__trace-stat--success">
              {[...lineStates.values()].filter((s) => s === 'success').length} ok
            </span>
            <span className="code-viewer__trace-stat code-viewer__trace-stat--failed">
              {[...lineStates.values()].filter((s) => s === 'failed').length} fail
            </span>
          </span>
        )}
      </div>

      {/* Code area */}
      <div className="code-viewer__content" ref={codeRef}>
        {effectiveReadOnly ? (
          <div className="code-viewer__lines">
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isActive = lineNum === activeLine;
              const isHighlighted = highlighted.has(lineNum);
              const state = lineStates.get(lineNum);
              return (
                <div
                  key={i}
                  data-line={lineNum}
                  className={[
                    'code-viewer__line',
                    isActive ? 'code-viewer__line--active' : '',
                    isHighlighted ? 'code-viewer__line--highlighted' : '',
                    state === 'success' ? 'code-viewer__line--success' : '',
                    state === 'failed' ? 'code-viewer__line--failed' : '',
                    state === 'executing' ? 'code-viewer__line--executing' : '',
                  ].join(' ')}
                >
                  <span className="code-viewer__line-number">{lineNum}</span>
                  <span
                    className="code-viewer__line-code"
                    dangerouslySetInnerHTML={{ __html: highlightSyntax(line) }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="code-viewer__editor-wrap">
            <div className="code-viewer__line-numbers">
              {lines.map((_, i) => (
                <div key={i} className="code-viewer__line-number">{i + 1}</div>
              ))}
            </div>
            <textarea
              className="code-viewer__textarea"
              value={editContent}
              onChange={handleTextChange}
              onKeyDown={handleTextareaKeyDown}
              spellCheck={false}
              wrap="off"
            />
          </div>
        )}
      </div>

      {/* Save bar (edit mode) */}
      {!effectiveReadOnly && onSave && (
        <div className="code-viewer__save-bar">
          <span className="code-viewer__save-hint">Ctrl+S to save to {branch}</span>
          <button
            className="code-viewer__save-btn"
            onClick={() => onSave({ ...activeFile, content: editContent })}
          >
            Save &amp; Push
          </button>
        </div>
      )}
    </div>
  );
}
