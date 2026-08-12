'use client';
// app/admin/components/files/FilePicker.tsx — pick a place, or a file, from the file explorer. F5.
//
// Owner: *"It should be totally linked to every page on the backend so that we can manage and save
// and retrieve all docs and info from the built in file explorer."*
//
// ── ONE PICKER, NOT A PICKER PER FEATURE ────────────────────────────────────────────────────────
//
// The thing that makes "linked to every page" true is a single component every page can open — one
// that browses the same tree, searches the same index, and honours the same permissions as
// `/admin/files` itself, because it calls the same two endpoints. A second implementation would
// drift from the explorer the first time either changed, and the drift would show up as a folder
// somebody can see in one place and not the other.
//
// ── WHAT IT RETURNS ─────────────────────────────────────────────────────────────────────────────
//
// A node id and its name. Nothing else: the caller decides what that means. `mode="folder"` picks a
// destination (move, copy, upload-into); `mode="file"` picks a document. Keeping the component
// ignorant of the caller's intent is what lets the same one serve both.
//
// ── PERMISSIONS ARE NOT RE-IMPLEMENTED HERE ─────────────────────────────────────────────────────
//
// The list endpoint already returns only what the caller may see, with each node's effective access
// on it. This filters for *usability* — a folder you can only view is not somewhere you can move a
// file INTO — and never for visibility. Re-deriving visibility client-side would be a second
// permission model, which is the mistake `describeAudience` was written to avoid.

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Folder, FileText, Home, Loader2, Search, X } from 'lucide-react';

export interface PickedNode {
  id: string;
  name: string;
}

interface PickerNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  access: 'none' | 'view' | 'download' | 'edit' | 'manage';
  path?: string;
}

interface FilePickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (node: PickedNode) => void;
  /** `folder` → choosing a destination. `file` → choosing a document. */
  mode?: 'folder' | 'file';
  title?: string;
  /** Confirm-button wording, e.g. "Move here". */
  actionLabel?: string;
  /** Ids that must not be selectable — a folder cannot be moved into itself or its own child. */
  excludeIds?: string[];
}

const rank = (a: PickerNode['access']) => ['none', 'view', 'download', 'edit', 'manage'].indexOf(a);

export default function FilePicker({
  open,
  onClose,
  onPick,
  mode = 'folder',
  title,
  actionLabel,
  excludeIds = [],
}: FilePickerProps) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [nodes, setNodes] = useState<PickerNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PickerNode[] | null>(null);
  const [selected, setSelected] = useState<PickedNode | null>(null);

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files?parent=${pid ?? 'root'}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not open that folder.');
      setNodes(data.nodes ?? []);
      setCrumbs(data.breadcrumb ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that folder.');
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset every time it opens. A picker that remembers where it was last time is a picker that
  // drops somebody into a folder they have no memory of choosing.
  useEffect(() => {
    if (!open) return;
    setParentId(null);
    setQuery('');
    setHits(null);
    setSelected(null);
  }, [open]);

  useEffect(() => {
    if (open && hits === null) void load(parentId);
  }, [open, parentId, hits, load]);

  // Same debounce and same endpoint as the explorer's own search.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/files/search?q=${encodeURIComponent(term)}`);
          const data = await res.json();
          if (!cancelled) setHits(res.ok ? (data.hits ?? []) : []);
        } catch {
          if (!cancelled) setHits([]);
        }
      })();
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  if (!open) return null;

  const list = hits ?? nodes;
  const excluded = new Set(excludeIds);

  /** Usability, not visibility — see the header. Choosing a destination needs `edit`; choosing a
   *  document needs only that you can see it. */
  const selectable = (n: PickerNode): boolean => {
    if (excluded.has(n.id)) return false;
    if (mode === 'folder') return n.node_type === 'folder' && rank(n.access) >= rank('edit');
    return n.node_type === 'file';
  };

  const heading = title ?? (mode === 'folder' ? 'Choose a folder' : 'Choose a file');
  const confirm = actionLabel ?? (mode === 'folder' ? 'Use this folder' : 'Choose');

  // When picking a folder, the folder you are STANDING IN is a valid answer — that is what "move it
  // here" means. Reflected in the button so the interaction does not require finding your own
  // destination in its own list.
  const here: PickedNode | null =
    mode === 'folder' && hits === null && crumbs.length > 0
      ? { id: crumbs[crumbs.length - 1].id, name: crumbs[crumbs.length - 1].name }
      : null;
  const choice = selected ?? here;

  return (
    <div className="admin-dialog-overlay" onClick={onClose}>
      <div
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-dialog__head">
          <h3 className="admin-dialog__title">{heading}</h3>
          <p className="admin-dialog__subtitle">
            {mode === 'folder'
              ? 'Open a folder to go into it, or use the one you are in.'
              : 'Browse or search, then choose a file.'}
          </p>
        </div>

        <div className="admin-dialog__body">
          <div className="fp__search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all files…"
              aria-label="Search files"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : null}
          </div>

          {hits === null ? (
            <nav className="fp__crumbs" aria-label="Breadcrumb">
              <button type="button" onClick={() => setParentId(null)}>
                <Home size={13} /> Home
              </button>
              {crumbs.map((c) => (
                <span key={c.id}>
                  <ChevronRight size={12} aria-hidden />
                  <button type="button" onClick={() => setParentId(c.id)}>{c.name}</button>
                </span>
              ))}
            </nav>
          ) : null}

          {error ? <p className="fp__error" role="alert">{error}</p> : null}
          {loading ? (
            <p className="fp__muted"><Loader2 size={14} className="fp__spin" /> Loading…</p>
          ) : list.length === 0 ? (
            <p className="fp__muted">
              {hits !== null ? 'Nothing matches that search.' : 'This folder is empty.'}
            </p>
          ) : (
            <ul className="fp__list">
              {list.map((n) => {
                const canPick = selectable(n);
                const isFolder = n.node_type === 'folder';
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`fp__row${selected?.id === n.id ? ' fp__row--sel' : ''}`}
                      // A folder is always openable even when it cannot be the answer — you may
                      // need to pass THROUGH a folder you cannot write to.
                      disabled={!isFolder && !canPick}
                      onClick={() => {
                        if (isFolder && mode === 'folder') {
                          // Selecting and navigating are different intents on the same row, so a
                          // tap selects and the chevron opens. On a folder you cannot write to,
                          // a tap simply opens it.
                          if (canPick) setSelected({ id: n.id, name: n.name });
                          else { setHits(null); setQuery(''); setParentId(n.id); }
                        } else if (isFolder) {
                          setHits(null); setQuery(''); setParentId(n.id);
                        } else {
                          setSelected({ id: n.id, name: n.name });
                        }
                      }}
                    >
                      {isFolder ? <Folder size={16} /> : <FileText size={16} />}
                      <span className="fp__name">
                        {n.name}
                        {n.path ? <span className="fp__path">{n.path}</span> : null}
                      </span>
                      {isFolder ? (
                        <span
                          className="fp__open"
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${n.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHits(null); setQuery(''); setParentId(n.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.stopPropagation();
                              setHits(null); setQuery(''); setParentId(n.id);
                            }
                          }}
                        >
                          <ChevronRight size={16} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="admin-dialog__foot">
          <button type="button" className="fp__btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="fp__btn fp__btn--primary"
            disabled={!choice}
            onClick={() => { if (choice) { onPick(choice); onClose(); } }}
          >
            {choice ? `${confirm}: ${choice.name}` : confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
