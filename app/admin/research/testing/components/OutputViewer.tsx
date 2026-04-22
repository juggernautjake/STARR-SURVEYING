// OutputViewer.tsx — JSON tree viewer + screenshot gallery + error display
'use client';

import { useEffect, useRef, useState } from 'react';

// ── Context menu helpers ──────────────────────────────────────────────────────

interface CtxMenu {
  x: number;
  y: number;
  items: { label: string; onClick: () => void }[];
}

function ContextMenu({ menu, onClose }: { menu: CtxMenu; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="output-viewer__ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          className="output-viewer__ctx-menu-item"
          role="menuitem"
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ── AI analysis modal ─────────────────────────────────────────────────────────

interface AIModalProps {
  title: string;
  analysis: string;
  loading: boolean;
  onClose: () => void;
}

function AIModal({ title, analysis, loading, onClose }: AIModalProps) {
  return (
    <div className="output-viewer__ai-modal-backdrop" onClick={onClose}>
      <div className="output-viewer__ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="output-viewer__ai-modal-header">
          <span>{title}</span>
          <button className="output-viewer__ai-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="output-viewer__ai-modal-body">
          {loading ? (
            <span className="output-viewer__ai-loading">Analyzing…</span>
          ) : (
            <pre className="output-viewer__ai-result">{analysis}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI call helper ────────────────────────────────────────────────────────────

async function callAiAnalyze(
  type: 'ocr' | 'classify' | 'explain' | 'validate',
  content: string,
  context?: string,
): Promise<string> {
  const res = await fetch('/api/admin/research/testing/ai-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content, context }),
  });
  const data = (await res.json()) as { analysis: string };
  return data.analysis;
}

// ── OutputViewer types / props ────────────────────────────────────────────────

interface OutputViewerProps {
  result: unknown;
  screenshots?: string[];
  error?: string;
  duration?: number;
}

// ── JsonTree ──────────────────────────────────────────────────────────────────

function JsonTree({
  data,
  depth = 0,
  path = '',
  onContextMenu,
}: {
  data: unknown;
  depth?: number;
  path?: string;
  onContextMenu?: (e: React.MouseEvent, value: unknown, jsonPath: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (data === null || data === undefined) {
    return (
      <span
        className="output-viewer__null"
        onContextMenu={(e) => onContextMenu?.(e, data, path)}
      >
        {String(data)}
      </span>
    );
  }

  if (typeof data === 'string') {
    return (
      <span
        className="output-viewer__string"
        title={data.length > 200 ? data : undefined}
        onContextMenu={(e) => onContextMenu?.(e, data, path)}
      >
        &quot;{data.length > 200 ? data.slice(0, 200) + '...' : data}&quot;
      </span>
    );
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return (
      <span
        className="output-viewer__primitive"
        onContextMenu={(e) => onContextMenu?.(e, data, path)}
      >
        {String(data)}
      </span>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="output-viewer__bracket">[]</span>;
    return (
      <span>
        <span className="output-viewer__toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="output-viewer__bracket">[</span>
        {collapsed ? (
          <span className="output-viewer__collapsed" onClick={() => setCollapsed(false)}>
            {data.length} items
          </span>
        ) : (
          <div className="output-viewer__indent">
            {data.map((item, i) => (
              <div key={i} className="output-viewer__item">
                <span className="output-viewer__index">{i}: </span>
                <JsonTree
                  data={item}
                  depth={depth + 1}
                  path={`${path}[${i}]`}
                  onContextMenu={onContextMenu}
                />
                {i < data.length - 1 && ','}
              </div>
            ))}
          </div>
        )}
        <span className="output-viewer__bracket">]</span>
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="output-viewer__bracket">{'{}'}</span>;
    return (
      <span>
        <span className="output-viewer__toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▸' : '▾'}
        </span>
        <span className="output-viewer__bracket">{'{'}</span>
        {collapsed ? (
          <span className="output-viewer__collapsed" onClick={() => setCollapsed(false)}>
            {entries.length} keys
          </span>
        ) : (
          <div className="output-viewer__indent">
            {entries.map(([key, val], i) => (
              <div key={key} className="output-viewer__item">
                <span className="output-viewer__key">{key}</span>
                <span className="output-viewer__colon">: </span>
                <JsonTree
                  data={val}
                  depth={depth + 1}
                  path={path ? `${path}.${key}` : key}
                  onContextMenu={onContextMenu}
                />
                {i < entries.length - 1 && ','}
              </div>
            ))}
          </div>
        )}
        <span className="output-viewer__bracket">{'}'}</span>
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

// ── ScreenshotItem ────────────────────────────────────────────────────────────

function ScreenshotItem({
  url,
  index,
  onContextMenu,
}: {
  url: string;
  index: number;
  onContextMenu?: (e: React.MouseEvent, url: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="output-viewer__screenshot">
        <div className="output-viewer__img-error">
          Failed to load: {url.split('/').pop() || `screenshot ${index + 1}`}
        </div>
      </div>
    );
  }
  return (
    <div className="output-viewer__screenshot">
      <img
        src={url}
        alt={`Screenshot ${index + 1}`}
        loading="lazy"
        onError={() => setFailed(true)}
        onContextMenu={(e) => onContextMenu?.(e, url)}
      />
    </div>
  );
}

// ── Main OutputViewer ─────────────────────────────────────────────────────────

export default function OutputViewer({ result, screenshots, error, duration }: OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<'json' | 'raw' | 'screenshots'>('json');
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [aiModal, setAiModal] = useState<{ title: string; analysis: string; loading: boolean } | null>(null);

  const closeCtxMenu = () => setCtxMenu(null);

  const showAi = (title: string) => {
    setAiModal({ title, analysis: '', loading: true });
  };

  const handleScreenshotCtx = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Download PNG',
          onClick: () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = url.split('/').pop() || 'screenshot.png';
            a.click();
          },
        },
        {
          label: 'AI OCR Analysis',
          onClick: async () => {
            showAi('OCR Analysis');
            const analysis = await callAiAnalyze('ocr', url).catch((err: unknown) =>
              err instanceof Error ? err.message : 'Failed',
            );
            setAiModal({ title: 'OCR Analysis', analysis, loading: false });
          },
        },
        {
          label: 'AI Classification',
          onClick: async () => {
            showAi('AI Classification');
            const analysis = await callAiAnalyze('classify', url).catch((err: unknown) =>
              err instanceof Error ? err.message : 'Failed',
            );
            setAiModal({ title: 'AI Classification', analysis, loading: false });
          },
        },
        {
          label: 'Copy to Clipboard',
          onClick: () => {
            navigator.clipboard.writeText(url).catch(() => undefined);
          },
        },
      ],
    });
  };

  const handleJsonCtx = (e: React.MouseEvent, value: unknown, jsonPath: string) => {
    e.preventDefault();
    const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: 'Copy Value',
          onClick: () => { navigator.clipboard.writeText(stringVal).catch(() => undefined); },
        },
        {
          label: 'Copy Path',
          onClick: () => { navigator.clipboard.writeText(jsonPath).catch(() => undefined); },
        },
        {
          label: 'AI Explain',
          onClick: async () => {
            showAi('AI Explanation');
            const analysis = await callAiAnalyze('explain', stringVal, `JSON path: ${jsonPath}`).catch(
              (err: unknown) => (err instanceof Error ? err.message : 'Failed'),
            );
            setAiModal({ title: 'AI Explanation', analysis, loading: false });
          },
        },
      ],
    });
  };

  return (
    <div className="output-viewer">
      {/* Header with tabs */}
      <div className="output-viewer__header">
        <div className="output-viewer__tabs">
          <button
            className={`output-viewer__tab ${activeTab === 'json' ? 'output-viewer__tab--active' : ''}`}
            onClick={() => setActiveTab('json')}
          >
            JSON Tree
          </button>
          <button
            className={`output-viewer__tab ${activeTab === 'raw' ? 'output-viewer__tab--active' : ''}`}
            onClick={() => setActiveTab('raw')}
          >
            Raw
          </button>
          {screenshots && screenshots.length > 0 && (
            <button
              className={`output-viewer__tab ${activeTab === 'screenshots' ? 'output-viewer__tab--active' : ''}`}
              onClick={() => setActiveTab('screenshots')}
            >
              Screenshots ({screenshots.length})
            </button>
          )}
        </div>
        {duration !== undefined && (
          <span className="output-viewer__duration">{(duration / 1000).toFixed(2)}s</span>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="output-viewer__error">
          <span className="output-viewer__error-icon">✕</span>
          {error}
        </div>
      )}

      {/* Content */}
      <div className="output-viewer__content">
        {activeTab === 'json' && result !== undefined && (
          <pre className="output-viewer__json">
            <JsonTree data={result} onContextMenu={handleJsonCtx} />
          </pre>
        )}
        {activeTab === 'raw' && (
          <pre className="output-viewer__raw">
            {(() => {
              try {
                return JSON.stringify(result, null, 2);
              } catch {
                return '[Unserializable result — contains circular references or non-JSON values]';
              }
            })()}
          </pre>
        )}
        {activeTab === 'screenshots' && screenshots && (
          <div className="output-viewer__screenshots">
            {screenshots.map((url, i) => (
              <ScreenshotItem key={i} url={url} index={i} onContextMenu={handleScreenshotCtx} />
            ))}
          </div>
        )}
        {!result && !error && (
          <div className="output-viewer__empty">No output yet. Run the test to see results.</div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtxMenu} />}

      {/* AI analysis modal */}
      {aiModal && (
        <AIModal
          title={aiModal.title}
          analysis={aiModal.analysis}
          loading={aiModal.loading}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  );
}
