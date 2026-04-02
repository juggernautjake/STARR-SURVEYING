// CodeViewer.tsx — Multi-tab code viewer with syntax highlighting and edit mode
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CodeFile {
  path: string;
  content: string;
  language: string;
  highlightedLines?: number[];
}

interface CodeViewerProps {
  files: CodeFile[];
  activeFileIndex: number;
  activeLine?: number;
  readOnly: boolean;
  onFileSelect?: (index: number) => void;
  onSave?: (file: CodeFile) => void;
  onContentChange?: (index: number, content: string) => void;
}

// ── Lightweight syntax tokens ────────────────────────────────────────────────
// Not a full parser — just enough to color keywords, strings, comments.

const TS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof',
  'instanceof', 'void', 'throw', 'try', 'catch', 'finally', 'class',
  'extends', 'implements', 'interface', 'type', 'enum', 'import', 'export',
  'from', 'default', 'as', 'async', 'await', 'yield', 'of', 'in',
  'true', 'false', 'null', 'undefined', 'this', 'super',
]);

function highlightLine(line: string): string {
  // Escape HTML first
  let escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Comments (single-line)
  if (/^\s*\/\//.test(escaped)) {
    return `<span class="cv-comment">${escaped}</span>`;
  }

  // Strings
  escaped = escaped.replace(
    /(['"`])(?:(?!\1|\\).|\\.)*?\1/g,
    (m) => `<span class="cv-string">${m}</span>`
  );

  // Keywords
  escaped = escaped.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g,
    (m) => TS_KEYWORDS.has(m) ? `<span class="cv-keyword">${m}</span>` : m
  );

  // Numbers
  escaped = escaped.replace(
    /\b(\d+\.?\d*)\b/g,
    (m) => `<span class="cv-number">${m}</span>`
  );

  return escaped;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CodeViewer({
  files,
  activeFileIndex,
  activeLine,
  readOnly,
  onFileSelect,
  onSave,
  onContentChange,
}: CodeViewerProps) {
  const codeRef = useRef<HTMLDivElement>(null);
  const activeFile = files[activeFileIndex];
  const [editContent, setEditContent] = useState('');

  // Sync edit content when file changes
  useEffect(() => {
    if (activeFile) setEditContent(activeFile.content);
  }, [activeFile]);

  // Auto-scroll to active line
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

  // Ctrl+S save — scoped to the textarea so it only fires when the user is
  // actually typing in the editor, not when pressing Ctrl+S anywhere on the page.
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (activeFile && onSave) {
        onSave({ ...activeFile, content: editContent });
      }
    }
  }, [activeFile, editContent, onSave]);

  if (files.length === 0) {
    return (
      <div className="code-viewer code-viewer--empty">
        <div className="code-viewer__placeholder">
          No code trace available. Run a test to see live execution.
        </div>
      </div>
    );
  }

  const lines = (readOnly ? activeFile.content : editContent).split('\n');
  const highlighted = activeFile.highlightedLines
    ? new Set(activeFile.highlightedLines)
    : new Set<number>();

  return (
    <div className="code-viewer">
      {/* Tab bar */}
      {files.length > 1 && (
        <div className="code-viewer__tabs">
          {files.map((f, i) => (
            <button
              key={f.path}
              className={`code-viewer__tab ${i === activeFileIndex ? 'code-viewer__tab--active' : ''}`}
              onClick={() => onFileSelect?.(i)}
              title={f.path}
            >
              {f.path.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* File path */}
      <div className="code-viewer__filepath">
        {activeFile.path}
        {!readOnly && <span className="code-viewer__edit-badge">EDIT MODE</span>}
        {readOnly && activeLine && (
          <span className="code-viewer__line-badge">Line {activeLine}</span>
        )}
      </div>

      {/* Code area */}
      <div className="code-viewer__content" ref={codeRef}>
        {readOnly ? (
          <div className="code-viewer__lines">
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isActive = lineNum === activeLine;
              const isHighlighted = highlighted.has(lineNum);
              return (
                <div
                  key={i}
                  data-line={lineNum}
                  className={[
                    'code-viewer__line',
                    isActive ? 'code-viewer__line--active' : '',
                    isHighlighted ? 'code-viewer__line--highlighted' : '',
                  ].join(' ')}
                >
                  <span className="code-viewer__line-number">{lineNum}</span>
                  <span
                    className="code-viewer__line-code"
                    dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="code-viewer__editor-wrap">
            {/* Line numbers overlay */}
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
      {!readOnly && onSave && (
        <div className="code-viewer__save-bar">
          <span className="code-viewer__save-hint">Ctrl+S to save</span>
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
