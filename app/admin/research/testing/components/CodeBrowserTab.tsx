// CodeBrowserTab.tsx — Standalone code browser/editor tab for the Testing Lab.
// Browse, view, edit, and push files to any branch without running a test.
'use client';

import { useCallback, useState } from 'react';
import CodeViewer, { type CodeFile } from './CodeViewer';
import { usePropertyContext } from './PropertyContextBar';

export default function CodeBrowserTab() {
  const { context } = usePropertyContext();
  const branch = context.branch || 'main';

  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(
        `/api/admin/research/testing/files?path=${encodeURIComponent(filePath)}&branch=${encodeURIComponent(branch)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.type === 'file' && data.content) {
          const ext = filePath.split('.').pop() || '';
          const lang = ['ts', 'tsx'].includes(ext) ? 'typescript' : 'javascript';
          setFiles((prev) => {
            const existing = prev.findIndex((f) => f.path === filePath);
            if (existing >= 0) {
              setActiveFileIndex(existing);
              // Refresh content in case the branch changed
              const updated = [...prev];
              updated[existing] = { ...updated[existing], content: data.content };
              return updated;
            }
            setActiveFileIndex(prev.length);
            return [...prev, { path: filePath, content: data.content, language: lang }];
          });
        }
      }
    } catch {
      // non-fatal
    }
  }, [branch]);

  const handleSaveFile = useCallback(async (file: CodeFile) => {
    setSaveStatus(null);
    try {
      const res = await fetch('/api/admin/research/testing/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch,
          path: file.path,
          content: file.content,
          message: `Edit ${file.path.split('/').pop()} from Testing Lab`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus({ ok: true, message: `Pushed to ${branch} — commit ${data.commit?.slice(0, 7)}` });
      } else {
        setSaveStatus({ ok: false, message: data.error || 'Push failed' });
      }
    } catch (err) {
      setSaveStatus({ ok: false, message: err instanceof Error ? err.message : 'Network error' });
    }
    setTimeout(() => setSaveStatus(null), 5000);
  }, [branch]);

  return (
    <div className="code-browser-tab">
      <div className="code-browser-tab__header">
        <div>
          <h4 className="code-browser-tab__title">STARR RECON Code</h4>
          <p className="code-browser-tab__scope">
            Research &amp; analysis code only — scrapers, adapters, counties, AI, pipeline
          </p>
        </div>
        <span className="code-browser-tab__branch">Branch: {branch}</span>
      </div>

      {saveStatus && (
        <div className={`code-browser-tab__save-status ${saveStatus.ok ? 'code-browser-tab__save-status--ok' : 'code-browser-tab__save-status--err'}`}>
          {saveStatus.ok ? '✓' : '✕'} {saveStatus.message}
        </div>
      )}

      <div className="code-browser-tab__viewer">
        <CodeViewer
          files={files}
          activeFileIndex={activeFileIndex}
          readOnly={false}
          branch={branch}
          onFileSelect={setActiveFileIndex}
          onSave={handleSaveFile}
          onOpenFile={handleOpenFile}
        />
      </div>
    </div>
  );
}
