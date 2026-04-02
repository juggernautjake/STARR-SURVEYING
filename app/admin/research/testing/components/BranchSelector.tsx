// BranchSelector.tsx — GitHub branch picker with multi-branch comparison
'use client';

import { useCallback, useEffect, useState } from 'react';

interface BranchSelectorProps {
  currentBranch: string;
  compareBranch: string | null;
  onBranchChange: (branch: string) => void;
  onCompareBranchChange: (branch: string | null) => void;
  onPull: (branch: string) => void;
  onCreateBranch: (name: string, from: string) => Promise<void>;
}

export default function BranchSelector({
  currentBranch,
  compareBranch,
  onBranchChange,
  onCompareBranchChange,
  onPull,
  onCreateBranch,
}: BranchSelectorProps) {
  const [branches, setBranches] = useState<string[]>(['main']);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [enableCompare, setEnableCompare] = useState(!!compareBranch);
  const [showMerge, setShowMerge] = useState(false);
  const [merging, setMerging] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [mergeMsg, setMergeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadBranches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/research/testing/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || ['main']);
      }
    } catch {
      // fall back to default
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await onCreateBranch(newBranchName.trim(), currentBranch);
      const createdName = newBranchName.trim();
      setShowCreate(false);
      setNewBranchName('');
      // Reload branch list then auto-switch to the new branch
      await loadBranches();
      onBranchChange(createdName);
    } catch {
      // onCreateBranch already shows a user-visible error banner via showBranchMsg
      // in the parent. Keep the create form open so the user can retry or edit.
    }
  };

  const handleCreatePR = async () => {
    if (!prTitle.trim() || currentBranch === 'main') return;
    setMerging(true);
    setMergeMsg(null);
    try {
      // Create a pull request via the GitHub API (through our branches route)
      const res = await fetch('/api/admin/research/testing/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-pr',
          head: currentBranch,
          base: 'main',
          title: prTitle.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.prUrl) {
        setMergeMsg({ ok: true, text: `PR created: ${data.prUrl}` });
        setPrTitle('');
        setShowMerge(false);
      } else {
        setMergeMsg({ ok: false, text: data.error || 'Failed to create PR' });
      }
    } catch (err) {
      setMergeMsg({ ok: false, text: err instanceof Error ? err.message : 'Network error' });
    }
    setMerging(false);
  };

  return (
    <div className="branch-selector">
      <div className="branch-selector__row">
        <div className="branch-selector__field">
          <label className="branch-selector__label">Branch</label>
          <select
            className="branch-selector__select"
            value={currentBranch}
            onChange={(e) => onBranchChange(e.target.value)}
            disabled={loading}
          >
            {/* Ensure the current branch always appears even if not yet loaded */}
            {!branches.includes(currentBranch) && (
              <option key={currentBranch} value={currentBranch}>{currentBranch}</option>
            )}
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
        <button
          className="branch-selector__btn"
          onClick={() => onPull(currentBranch)}
          title="Pull latest from remote"
        >
          Pull
        </button>
        <button
          className="branch-selector__btn"
          onClick={() => setShowCreate(!showCreate)}
          title="Create new branch"
        >
          + Branch
        </button>
        <button
          className="branch-selector__btn branch-selector__btn--refresh"
          onClick={loadBranches}
          disabled={loading}
          title="Refresh branch list"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Create branch inline */}
      {showCreate && (
        <div className="branch-selector__create">
          <input
            type="text"
            className="branch-selector__input"
            placeholder="new-branch-name"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
          />
          <span className="branch-selector__from">from {currentBranch}</span>
          <button className="branch-selector__btn" onClick={handleCreateBranch}>
            Create
          </button>
        </div>
      )}

      {/* Compare toggle */}
      <div className="branch-selector__compare">
        <label className="branch-selector__compare-toggle">
          <input
            type="checkbox"
            checked={enableCompare}
            onChange={(e) => {
              setEnableCompare(e.target.checked);
              if (!e.target.checked) onCompareBranchChange(null);
            }}
          />
          Side-by-side branch comparison
        </label>
        {enableCompare && (
          <div className="branch-selector__row" style={{ marginTop: '0.5rem' }}>
            <div className="branch-selector__field">
              <label className="branch-selector__label">Compare with</label>
              <select
                className="branch-selector__select"
                value={compareBranch || ''}
                onChange={(e) => onCompareBranchChange(e.target.value || null)}
              >
                <option value="">Select branch...</option>
                {branches.filter((b) => b !== currentBranch).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <button
              className="branch-selector__btn"
              onClick={() => compareBranch && onPull(compareBranch)}
              disabled={!compareBranch}
            >
              Pull
            </button>
          </div>
        )}
      </div>

      {/* Merge to main */}
      {currentBranch !== 'main' && (
        <div className="branch-selector__merge">
          <button
            className="branch-selector__btn branch-selector__btn--merge"
            onClick={() => setShowMerge(!showMerge)}
          >
            Merge to Main
          </button>
          {showMerge && (
            <div className="branch-selector__merge-form">
              <input
                type="text"
                className="branch-selector__input"
                placeholder="PR title (e.g. Fix CAD scraper timeout)"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePR()}
              />
              <span className="branch-selector__from">{currentBranch} → main</span>
              <button
                className="branch-selector__btn branch-selector__btn--merge-go"
                onClick={handleCreatePR}
                disabled={merging || !prTitle.trim()}
              >
                {merging ? 'Creating...' : 'Create PR'}
              </button>
            </div>
          )}
          {mergeMsg && (
            <div className={`branch-selector__merge-msg ${mergeMsg.ok ? 'branch-selector__merge-msg--ok' : 'branch-selector__merge-msg--err'}`}>
              {mergeMsg.ok ? '✓' : '✕'}{' '}
              {mergeMsg.ok && mergeMsg.text.startsWith('PR created:') ? (
                <>
                  PR created:{' '}
                  <a
                    href={mergeMsg.text.replace('PR created: ', '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="branch-selector__pr-link"
                  >
                    View on GitHub
                  </a>
                </>
              ) : (
                mergeMsg.text
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
