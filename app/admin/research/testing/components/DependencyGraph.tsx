// DependencyGraph.tsx — Worker source file dependency visualizer
'use client';

import { useEffect, useState } from 'react';

interface FileNode {
  path: string;
  exports: string[];
  imports: string[];
}

interface ImportEdge {
  from: string;
  to: string;
  symbols: string[];
}

interface DependencyData {
  files: FileNode[];
  imports: ImportEdge[];
}

interface DependencyGraphProps {
  selectedFile?: string;
  onFileClick?: (path: string) => void;
}

export default function DependencyGraph({ selectedFile, onFileClick }: DependencyGraphProps) {
  const [data, setData] = useState<DependencyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | undefined>(selectedFile);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setActive(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/research/testing/dependencies', { method: 'POST' })
      .then((r) => r.json())
      .then((d: DependencyData) => setData(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const activeNode = data?.files.find((f) => f.path === active);
  const importedBy = active
    ? (data?.imports.filter((e) => e.to === active || e.to === active + '.ts') ?? [])
    : [];

  const filteredFiles = data?.files.filter((f) =>
    f.path.toLowerCase().includes(search.toLowerCase()),
  ) ?? [];

  const handleFileSelect = (p: string) => {
    setActive(p);
    onFileClick?.(p);
  };

  return (
    <div className="testing-lab__dep-graph">
      <div className="testing-lab__dep-graph__left">
        <div className="testing-lab__dep-graph__search-wrap">
          <input
            className="testing-lab__dep-graph__search"
            type="text"
            placeholder="Filter files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading && <div className="testing-lab__dep-graph__loading">Loading dependency graph…</div>}
        {error && <div className="testing-lab__dep-graph__error">{error}</div>}
        <ul className="testing-lab__dep-graph__file-list">
          {filteredFiles.map((f) => (
            <li
              key={f.path}
              className={`testing-lab__dep-graph__file-item ${f.path === active ? 'testing-lab__dep-graph__file-item--active' : ''}`}
              onClick={() => handleFileSelect(f.path)}
              title={f.path}
            >
              {f.path.split('/').pop()}
              <span className="testing-lab__dep-graph__file-dir">
                {f.path.includes('/') ? f.path.split('/').slice(0, -1).join('/') : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="testing-lab__dep-graph__right">
        {!active && (
          <div className="testing-lab__dep-graph__placeholder">
            Select a file to see its dependencies
          </div>
        )}
        {active && activeNode && (
          <>
            <h3 className="testing-lab__dep-graph__file-title">{active}</h3>

            <section className="testing-lab__dep-graph__section">
              <h4 className="testing-lab__dep-graph__section-title">
                Imports from ({activeNode.imports.length})
              </h4>
              {activeNode.imports.length === 0 ? (
                <span className="testing-lab__dep-graph__empty">None</span>
              ) : (
                <ul className="testing-lab__dep-graph__link-list">
                  {activeNode.imports.map((imp) => (
                    <li key={imp}>
                      <button
                        className="testing-lab__dep-graph__link"
                        onClick={() => handleFileSelect(imp)}
                      >
                        {imp}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="testing-lab__dep-graph__section">
              <h4 className="testing-lab__dep-graph__section-title">
                Imported by ({importedBy.length})
              </h4>
              {importedBy.length === 0 ? (
                <span className="testing-lab__dep-graph__empty">None</span>
              ) : (
                <ul className="testing-lab__dep-graph__link-list">
                  {importedBy.map((e) => (
                    <li key={e.from}>
                      <button
                        className="testing-lab__dep-graph__link"
                        onClick={() => handleFileSelect(e.from)}
                      >
                        {e.from}
                      </button>
                      {e.symbols.length > 0 && (
                        <span className="testing-lab__dep-graph__symbols">
                          {' — '}{e.symbols.join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="testing-lab__dep-graph__section">
              <h4 className="testing-lab__dep-graph__section-title">
                Exports ({activeNode.exports.length})
              </h4>
              {activeNode.exports.length === 0 ? (
                <span className="testing-lab__dep-graph__empty">None</span>
              ) : (
                <ul className="testing-lab__dep-graph__export-list">
                  {activeNode.exports.map((ex) => (
                    <li key={ex} className="testing-lab__dep-graph__export-item">
                      <code>{ex}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
