// OutputViewer.tsx — JSON tree viewer + screenshot gallery + error display
'use client';

import { useState } from 'react';

interface OutputViewerProps {
  result: unknown;
  screenshots?: string[];
  error?: string;
  duration?: number;
}

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (data === null || data === undefined) {
    return <span className="output-viewer__null">{String(data)}</span>;
  }

  if (typeof data === 'string') {
    if (data.length > 200) {
      return <span className="output-viewer__string" title={data}>&quot;{data.slice(0, 200)}...&quot;</span>;
    }
    return <span className="output-viewer__string">&quot;{data}&quot;</span>;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span className="output-viewer__primitive">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="output-viewer__bracket">[]</span>;
    return (
      <span>
        <span
          className="output-viewer__toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
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
                <JsonTree data={item} depth={depth + 1} />
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
        <span
          className="output-viewer__toggle"
          onClick={() => setCollapsed(!collapsed)}
        >
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
                <JsonTree data={val} depth={depth + 1} />
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

export default function OutputViewer({ result, screenshots, error, duration }: OutputViewerProps) {
  const [activeTab, setActiveTab] = useState<'json' | 'raw' | 'screenshots'>('json');

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
            <JsonTree data={result} />
          </pre>
        )}
        {activeTab === 'raw' && (
          <pre className="output-viewer__raw">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
        {activeTab === 'screenshots' && screenshots && (
          <div className="output-viewer__screenshots">
            {screenshots.map((url, i) => (
              <div key={i} className="output-viewer__screenshot">
                <img src={url} alt={`Screenshot ${i + 1}`} loading="lazy" />
              </div>
            ))}
          </div>
        )}
        {!result && !error && (
          <div className="output-viewer__empty">No output yet. Run the test to see results.</div>
        )}
      </div>
    </div>
  );
}
