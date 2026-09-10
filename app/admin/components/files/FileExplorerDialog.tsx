'use client';
/**
 * FileExplorerDialog — THE file explorer pop-up, one for the whole site (owner, 2026-09-10).
 *
 * "We need to develop a modal/pop up that is used for navigating all of the files and projects and
 * information on the website … similar to the Windows file explorer … the left side navigation,
 * and then the main window with all of the folders and files … options for different size views
 * of the icons and previews, and search functionality … a single uniform website-wide version."
 *
 * Places on the left (My files, Shared files, Job Projects, Research Documents, Receipts, …), the
 * folder on the right with a breadcrumb, four views (large icons with previews, small icons, list,
 * details), search across everything, and a footer that does what the caller asked:
 *
 *   mode 'folder'  choose a folder — the viewer's SEND TO offers "Copy here" / "Move here", the
 *                  explorer's Move offers "Move here"; the caller decides which folders qualify
 *   mode 'file'    choose a file — attach a document from Files
 *
 * It reads what the explorer page reads (/api/admin/files, /api/admin/files/search) so it honours
 * the same permissions and shows the same tree, mounts included. It replaced FilePicker.tsx.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight, Folder, FolderOpen, FileText, Image as ImageIcon, Film, Music, Archive, Home, Loader2, Search, X,
  LayoutGrid, Grid2x2, List, Table2, BookOpenText, DraftingCompass, Receipt, Camera, Briefcase, FolderKanban, User, Users,
  ArrowUp, Check,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { fileKind } from '@/lib/files/viewer-model';
import { formatBytes, formatWhen } from './format';
import './FileExplorerDialog.css';

export type ExplorerAccess = 'none' | 'view' | 'download' | 'edit' | 'manage';

export interface ExplorerNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file';
  name: string;
  mime_type: string | null;
  size_bytes?: number | null;
  updated_at?: string | null;
  access: ExplorerAccess;
  is_personal_root?: boolean;
  is_system?: boolean;
  open_href?: string;
  folder_key?: string;
  blurb?: string;
  /** Set on search hits: where the node lives. */
  path?: string;
}

export interface ExplorerPick {
  id: string;
  name: string;
  /** The names down from Home, the picked node last. */
  trail: string[];
  node: ExplorerNode;
}

export interface ExplorerAction {
  key: string;
  label: string;
  primary?: boolean;
}

export interface FileExplorerDialogProps {
  open: boolean;
  onClose: () => void;
  /** 'folder' — choose a folder (the footer offers `actions`); 'file' — choose a file. */
  mode: 'folder' | 'file';
  title?: string;
  subtitle?: string;
  /** The footer's buttons in folder mode; default one "Use this folder". Each fires onPick(pick, key). */
  actions?: ExplorerAction[];
  onPick: (pick: ExplorerPick, actionKey: string) => void;
  /** Which nodes can be chosen. Default: folders you can edit (folder mode) / any file (file mode). */
  canChoose?: (node: ExplorerNode) => boolean;
  /** A line under the footer's buttons saying what qualifies — "A job file goes to a job or project folder". */
  hint?: string;
  /** Ids that must not be chosen — a folder cannot be moved into itself. */
  excludeIds?: string[];
  /** Open on this folder instead of Home. */
  startAt?: string | null;
}

type View = 'large' | 'small' | 'list' | 'details';

const rank = (a: ExplorerAccess) => ['none', 'view', 'download', 'edit', 'manage'].indexOf(a);
const VIEW_KEY = 'fxd-view';

function placeIcon(n: ExplorerNode, size = 16) {
  if (n.id === 'mnt:projects') return <FolderKanban size={size} aria-hidden="true" />;
  if (n.id === 'mnt:jobs') return <Briefcase size={size} aria-hidden="true" />;
  if (n.id === 'mnt:research') return <BookOpenText size={size} aria-hidden="true" />;
  if (n.id === 'mnt:drawings') return <DraftingCompass size={size} aria-hidden="true" />;
  if (n.id === 'mnt:receipts') return <Receipt size={size} aria-hidden="true" />;
  if (n.id === 'mnt:field-media') return <Camera size={size} aria-hidden="true" />;
  if (n.is_personal_root || /^personal$/i.test(n.name)) return <User size={size} aria-hidden="true" />;
  if (/^shared$/i.test(n.name)) return <Users size={size} aria-hidden="true" />;
  return <Folder size={size} aria-hidden="true" />;
}

/** The order the places are reached for: mine, shared, the projects, then the flat sources. */
function placeRank(n: ExplorerNode): number {
  if (n.is_personal_root) return 0;
  if (n.is_system && /^shared$/i.test(n.name)) return 1;
  if (n.id === 'mnt:projects') return 2;
  if (n.id === 'mnt:jobs') return 3;
  if (n.id === 'mnt:research') return 4;
  if (n.id === 'mnt:drawings') return 5;
  if (n.id === 'mnt:receipts') return 6;
  if (n.id === 'mnt:job-files') return 7;
  if (n.id === 'mnt:field-media') return 8;
  if (n.is_system && /^personal$/i.test(n.name)) return 9;
  return 10;
}

function placeLabel(n: ExplorerNode): string {
  if (n.is_personal_root) return 'My files';
  if (n.is_system && /^personal$/i.test(n.name)) return 'People\'s files';
  if (n.is_system && /^shared$/i.test(n.name)) return 'Shared files';
  return n.name;
}

function NodeIcon({ node, size = 16 }: { node: ExplorerNode; size?: number }) {
  if (node.node_type === 'folder') {
    switch (node.folder_key) {
      case 'research': return <BookOpenText size={size} aria-hidden="true" />;
      case 'cad': return <DraftingCompass size={size} aria-hidden="true" />;
      case 'photos': return <Camera size={size} aria-hidden="true" />;
      case 'videos': return <Film size={size} aria-hidden="true" />;
      case 'receipts': return <Receipt size={size} aria-hidden="true" />;
      default: return <Folder size={size} aria-hidden="true" />;
    }
  }
  switch (fileKind(node.name, node.mime_type)) {
    case 'image': return <ImageIcon size={size} aria-hidden="true" />;
    case 'video': return <Film size={size} aria-hidden="true" />;
    case 'audio': return <Music size={size} aria-hidden="true" />;
    case 'pdf': case 'text': return <FileText size={size} aria-hidden="true" />;
    default: return <Archive size={size} aria-hidden="true" />;
  }
}

async function viewUrl(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/files/${id}/download?inline=1`);
    if (!res.ok) return null;
    const { url } = await res.json();
    return typeof url === 'string' ? url : null;
  } catch { return null; }
}

export default function FileExplorerDialog({
  open, onClose, mode, title, subtitle, actions, onPick, canChoose, hint, excludeIds = [], startAt = null,
}: FileExplorerDialogProps) {
  const [places, setPlaces] = useState<ExplorerNode[]>([]);
  const { data: session } = useSession();
  const myEmail = session?.user?.email?.toLowerCase() ?? null;
  const [parentId, setParentId] = useState<string | null>(startAt);
  const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [nodes, setNodes] = useState<ExplorerNode[]>([]);
  const [parentAccess, setParentAccess] = useState<ExplorerAccess>('view');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ExplorerNode[] | null>(null);
  const [selected, setSelected] = useState<ExplorerNode | null>(null);
  const [view, setView] = useState<View>('large');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  // the view is a preference
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY) as View | null; if (v && ['large', 'small', 'list', 'details'].includes(v)) setView(v); } catch { /* no storage */ }
  }, []);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* no storage */ } };

  /** The roots, plus "My files" — the person's own folder under the Personal container. */
  const placesFrom = useCallback(async (roots: ExplorerNode[]) => {
    const folders = roots.filter((n) => n.node_type === 'folder');
    const personal = folders.find((n) => n.is_system && /^personal$/i.test(n.name));
    let mine: ExplorerNode | null = null;
    if (personal && myEmail) {
      try {
        const res = await fetch(`/api/admin/files?parent=${encodeURIComponent(personal.id)}`);
        if (res.ok) {
          const d = await res.json();
          mine = ((d.nodes ?? []) as ExplorerNode[]).find((n) => n.is_personal_root && (n as { owner_email?: string | null }).owner_email?.toLowerCase() === myEmail) ?? null;
        }
      } catch { /* no "My files" entry; the Personal container is still listed */ }
    }
    const all = mine ? [mine, ...folders.filter((n) => n.id !== mine!.id)] : folders;
    setPlaces([...all].sort((a, b) => placeRank(a) - placeRank(b)));
  }, [myEmail]);

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/files?parent=${encodeURIComponent(pid ?? 'root')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not open that folder.');
      const list = (data.nodes ?? []) as ExplorerNode[];
      setNodes(list);
      setCrumbs(data.breadcrumb ?? []);
      setParentAccess((data.parent_access ?? 'view') as ExplorerAccess);
      if (pid === null) void placesFrom(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that folder.');
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [placesFrom]);

  // opening resets to the start folder; the places come from Home once
  useEffect(() => {
    if (!open) return;
    setParentId(startAt);
    setQuery(''); setHits(null); setSelected(null); setThumbs({});
    if (startAt !== null) {
      void fetch('/api/admin/files?parent=root').then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (d?.nodes) void placesFrom(d.nodes as ExplorerNode[]);
      }).catch(() => { /* the places list stays empty */ });
    }
  }, [open, startAt, placesFrom]);

  useEffect(() => { if (open) void load(parentId); }, [open, parentId, load]);

  // search — the explorer's own index, mounts included
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/files/search?q=${encodeURIComponent(term)}`);
          const data = await res.json();
          if (!cancelled) setHits(res.ok ? ((data.hits ?? []) as ExplorerNode[]) : []);
        } catch { if (!cancelled) setHits([]); }
      })();
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // previews for the large-icon view: the first images of the folder, a few at a time
  const list = hits ?? nodes;
  useEffect(() => {
    if (!open || view !== 'large') return;
    const wanted = list.filter((n) => n.node_type === 'file' && fileKind(n.name, n.mime_type) === 'image' && !thumbs[n.id]).slice(0, 24);
    if (wanted.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < wanted.length; i += 6) {
        const batch = wanted.slice(i, i + 6);
        const pairs = await Promise.all(batch.map(async (n) => [n.id, await viewUrl(n.id)] as const));
        if (cancelled) return;
        setThumbs((m) => { const next = { ...m }; for (const [id, u] of pairs) if (u) next[id] = u; return next; });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, list]);

  // Esc closes; Backspace goes up a level when nothing is being typed
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Backspace' && !typing && hits === null) { e.preventDefault(); goUp(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hits, crumbs]);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const isChoosable = useCallback((n: ExplorerNode): boolean => {
    if (excluded.has(n.id)) return false;
    if (canChoose) return canChoose(n);
    if (mode === 'folder') return n.node_type === 'folder' && !n.id.startsWith('mnt:') && rank(n.access) >= rank('edit');
    return n.node_type === 'file';
  }, [excluded, canChoose, mode]);

  const openFolder = (id: string | null) => { setHits(null); setQuery(''); setSelected(null); setParentId(id); };
  const goUp = () => { if (crumbs.length > 1) openFolder(crumbs[crumbs.length - 2].id); else openFolder(null); };

  if (!open) return null;

  const heading = title ?? (mode === 'folder' ? 'Choose a folder' : 'Choose a file');
  const sub = subtitle ?? (mode === 'folder' ? 'Open a folder to go into it, or choose the one you are in.' : 'Browse or search, then choose a file.');
  const footActions: ExplorerAction[] = actions ?? [{ key: 'choose', label: mode === 'folder' ? 'Use this folder' : 'Choose', primary: true }];

  // the current folder as a choosable node, for "the one you are in"
  const hereNode: ExplorerNode | null = mode === 'folder' && hits === null && crumbs.length > 0
    ? { id: crumbs[crumbs.length - 1].id, parent_id: null, node_type: 'folder', name: crumbs[crumbs.length - 1].name, mime_type: null, access: parentAccess }
    : null;
  const choice: ExplorerNode | null = selected ?? (hereNode && isChoosable(hereNode) ? hereNode : null);
  const pick = (n: ExplorerNode, actionKey: string) => {
    const trail = [...crumbs.map((c) => c.name)];
    if (!crumbs.some((c) => c.id === n.id)) trail.push(n.name);
    onPick({ id: n.id, name: n.name, trail, node: n }, actionKey);
    onClose();
  };

  const activate = (n: ExplorerNode) => {
    // double-click / Enter: a folder opens; a chosen file is picked with the primary action
    if (n.node_type === 'folder') { openFolder(n.id); return; }
    if (mode === 'file' && isChoosable(n)) pick(n, footActions.find((a) => a.primary)?.key ?? footActions[0].key);
  };
  const select = (n: ExplorerNode) => {
    if (isChoosable(n)) setSelected(n);
    else if (n.node_type === 'folder' && mode === 'folder') openFolder(n.id);
    else setSelected(null);
  };

  const crumbIds = new Set(crumbs.map((c) => c.id));
  const placeIsOn = (p: ExplorerNode) => hits === null && (p.is_personal_root ? crumbIds.has(p.id) : crumbs.length > 0 && crumbs[0].id === p.id && !(places.some((x) => x.is_personal_root && crumbIds.has(x.id)) && p.is_system));

  return (
    <div className="fxd-overlay" role="presentation" onClick={onClose}>
      <div ref={dialogRef} className="fxd" role="dialog" aria-modal="true" aria-label={heading} onClick={(e) => e.stopPropagation()} data-testid="file-explorer-dialog">
        <header className="fxd__head">
          <div className="fxd__head-text">
            <h2 className="fxd__title">{heading}</h2>
            <p className="fxd__subtitle">{sub}</p>
          </div>
          <button type="button" className="fxd__close" onClick={onClose} aria-label="Close" title="Close (Esc)"><X size={18} aria-hidden="true" /></button>
        </header>

        <div className="fxd__body">
          {/* ── Places ── */}
          <nav className="fxd__nav" aria-label="Places">
            <button type="button" className={`fxd__place${parentId === null && hits === null ? ' fxd__place--on' : ''}`} onClick={() => openFolder(null)}>
              <Home size={16} aria-hidden="true" /> Home
            </button>
            {places.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`fxd__place${placeIsOn(p) ? ' fxd__place--on' : ''}`}
                onClick={() => openFolder(p.id)}
                title={p.name}
              >
                {placeIcon(p)} <span className="fxd__place-label">{placeLabel(p)}</span>
              </button>
            ))}
          </nav>

          {/* ── The folder ── */}
          <section className="fxd__main" aria-label="Folder contents">
            <div className="fxd__bar">
              <button type="button" className="fxd__icon-btn" onClick={goUp} disabled={hits !== null || crumbs.length === 0} aria-label="Up one level" title="Up (Backspace)"><ArrowUp size={15} aria-hidden="true" /></button>
              {hits === null ? (
                <nav className="fxd__crumbs" aria-label="Folder path">
                  <button type="button" className="fxd__crumb" onClick={() => openFolder(null)}><Home size={13} aria-hidden="true" /> Home</button>
                  {crumbs.map((c, i) => (
                    <span key={c.id} className="fxd__crumb-wrap">
                      <ChevronRight size={12} className="fxd__crumb-sep" aria-hidden="true" />
                      <button type="button" className={`fxd__crumb${i === crumbs.length - 1 ? ' fxd__crumb--here' : ''}`} onClick={() => openFolder(c.id)}>{c.name}</button>
                    </span>
                  ))}
                </nav>
              ) : (
                <p className="fxd__crumbs fxd__crumbs--search">Search results for “{query.trim()}”</p>
              )}
              <label className="fxd__search">
                <Search size={14} aria-hidden="true" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all files…" aria-label="Search all files" />
                {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={13} aria-hidden="true" /></button> : null}
              </label>
              <div className="fxd__views" role="group" aria-label="View">
                <button type="button" className={`fxd__icon-btn${view === 'large' ? ' fxd__icon-btn--on' : ''}`} onClick={() => chooseView('large')} aria-pressed={view === 'large'} title="Large icons"><LayoutGrid size={15} aria-hidden="true" /></button>
                <button type="button" className={`fxd__icon-btn${view === 'small' ? ' fxd__icon-btn--on' : ''}`} onClick={() => chooseView('small')} aria-pressed={view === 'small'} title="Small icons"><Grid2x2 size={15} aria-hidden="true" /></button>
                <button type="button" className={`fxd__icon-btn${view === 'list' ? ' fxd__icon-btn--on' : ''}`} onClick={() => chooseView('list')} aria-pressed={view === 'list'} title="List"><List size={15} aria-hidden="true" /></button>
                <button type="button" className={`fxd__icon-btn${view === 'details' ? ' fxd__icon-btn--on' : ''}`} onClick={() => chooseView('details')} aria-pressed={view === 'details'} title="Details"><Table2 size={15} aria-hidden="true" /></button>
              </div>
            </div>

            <div className="fxd__content" data-view={view}>
              {error ? <p className="fxd__error" role="alert">{error}</p> : null}
              {loading ? (
                <p className="fxd__muted"><Loader2 size={14} className="fxd__spin motion-essential" aria-hidden="true" /> Loading…</p>
              ) : list.length === 0 ? (
                <p className="fxd__muted">{hits !== null ? 'Nothing matches that search.' : 'This folder is empty.'}</p>
              ) : view === 'details' ? (
                <table className="fxd__table">
                  <thead><tr><th>Name</th><th>Size</th><th>Modified</th>{hits !== null ? <th>Where</th> : null}</tr></thead>
                  <tbody>
                    {list.map((n) => (
                      <tr
                        key={n.id}
                        className={`fxd__tr${selected?.id === n.id ? ' fxd__tr--sel' : ''}${!isChoosable(n) && n.node_type === 'file' ? ' fxd__tr--dim' : ''}`}
                        onClick={() => select(n)}
                        onDoubleClick={() => activate(n)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') activate(n); }}
                        aria-selected={selected?.id === n.id}
                      >
                        <td className="fxd__td-name"><NodeIcon node={n} /> <span>{n.name}</span>{n.node_type === 'folder' ? <ChevronRight size={13} className="fxd__td-open" aria-hidden="true" /> : null}</td>
                        <td>{n.node_type === 'folder' ? '—' : formatBytes(n.size_bytes ?? null)}</td>
                        <td>{n.updated_at ? formatWhen(n.updated_at) : '—'}</td>
                        {hits !== null ? <td className="fxd__td-path">{n.path ?? ''}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <ul className={`fxd__grid fxd__grid--${view}`}>
                  {list.map((n) => {
                    const choosable = isChoosable(n);
                    const thumb = view === 'large' && n.node_type === 'file' ? thumbs[n.id] : undefined;
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`fxd__item${selected?.id === n.id ? ' fxd__item--sel' : ''}${!choosable && n.node_type === 'file' ? ' fxd__item--dim' : ''}`}
                          onClick={() => select(n)}
                          onDoubleClick={() => activate(n)}
                          title={n.path ? `${n.name} — ${n.path}` : n.name}
                          aria-pressed={selected?.id === n.id}
                        >
                          <span className="fxd__item-icon">
                            {thumb ? <img src={thumb} alt="" className="fxd__thumb" loading="lazy" /> : <NodeIcon node={n} size={view === 'large' ? 40 : view === 'small' ? 22 : 16} />}
                            {selected?.id === n.id ? <Check size={12} className="fxd__item-check" aria-hidden="true" /> : null}
                          </span>
                          <span className="fxd__item-name">{n.name}</span>
                          {view === 'large' && n.blurb ? <span className="fxd__item-blurb">{n.blurb}</span> : null}
                          {view !== 'large' && n.path ? <span className="fxd__item-path">{n.path}</span> : null}
                          {view === 'list' && n.node_type === 'file' ? <span className="fxd__item-meta">{formatBytes(n.size_bytes ?? null)}</span> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className="fxd__foot">
          <div className="fxd__choice">
            {choice ? (
              <>
                {choice.node_type === 'folder' ? <FolderOpen size={15} aria-hidden="true" /> : <NodeIcon node={choice} size={15} />}
                <span className="fxd__choice-name">{choice.name}</span>
                {choice.id === hereNode?.id ? <span className="fxd__choice-note">this folder</span> : null}
              </>
            ) : (
              <span className="fxd__choice-note">{mode === 'folder' ? 'Choose a folder' : 'Choose a file'}{hint ? ` — ${hint}` : ''}</span>
            )}
          </div>
          <div className="fxd__actions">
            <button type="button" className="fxd__btn" onClick={onClose}>Cancel</button>
            {footActions.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`fxd__btn${a.primary ? ' fxd__btn--primary' : ''}`}
                disabled={!choice}
                onClick={() => { if (choice) pick(choice, a.key); }}
                data-testid={`fxd-action-${a.key}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
