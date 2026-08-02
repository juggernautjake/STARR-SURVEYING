'use client';
// app/AndrewAsh/studio/pages/[id]/PageBuilder.tsx — the editor.
//
// Three columns on a desktop: the block list, the live preview, the inspector. On a phone the three
// become tabs, because a three-pane layout at 390px is three unusable panes.
//
// ── THE PREVIEW IS THE REAL RENDERER ────────────────────────────────────────────────────────────
//
// It renders `WidgetRenderer` — the same component the public page uses, not a lookalike. That is the
// only version of "what you see is what you get" that survives a second developer. It is also why
// `WidgetRenderer` carries a 'use client' directive it does not otherwise need.
//
// ── THE PHONE PREVIEW IS THE PHONE LAYOUT ───────────────────────────────────────────────────────
//
// Switching to phone width narrows the preview pane to 390px. Because the responsive rules are
// CONTAINER queries rather than media queries, the widgets genuinely re-lay-out — no iframe, no
// simulation. See lib/voice/style.ts.
//
// ── AUTOSAVE WRITES DRAFTS, WHICH IS WHY IT CAN BE AGGRESSIVE ───────────────────────────────────
//
// Every change schedules a save of `draft_blocks` after a short idle. Drafts are invisible to
// visitors, so a save can never publish a half-finished thought — which is what makes it safe to save
// constantly, and what makes losing work almost impossible.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

import WidgetRenderer, { type PageContext } from '../../../_ui/WidgetRenderer';
import BlockInspector from './BlockInspector';
import AddBlockPalette from './AddBlockPalette';
import {
  createWidget,
  duplicateWidget,
  moveWidget,
  removeWidget,
  updateWidget,
  widgetMeta,
  type Widget,
  type WidgetType,
} from '@/lib/voice/widgets';
import { BASE_PATH } from '@/lib/voice/content';

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
type Pane = 'blocks' | 'preview' | 'inspect';

interface PageMeta {
  title: string;
  slug: string;
  kind: string;
  status: string;
  workState: string;
  summary: string;
  clientName: string;
  roleLabel: string;
  year: number | null;
  coverPhotoId: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
}

interface Props {
  pageId: string;
  initialBlocks: Widget[];
  hasDraft: boolean;
  meta: PageMeta;
  context: PageContext;
  isSystemPage: boolean;
}

const AUTOSAVE_MS = 1200;
/** Deep enough to undo a bad five minutes, shallow enough not to hold a page's worth of blocks
 *  fifty times over in memory. */
const UNDO_DEPTH = 50;

export default function PageBuilder({
  pageId,
  initialBlocks,
  hasDraft,
  meta,
  context,
  isSystemPage,
}: Props): React.ReactElement {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Widget[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [saveState, setSaveState] = useState<SaveState>(hasDraft ? 'dirty' : 'clean');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [pane, setPane] = useState<Pane>('preview');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const undoStack = useRef<Widget[][]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The first render must not schedule a save — otherwise merely opening a page marks it dirty and
  // creates a draft, and every page in the list sprouts an "unpublished edits" badge nobody caused.
  const firstRender = useRef(true);

  const selected = useMemo(() => blocks.find((b) => b.id === selectedId) ?? null, [blocks, selectedId]);

  /** Every mutation goes through here so the undo stack cannot get out of step with the blocks. */
  const mutate = useCallback((next: Widget[] | ((prev: Widget[]) => Widget[])) => {
    setBlocks((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved === prev) return prev;
      undoStack.current.push(prev);
      if (undoStack.current.length > UNDO_DEPTH) undoStack.current.shift();
      return resolved;
    });
    setSaveState('dirty');
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    setBlocks(previous);
    setSaveState('dirty');
  }, []);

  // ── Autosave ──
  const save = useCallback(
    async (payload: Widget[]): Promise<void> => {
      setSaveState('saving');
      setError(null);
      try {
        const res = await fetch(`/api/voice/pages/${pageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: payload }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Could not save.');
        }
        setSaveState('saved');
      } catch (err) {
        setSaveState('error');
        setError(err instanceof Error ? err.message : 'Could not save.');
      }
    },
    [pageId],
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveState !== 'dirty') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(blocks), AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [blocks, saveState, save]);

  // Warn before leaving with an unsaved change in flight. The autosave window is short, but a tab
  // closed inside it loses the edit and there is no way to get it back.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      if (saveState === 'dirty' || saveState === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  // Cmd/Ctrl+Z to undo, Cmd/Ctrl+S to save now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Never steal the shortcut from a field the user is typing in.
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 's') {
        e.preventDefault();
        void save(blocks);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, save, blocks]);

  // ── Actions ──
  const addBlock = (type: WidgetType): void => {
    const widget = createWidget(type);
    const at = insertAt ?? blocks.length;
    mutate((prev) => {
      const next = prev.slice();
      next.splice(Math.max(0, Math.min(next.length, at)), 0, widget);
      return next;
    });
    setSelectedId(widget.id);
    setPaletteOpen(false);
    setInsertAt(null);
    setPane('inspect');
  };

  const patchSelected = (patch: Partial<Widget>): void => {
    if (!selectedId) return;
    mutate((prev) => updateWidget(prev, selectedId, patch));
  };

  async function publish(): Promise<void> {
    setPublishing(true);
    setError(null);
    try {
      // Flush any pending edit first: publishing copies `draft_blocks`, so an unsaved change would be
      // silently left out of the thing being published.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await save(blocks);
      const res = await fetch(`/api/voice/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not publish.');
      }
      setSaveState('clean');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish.');
    } finally {
      setPublishing(false);
    }
  }

  const publicHref =
    meta.kind === 'project'
      ? `${BASE_PATH}/work/${meta.slug}`
      : meta.slug === 'home'
        ? BASE_PATH
        : `${BASE_PATH}/${meta.slug}`;

  return (
    <div className="vaBuilder">
      {/* ── TOOLBAR ── */}
      <div className="vaBuilderBar">
        <div className="vaBuilderBarMain">
          <span className="vaBuilderTitle">{meta.title}</span>
          <SaveBadge state={saveState} />
        </div>

        <div className="vaBuilderDevice" role="group" aria-label="Preview width">
          <button
            type="button"
            onClick={() => setDevice('desktop')}
            aria-pressed={device === 'desktop'}
            title="Desktop"
          >
            <Monitor size={15} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setDevice('mobile')}
            aria-pressed={device === 'mobile'}
            title="Phone"
          >
            <Smartphone size={15} aria-hidden />
          </button>
        </div>

        <div className="vaBuilderBarActions">
          <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={undo} disabled={!undoStack.current.length}>
            <Undo2 size={13} aria-hidden /> Undo
          </button>
          <a href={publicHref} target="_blank" rel="noopener noreferrer" className="vaBtn vaBtnOutline vaBtnSm">
            <Eye size={13} aria-hidden /> View live
          </a>
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            onClick={() => void publish()}
            disabled={publishing || saveState === 'saving'}
          >
            {publishing ? <Loader2 size={13} aria-hidden className="vaSpin" /> : <Upload size={13} aria-hidden />}
            Publish
          </button>
        </div>
      </div>

      {error && (
        <div className="vaNotice vaNoticeBad" role="alert" style={{ margin: '0 0 12px' }}>
          {error}
        </div>
      )}

      {/* ── PHONE TABS ── */}
      <div className="vaBuilderTabs" role="tablist">
        {(['blocks', 'preview', 'inspect'] as Pane[]).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={pane === p ? 'vaBuilderTabActive' : undefined}
          >
            {p === 'blocks' ? 'Blocks' : p === 'preview' ? 'Preview' : 'Style'}
          </button>
        ))}
      </div>

      <div className="vaBuilderGrid" data-pane={pane}>
        {/* ── BLOCK LIST ── */}
        <aside className="vaBuilderBlocks">
          <div className="vaBuilderPaneHead">
            <span>Blocks</span>
            <button
              type="button"
              className="vaBtn vaBtnOutline vaBtnSm"
              onClick={() => {
                setInsertAt(blocks.length);
                setPaletteOpen(true);
              }}
            >
              <Plus size={13} aria-hidden /> Add
            </button>
          </div>

          <ol className="vaBlockList">
            {blocks.map((block, index) => {
              const info = widgetMeta(block.type);
              return (
                <li key={block.id}>
                  <div
                    className={`vaBlockItem${block.id === selectedId ? ' vaBlockItemActive' : ''}${
                      block.hidden ? ' vaBlockItemHidden' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="vaBlockPick"
                      onClick={() => {
                        setSelectedId(block.id);
                        setPane('inspect');
                      }}
                    >
                      <span className="vaBlockLabel">{info.label}</span>
                      <span className="vaBlockPreviewText">{summarise(block)}</span>
                    </button>

                    <div className="vaBlockTools">
                      <button
                        type="button"
                        onClick={() => mutate((prev) => moveWidget(prev, index, index - 1))}
                        disabled={index === 0}
                        aria-label="Move up"
                        title="Move up"
                      >
                        <ArrowUp size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate((prev) => moveWidget(prev, index, index + 1))}
                        disabled={index === blocks.length - 1}
                        aria-label="Move down"
                        title="Move down"
                      >
                        <ArrowDown size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate((prev) => updateWidget(prev, block.id, { hidden: !block.hidden }))}
                        aria-label={block.hidden ? 'Show' : 'Hide'}
                        title={block.hidden ? 'Show on the site' : 'Hide from the site'}
                      >
                        {block.hidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate((prev) => duplicateWidget(prev, block.id))}
                        aria-label="Duplicate"
                        title="Duplicate"
                      >
                        <Copy size={13} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // No confirmation dialog: this is undoable with one click and Ctrl+Z, and a
                          // confirm on every delete in a builder is the prompt people learn to dismiss
                          // without reading.
                          mutate((prev) => removeWidget(prev, block.id));
                          if (selectedId === block.id) setSelectedId(null);
                        }}
                        aria-label="Delete"
                        title="Delete (undo with Ctrl+Z)"
                        className="vaBlockDelete"
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="vaBlockInsert"
                    onClick={() => {
                      setInsertAt(index + 1);
                      setPaletteOpen(true);
                    }}
                    aria-label={`Insert a block after ${info.label}`}
                  >
                    <Plus size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>

          {blocks.length === 0 && (
            <div className="vaEmptyPanel">
              <p style={{ margin: '0 0 14px', fontSize: '0.875rem' }}>This page has no blocks yet.</p>
              <button
                type="button"
                className="vaBtn vaBtnSolid vaBtnSm"
                onClick={() => {
                  setInsertAt(0);
                  setPaletteOpen(true);
                }}
              >
                <Plus size={13} aria-hidden /> Add the first one
              </button>
            </div>
          )}
        </aside>

        {/* ── PREVIEW ── */}
        <main className="vaBuilderPreview">
          <div className="vaBuilderPaneHead">
            <span>{device === 'mobile' ? 'Phone preview' : 'Preview'}</span>
            <span className="vaMuted" style={{ fontSize: '0.6875rem' }}>
              {device === 'mobile' ? '390px — the real phone layout' : 'What a visitor sees'}
            </span>
          </div>
          <div className="vaBuilderCanvasWrap">
            {/* The width change is what fires the container queries. Nothing about the widgets is
                simulated — this IS the layout a 390px phone gets. */}
            <div
              className={`vaBuilderCanvas${device === 'mobile' ? ' vaBuilderCanvasPhone' : ''}`}
              style={device === 'mobile' ? { width: 390 } : undefined}
            >
              <WidgetRenderer widgets={blocks} context={context} previewAll />
            </div>
          </div>
        </main>

        {/* ── INSPECTOR ── */}
        <aside className="vaBuilderInspect">
          <div className="vaBuilderPaneHead">
            <span>
              <Settings2 size={13} aria-hidden style={{ verticalAlign: -2, marginRight: 6 }} />
              {selected ? widgetMeta(selected.type).label : 'Nothing selected'}
            </span>
          </div>
          {selected ? (
            <BlockInspector
              widget={selected}
              device={device}
              onChange={patchSelected}
              onDeviceChange={setDevice}
            />
          ) : (
            <p className="vaMuted" style={{ fontSize: '0.875rem', padding: '14px 0' }}>
              Pick a block on the left to change its words, its photo, its spacing and its colours.
            </p>
          )}
        </aside>
      </div>

      {/* ── ADD PALETTE ── */}
      {paletteOpen && (
        <AddBlockPalette
          onPick={addBlock}
          onClose={() => {
            setPaletteOpen(false);
            setInsertAt(null);
          }}
        />
      )}

      {/* ── DANGER ── */}
      <div className="vaPanel" style={{ marginTop: 24 }}>
        <div className="vaPanelHead">
          <h2 className="vaPanelTitle">Page settings</h2>
        </div>
        <p className="vaMuted" style={{ fontSize: '0.875rem', marginBottom: 16 }}>
          Address: <code style={{ color: 'var(--va-accent)' }}>{publicHref}</code> · Status: {meta.status}
        </p>
        <div className="vaStudioActions">
          {hasDraft && (
            <button
              type="button"
              className="vaBtn vaBtnGhost vaBtnSm"
              onClick={async () => {
                await fetch(`/api/voice/pages/${pageId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ revert: true }),
                });
                router.refresh();
              }}
            >
              <RotateCcw size={13} aria-hidden /> Discard unpublished changes
            </button>
          )}
          <button
            type="button"
            className="vaBtn vaBtnGhost vaBtnSm"
            style={{ color: '#ff9c7e' }}
            onClick={async () => {
              const message = isSystemPage
                ? 'Restore this page to the original it shipped with? Everything you have changed on it will be lost.'
                : 'Delete this page for good? This cannot be undone.';
              if (!window.confirm(message)) return;
              await fetch(`/api/voice/pages/${pageId}`, { method: 'DELETE' });
              router.push(`${BASE_PATH}/studio/pages`);
            }}
          >
            <Trash2 size={13} aria-hidden />
            {isSystemPage ? 'Restore the original' : 'Delete this page'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }): React.ReactElement {
  const map: Record<SaveState, { text: string; icon: React.ReactNode }> = {
    clean: { text: 'All published', icon: <Check size={12} aria-hidden /> },
    dirty: { text: 'Unsaved', icon: <Save size={12} aria-hidden /> },
    saving: { text: 'Saving…', icon: <Loader2 size={12} aria-hidden className="vaSpin" /> },
    saved: { text: 'Saved as draft', icon: <Check size={12} aria-hidden /> },
    error: { text: 'Save failed', icon: <X size={12} aria-hidden /> },
  };
  const item = map[state];
  return (
    <span className={`vaSaveBadge vaSaveBadge-${state}`} aria-live="polite">
      {item.icon}
      {item.text}
    </span>
  );
}

/** A one-line preview of a block, for the list. Falls back to the type name so a block with no text
 *  is still identifiable — an unlabelled row is impossible to find in a list of twenty. */
function summarise(block: Widget): string {
  const p = block.props ?? {};
  const first =
    (typeof p.text === 'string' && p.text) ||
    (typeof p.title === 'string' && p.title) ||
    (typeof p.heading === 'string' && p.heading) ||
    (typeof p.label === 'string' && p.label) ||
    (typeof p.html === 'string' && p.html.replace(/<[^>]*>/g, ' ').trim()) ||
    '';
  const trimmed = String(first).replace(/\s+/g, ' ').trim();
  if (!trimmed) return widgetMeta(block.type).hint;
  return trimmed.length > 58 ? `${trimmed.slice(0, 58)}…` : trimmed;
}
