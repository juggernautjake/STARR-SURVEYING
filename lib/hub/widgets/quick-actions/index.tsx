'use client';
// lib/hub/widgets/quick-actions/index.tsx
//
// Quick Actions widget. Surfaces a user-curated grid (or list) of
// shortcut tiles — clock in/out, new job, approve receipts, etc. All
// five size buckets supported. Settings drive: which actions are
// shown, their order, layout (grid/list), display style (icon-only or
// icon+label), and ⌘1–⌘9 keyboard shortcuts on the first nine tiles.
//
// Slice 95 of customizable-hub-and-work-mode-2026-05-28.md.
//
// quick-actions-wiring-2026-06-22 — `clock-in-out` is now a real action
// handler (opens the same ClockInModal/ClockOutModal the top-bar pill
// uses) rather than a link to an archived hours tab.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket } from '@/lib/hub/size-bucket';
import { useElementSize } from '@/lib/hub/use-element-size';
import { useQuickActionBadges } from '@/lib/hub/use-hub-badges';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { ClockInModal, ClockOutModal } from '@/lib/work-mode/clock-modals';
import {
  CLOCK_SESSION_KEY,
  clearClockSession,
  elapsedHours,
  readClockSession,
  writeClockSession,
  type ClockSession,
} from '@/lib/work-mode/clock-session';
import { useActivityTags, type ActivityTag } from '@/lib/work-mode/use-activity-tags';
import { gridCapacity, listCapacity, splitForCapacity } from './capacity';
import {
  moveUp,
  moveDown,
  addOrdered,
  removeOrdered,
  unselectedOptions,
} from '@/lib/hub/widgets/_shared/ordered-list';
import {
  QUICK_ACTIONS_CATALOG,
  DEFAULT_QUICK_ACTION_IDS,
  findQuickAction,
  type QuickActionDef,
} from '@/lib/hub/quick-actions-catalog';
import {
  CUSTOM_ACTION_ICON_CHOICES,
  CUSTOM_ACTION_LABEL_MAX,
  CUSTOM_ACTION_TINTS,
  isCustomActionId,
  isExternalHref,
  nextCustomActionId,
  normalizeCustomActions,
  safeHref,
  toQuickActionDef,
  type CustomQuickAction,
} from '@/lib/hub/custom-quick-actions';
import { ADMIN_ROUTES, WORKSPACES, WORKSPACE_ORDER } from '@/lib/admin/route-registry';


export interface QuickActionsContent extends Record<string, unknown> {
  /** Ordered list of action ids the user wants displayed. Defaults to
   *  every catalog entry — settings panel lets the user reorder + hide.
   *  May contain `custom:…` ids, which resolve against `customActions`. */
  actionIds: string[];
  /** User-authored shortcuts. These are the user's own links: a label, a destination page (or an
   *  external URL), an icon and a tint. They live in the widget's saved content rather than in the
   *  catalog, because they belong to one person's hub and not to the product. */
  customActions: CustomQuickAction[];
  layoutStyle: 'grid' | 'list';
  /** 'icon-label' shows the action label under the icon; 'icon-only'
   *  hides it (icon-only is most useful in tiny/small buckets). */
  displayStyle: 'icon-label' | 'icon-only';
  /** When true, attaches ⌘1–⌘9 keyboard shortcuts to the first 9
   *  visible actions. Off by default — power users can opt in. */
  enableShortcuts: boolean;
}

const DEFAULTS: QuickActionsContent = {
  actionIds: [...DEFAULT_QUICK_ACTION_IDS],
  customActions: [],
  layoutStyle: 'grid',
  displayStyle: 'icon-label',
  enableShortcuts: false,
};

/**
 * Ids → definitions, over the catalog AND the user's own links.
 *
 * Unknown ids are skipped rather than rendered as a broken tile: a saved selection outlives both a
 * retired catalog entry and a deleted custom link, and neither should leave a dead cell on the hub.
 */
export function resolveActions(
  actionIds: ReadonlyArray<string>,
  customActions: ReadonlyArray<CustomQuickAction>,
): QuickActionDef[] {
  const custom = new Map(customActions.map((c) => [c.id, c]));
  return actionIds
    .map((id) => {
      if (isCustomActionId(id)) {
        const c = custom.get(id);
        return c ? toQuickActionDef(c) : undefined;
      }
      return findQuickAction(id);
    })
    .filter((a): a is QuickActionDef => a !== undefined);
}

function QuickActionsWidget({ size, content }: WidgetProps<QuickActionsContent>) {
  // Custom actions arrive from persisted, opaque `content`, so they are re-sanitized on the way in
  // rather than trusted — see the boundary note in custom-quick-actions.ts.
  const settings = {
    ...DEFAULTS,
    ...content,
    customActions: normalizeCustomActions(content?.customActions),
  };
  const bucket = sizeBucket(size.w, size.h);

  // W-5 — unread counts per quick-action, from the shared hub badge feed. Keyed on the action id
  // (new-job, approve-receipts, capture-receipt); actions with no mapped events read 0.
  const actionBadges = useQuickActionBadges();

  // Self-measure the rendered body so capacity fills the actual cell
  // (doc 15: "render the maximum that fit the widget size") rather than
  // a hard per-bucket cap. Falls back to the bucket cap before the
  // ResizeObserver first fires (widthPx/heightPx === 0).
  const containerRef = useRef<HTMLDivElement>(null);
  const { widthPx, heightPx } = useElementSize(containerRef);

  // quick-actions-wiring-2026-06-22 — clock-in modal state. Mirrors the
  // top-bar ClockInPill so the widget tile and the pill stay in sync
  // through localStorage + the cross-tab `storage` event.
  const [clockSession, setClockSession] = useState<ClockSession | null>(null);
  const [clockModal, setClockModal] = useState<'none' | 'in' | 'out'>('none');
  // Shared, preloaded catalog so the clock modal opens fully-formed.
  const tagCatalog = useActivityTags();

  useEffect(() => {
    setClockSession(readClockSession());
    function onStorage(e: StorageEvent) {
      if (e.key === CLOCK_SESSION_KEY) setClockSession(readClockSession());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleClockInSubmit = useCallback(({ jobId, tagIds }: { jobId: string | null; tagIds: string[] }) => {
    const next: ClockSession = { startedAt: new Date().toISOString(), jobId, tagIds };
    writeClockSession(next);
    setClockSession(next);
    setClockModal('none');
  }, []);

  const handleClockOutSubmit = useCallback(async ({ perJobAllocations, tagIds, notes }: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string }) => {
    if (!clockSession) { setClockModal('none'); return; }
    const totalAllocated = Object.values(perJobAllocations).reduce((sum, h) => sum + h, 0);
    const elapsed = elapsedHours(clockSession.startedAt);
    const today = new Date().toISOString().slice(0, 10);
    const entries = totalAllocated > 0
      ? Object.entries(perJobAllocations)
          .filter(([, h]) => h > 0)
          .map(([job_id, hours]) => ({
            log_date: today,
            work_type: 'general',
            hours,
            job_id,
            description: 'Clock-out entry from Quick Actions widget',
            notes,
            activity_tag_ids: [...new Set([...clockSession.tagIds, ...tagIds])],
          }))
      : [{
          log_date: today,
          work_type: 'general',
          hours: elapsed,
          job_id: clockSession.jobId,
          description: 'Clock-out entry from Quick Actions widget',
          notes,
          activity_tag_ids: [...new Set([...clockSession.tagIds, ...tagIds])],
        }];
    try {
      await fetch('/api/admin/time-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
    } catch {
      /* swallow — clearing the session is the safer outcome than leaving the user "stuck on" */
    }
    clearClockSession();
    setClockSession(null);
    setClockModal('none');
  }, [clockSession]);

  const dispatchAction = useCallback((actionId: string) => {
    if (actionId === 'clock-in-out') {
      setClockModal(clockSession ? 'out' : 'in');
    }
  }, [clockSession]);

  // Resolve ids → defs, over the catalog and the user's own links. Skips retired ids gracefully.
  const actions: QuickActionDef[] = resolveActions(settings.actionIds, settings.customActions);

  // ⌘1–⌘9 shortcuts on first 9. Defensive: skip when SSR (no window)
  // and when the user has disabled shortcuts.
  useEffect(() => {
    if (!settings.enableShortcuts) return;
    if (typeof window === 'undefined') return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const target = actions[n - 1];
      if (!target) return;
      e.preventDefault();
      if (target.kind === 'link' && target.href) {
        // An external destination opens in its own tab from the keyboard too, so ⌘3 and clicking
        // the third tile do the same thing.
        if (isExternalHref(target.href)) window.open(target.href, '_blank', 'noopener,noreferrer');
        else window.location.assign(target.href);
      } else if (target.kind === 'action' && target.actionId) {
        dispatchAction(target.actionId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, settings.enableShortcuts, dispatchAction]);

  if (actions.length === 0) {
    return (
      <WidgetEmpty
        icon="⚡"
        title="No quick actions yet"
        description="Pick the shortcuts you use most from the settings panel."
      />
    );
  }

  // Tiny + explicit list layout both render a vertical row stack; the
  // grid layout fills cols × rows. Capacity comes from the measured body
  // (bucket cap as the pre-measure fallback).
  const isRowLayout = bucket === 'tiny' || settings.layoutStyle === 'list';
  const rowDisplay = bucket === 'tiny' ? 'icon-only' : settings.displayStyle;

  const { cap, cols } = computeCapacity({
    bucket,
    widthPx,
    heightPx,
    isRowLayout,
    displayStyle: rowDisplay,
  });
  const { visible, overflow } = splitForCapacity(actions, cap);

  const clockedIn = !!clockSession;

  if (isRowLayout) {
    return (
      <>
        <div ref={containerRef} style={{ height: '100%' }}>
          <ul role="list" style={listFillStyle}>
            {visible.map((a) => (
              <li key={a.id}>
                <ActionTrigger
                  action={a}
                  displayStyle={rowDisplay}
                  variant="row"
                  onDispatch={dispatchAction}
                  clockedIn={clockedIn}
                  badge={actionBadges[a.id] ?? 0}
                />
              </li>
            ))}
            {overflow > 0 && (
              <li>
                <OverflowIndicator count={overflow} variant="row" />
              </li>
            )}
          </ul>
        </div>
        <ClockModalsHost
          clockSession={clockSession}
          modal={clockModal}
          onClose={() => setClockModal('none')}
          onClockInSubmit={handleClockInSubmit}
          onClockOutSubmit={handleClockOutSubmit}
          catalog={tagCatalog}
        />
      </>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        role="list"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 'var(--hub-spc-3, 12px)',
          alignContent: 'start',
          height: '100%',
        }}
      >
        {visible.map((a) => (
          <ActionTrigger
            key={a.id}
            action={a}
            displayStyle={settings.displayStyle}
            variant="tile"
            onDispatch={dispatchAction}
            clockedIn={clockedIn}
            badge={actionBadges[a.id] ?? 0}
          />
        ))}
        {overflow > 0 && <OverflowIndicator count={overflow} variant="tile" />}
      </div>
      <ClockModalsHost
        clockSession={clockSession}
        modal={clockModal}
        onClose={() => setClockModal('none')}
        onClockInSubmit={handleClockInSubmit}
        onClockOutSubmit={handleClockOutSubmit}
        catalog={tagCatalog}
      />
    </>
  );
}

/** Hosts the clock-in and clock-out modals + suggested allocations.
 *  Rendered next to both layout branches so the widget keeps a single
 *  source of clock state regardless of grid/list rendering. */
function ClockModalsHost({
  clockSession,
  modal,
  onClose,
  onClockInSubmit,
  onClockOutSubmit,
  catalog,
}: {
  clockSession: ClockSession | null;
  modal: 'none' | 'in' | 'out';
  onClose: () => void;
  onClockInSubmit: (data: { jobId: string | null; tagIds: string[] }) => void;
  onClockOutSubmit: (data: { perJobAllocations: Record<string, number>; tagIds: string[]; notes: string }) => void;
  catalog: ActivityTag[];
}) {
  return (
    <>
      <ClockInModal
        open={modal === 'in'}
        onClose={onClose}
        onSubmit={onClockInSubmit}
        catalog={catalog}
      />
      {clockSession && (
        <ClockOutModal
          open={modal === 'out'}
          onClose={onClose}
          onSubmit={onClockOutSubmit}
          catalog={catalog}
          suggestedAllocations={clockSession.jobId ? { [clockSession.jobId]: elapsedHours(clockSession.startedAt) } : {}}
        />
      )}
    </>
  );
}

/** Capacity from the measured body, with the bucket cap as the
 *  pre-measure fallback. Icon-only tiles pack tighter than icon+label. */
export function computeCapacity({
  bucket,
  widthPx,
  heightPx,
  isRowLayout,
  displayStyle,
}: {
  bucket: ReturnType<typeof sizeBucket>;
  widthPx: number;
  heightPx: number;
  isRowLayout: boolean;
  displayStyle: 'icon-label' | 'icon-only';
}): { cap: number; cols: number } {
  if (isRowLayout) {
    if (heightPx <= 0) return { cap: capForBucket(bucket), cols: 1 };
    return { cap: listCapacity(heightPx, { rowH: 44 }).cap, cols: 1 };
  }
  if (widthPx <= 0 || heightPx <= 0) {
    return { cap: capForBucket(bucket), cols: colsForBucket(bucket) };
  }
  const iconOnly = displayStyle === 'icon-only';
  const minTileW = iconOnly ? 56 : 84;
  const minTileH = iconOnly ? 52 : 66;
  const { cap, cols } = gridCapacity(widthPx, heightPx, { minTileW, minTileH });
  return { cap, cols };
}

/** A non-interactive "+N more" cell shown when the chosen actions
 *  overflow the available capacity. It links nowhere (never a dead
 *  link) — the hint tells the user how to reveal the rest. */
function OverflowIndicator({ count, variant }: { count: number; variant: 'tile' | 'row' }) {
  const base = variant === 'tile' ? tileStyle : rowStyle;
  return (
    <div
      role="listitem"
      style={{ ...base, color: 'var(--theme-fg-secondary)', cursor: 'default' }}
      title={`${count} more action${count === 1 ? '' : 's'} — resize the widget larger or trim the list in settings`}
      aria-label={`${count} more actions`}
    >
      <span aria-hidden style={{ fontSize: variant === 'tile' ? '1.1rem' : '1rem', fontWeight: 600 }}>
        +{count}
      </span>
      {variant === 'row' && <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>more</span>}
    </div>
  );
}

function QuickActionsSettings({ value, onChange }: WidgetSettingsFormProps<QuickActionsContent>) {
  const settings = {
    ...DEFAULTS,
    ...value,
    customActions: normalizeCustomActions(value?.customActions),
  };
  const customById = new Map(settings.customActions.map((c) => [c.id, c]));
  const allIds = [...QUICK_ACTIONS_CATALOG.map((a) => a.id), ...settings.customActions.map((c) => c.id)];

  // Selected = the user's ordered list (drop any retired ids). The
  // "add" candidates are the catalog entries not yet chosen, in catalog
  // order — doc 15's reorderable chip/multi-select, built on the shared
  // ordered-list helpers (Foundation Doc 02 Slice 4).
  const selected = settings.actionIds.filter((id) => allIds.includes(id));
  const addable = unselectedOptions(selected, allIds);

  /** Definition for a chosen id, whether it came from the catalog or the user's own links. */
  const defFor = (id: string): Pick<QuickActionDef, 'label' | 'iconName' | 'glyph' | 'tint'> | undefined => {
    const custom = customById.get(id);
    return custom ? toQuickActionDef(custom) : findQuickAction(id);
  };

  function setIds(next: string[]) {
    onChange({ ...settings, actionIds: next });
  }

  /** Save a link — new or edited. A new one is appended to the shown list too, because a link the
   *  user just typed out and did not then see appear reads as the save having failed. */
  function saveCustom(action: CustomQuickAction, isNew: boolean) {
    const nextCustom = isNew
      ? [...settings.customActions, action]
      : settings.customActions.map((c) => (c.id === action.id ? action : c));
    onChange({
      ...settings,
      customActions: nextCustom,
      actionIds: isNew ? addOrdered(settings.actionIds, action.id) : settings.actionIds,
    });
  }

  /** Delete a link outright: it leaves both the definition list and the shown order, so no dead id
   *  is left behind in the saved layout. */
  function deleteCustom(id: string) {
    onChange({
      ...settings,
      customActions: settings.customActions.filter((c) => c.id !== id),
      actionIds: settings.actionIds.filter((a) => a !== id),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={settingsLabelStyle}>Layout</span>
        <select
          value={settings.layoutStyle}
          onChange={(e) => onChange({ ...settings, layoutStyle: e.target.value as QuickActionsContent['layoutStyle'] })}
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </label>

      <label>
        <span style={settingsLabelStyle}>Display</span>
        <select
          value={settings.displayStyle}
          onChange={(e) => onChange({ ...settings, displayStyle: e.target.value as QuickActionsContent['displayStyle'] })}
        >
          <option value="icon-label">Icon + label</option>
          <option value="icon-only">Icon only</option>
        </select>
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={settings.enableShortcuts}
          onChange={(e) => onChange({ ...settings, enableShortcuts: e.target.checked })}
        />
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)' }}>
          Enable ⌘1–⌘9 shortcuts on the first nine actions
        </span>
      </label>

      {/* Reorderable chosen-actions list. */}
      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={settingsLabelStyle}>Shown actions</legend>
        {selected.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
            No actions selected — add one below.
          </p>
        ) : (
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
            {selected.map((id, i) => {
              const def = defFor(id);
              return (
                <li key={id} style={chosenRowStyle}>
                  <span aria-hidden style={{ color: colorForTint(def?.tint), width: 18, textAlign: 'center' }}>
                    {glyphFor({ glyph: def?.glyph, iconName: def?.iconName ?? '' })}
                  </span>
                  <span style={{ flex: 1, fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{def?.label ?? id}</span>
                  <button type="button" aria-label={`Move ${def?.label ?? id} up`} disabled={i === 0}
                    onClick={() => setIds(moveUp(selected, i))} style={iconBtnStyle}>↑</button>
                  <button type="button" aria-label={`Move ${def?.label ?? id} down`} disabled={i === selected.length - 1}
                    onClick={() => setIds(moveDown(selected, i))} style={iconBtnStyle}>↓</button>
                  <button type="button" aria-label={`Remove ${def?.label ?? id}`}
                    onClick={() => setIds(removeOrdered(selected, id))} style={iconBtnStyle}>✕</button>
                </li>
              );
            })}
          </ol>
        )}
      </fieldset>

      {/* Add candidates. */}
      {addable.length > 0 && (
        <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
          <legend style={settingsLabelStyle}>Add an action</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hub-spc-2, 8px)' }}>
            {addable.map((id) => {
              const def = defFor(id);
              return (
                <button key={id} type="button" onClick={() => setIds(addOrdered(selected, id))} style={addChipStyle}>
                  <span aria-hidden style={{ color: colorForTint(def?.tint) }}>
                    {glyphFor({ glyph: def?.glyph, iconName: def?.iconName ?? '' })}
                  </span>
                  <span>{def?.label ?? id}</span>
                  <span aria-hidden style={{ color: 'var(--theme-fg-secondary)' }}>＋</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* The user's own links — add, edit, remove. */}
      <CustomLinksEditor
        customActions={settings.customActions}
        existingIds={allIds}
        onSave={saveCustom}
        onDelete={deleteCustom}
      />

      {/* Live preview of the chosen action grid. */}
      <div>
        <span style={settingsLabelStyle}>Preview</span>
        {selected.length === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)' }}>
            Add actions to preview them.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--hub-spc-2, 8px)' }}>
            {selected.slice(0, 8).map((id) => {
              const def = defFor(id);
              return (
                <div key={id} style={{ ...tileStyle, minHeight: 48, padding: 8 }}>
                  <GlyphDisc
                    glyph={glyphFor({ glyph: def?.glyph, iconName: def?.iconName ?? '' })}
                    color={colorForTint(def?.tint)}
                    size={26}
                  />
                  {settings.displayStyle === 'icon-label' && (
                    <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)' }}>{def?.label ?? id}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── The user's own links ──────────────────────────────────────────────
//
// The destination is a picker over the SAME route registry the nav and the ⌘K palette read, not a
// bare URL box. Typing a path by hand is how a shortcut ends up pointing at a page that has since
// moved, and the registry already knows every admin page's real href and its human label. A free
// -text field is still there for anything outside the app (a county clerk's site, a supplier's
// portal) — it is the second choice in the list rather than the only option.

interface LinkDraft {
  /** null while adding; the existing id while editing. */
  id: string | null;
  label: string;
  /** A registry href, or CUSTOM_URL_SENTINEL when the user is typing their own. */
  destination: string;
  url: string;
  icon: string;
  tint: CustomQuickAction['tint'];
  description: string;
}

const CUSTOM_URL_SENTINEL = '__custom_url__';

const EMPTY_DRAFT: LinkDraft = {
  id: null, label: '', destination: '', url: '', icon: '🔗', tint: 'accent', description: '',
};

function CustomLinksEditor({
  customActions,
  existingIds,
  onSave,
  onDelete,
}: {
  customActions: CustomQuickAction[];
  existingIds: string[];
  onSave: (action: CustomQuickAction, isNew: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<LinkDraft | null>(null);
  const [error, setError] = useState('');

  const routeOptions = useMemo(() => {
    return WORKSPACE_ORDER.map((ws) => ({
      workspace: WORKSPACES[ws].label,
      routes: ADMIN_ROUTES.filter((r) => r.workspace === ws && !r.parked),
    })).filter((g) => g.routes.length > 0);
  }, []);

  function beginAdd() {
    setError('');
    setDraft({ ...EMPTY_DRAFT });
  }

  function beginEdit(action: CustomQuickAction) {
    setError('');
    const known = ADMIN_ROUTES.some((r) => r.href === action.href);
    setDraft({
      id: action.id,
      label: action.label,
      destination: known ? action.href : CUSTOM_URL_SENTINEL,
      url: known ? '' : action.href,
      icon: action.icon,
      tint: action.tint,
      description: action.description ?? '',
    });
  }

  function commit() {
    if (!draft) return;
    const label = draft.label.trim();
    if (!label) { setError('Give the link a label — it is what the tile says.'); return; }
    const rawHref = draft.destination === CUSTOM_URL_SENTINEL ? draft.url : draft.destination;
    if (!rawHref.trim()) { setError('Pick a page, or type the address the link should open.'); return; }
    const href = safeHref(rawHref);
    if (!href) {
      setError('That address cannot be opened. Use a page path like /admin/jobs, or a full https:// address.');
      return;
    }
    const isNew = draft.id === null;
    const id = draft.id ?? nextCustomActionId(existingIds, label);
    onSave(
      {
        id,
        label: label.slice(0, CUSTOM_ACTION_LABEL_MAX),
        href,
        icon: draft.icon.trim() || '🔗',
        tint: draft.tint,
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      },
      isNew,
    );
    setDraft(null);
    setError('');
  }

  return (
    <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
      <legend style={settingsLabelStyle}>Your own links</legend>

      {customActions.length === 0 && !draft && (
        <p style={{ margin: '0 0 8px', fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-fg-secondary)' }}>
          Add a shortcut to any page in the app — or to an address outside it.
        </p>
      )}

      {customActions.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
          {customActions.map((action) => (
            <li key={action.id} style={chosenRowStyle}>
              <span aria-hidden style={{ color: colorForTint(action.tint), width: 18, textAlign: 'center' }}>{action.icon}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--hub-font-sm, 0.875rem)' }}>{action.label}</span>
                <span style={{ display: 'block', fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {action.href}
                </span>
              </span>
              <button type="button" onClick={() => beginEdit(action)} style={textBtnStyle}>Edit</button>
              <button type="button" onClick={() => onDelete(action.id)} style={textBtnStyle} aria-label={`Delete ${action.label}`}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
          <label>
            <span style={settingsLabelStyle}>Label</span>
            <input
              type="text"
              value={draft.label}
              maxLength={CUSTOM_ACTION_LABEL_MAX}
              placeholder="Truck checklist"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              style={fieldStyle}
            />
          </label>

          <label>
            <span style={settingsLabelStyle}>Opens</span>
            <select
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
              style={fieldStyle}
            >
              <option value="">Pick a page…</option>
              {routeOptions.map((group) => (
                <optgroup key={group.workspace} label={group.workspace}>
                  {group.routes.map((r) => (
                    <option key={r.href} value={r.href}>{r.label}</option>
                  ))}
                </optgroup>
              ))}
              <option value={CUSTOM_URL_SENTINEL}>Another address…</option>
            </select>
          </label>

          {draft.destination === CUSTOM_URL_SENTINEL && (
            <label>
              <span style={settingsLabelStyle}>Address</span>
              <input
                type="text"
                value={draft.url}
                placeholder="https://example.com or /admin/jobs?status=open"
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                style={fieldStyle}
              />
            </label>
          )}

          <div>
            <span style={settingsLabelStyle}>Icon</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                aria-label="Icon"
                style={{ ...fieldStyle, width: 64, textAlign: 'center' }}
              />
              {CUSTOM_ACTION_ICON_CHOICES.map((glyph) => (
                <button
                  key={glyph}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon: glyph })}
                  aria-label={`Use ${glyph}`}
                  aria-pressed={draft.icon === glyph}
                  style={{
                    ...iconBtnStyle,
                    borderColor: draft.icon === glyph ? 'var(--theme-accent)' : 'var(--theme-border)',
                  }}
                >
                  {glyph}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span style={settingsLabelStyle}>Colour</span>
            <select
              value={draft.tint}
              onChange={(e) => setDraft({ ...draft, tint: e.target.value as CustomQuickAction['tint'] })}
              style={fieldStyle}
            >
              {CUSTOM_ACTION_TINTS.map((t) => (
                <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </label>

          <label>
            <span style={settingsLabelStyle}>Tooltip (optional)</span>
            <input
              type="text"
              value={draft.description}
              placeholder="What this link is for"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              style={fieldStyle}
            />
          </label>

          {error && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--hub-font-sm, 0.875rem)', color: 'var(--theme-danger)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={commit} style={primaryBtnStyle}>
              {draft.id === null ? 'Add link' : 'Save link'}
            </button>
            <button type="button" onClick={() => { setDraft(null); setError(''); }} style={secondaryBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={beginAdd} style={addChipStyle}>
          <span aria-hidden>＋</span>
          <span>Add a link</span>
        </button>
      )}
    </fieldset>
  );
}

defineWidget<QuickActionsContent>({
  id: 'quick-actions',
  label: 'Quick Actions',
  description: 'Customizable shortcuts to your most-used flows.',
  category: 'personal',
  iconName: 'Zap',
  defaultSize: { w: 4, h: 2 },
  // Slice 217 — minSize lowered to 1×1; widget already had a tiny bucket render.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: QuickActionsWidget,
  SettingsForm: QuickActionsSettings,
});

// ─── Trigger ───────────────────────────────────────────────────────────

function ActionTrigger({
  action,
  displayStyle,
  variant,
  onDispatch,
  clockedIn,
  badge = 0,
}: {
  action: QuickActionDef;
  displayStyle: 'icon-label' | 'icon-only';
  variant: 'tile' | 'row';
  onDispatch: (actionId: string) => void;
  clockedIn: boolean;
  /** W-5 — unread count for events this action represents (e.g. new-job → job notifications). */
  badge?: number;
}) {
  // `position: relative` so the corner badge anchors to the tile/row. Merged rather than mutated so
  // the shared style objects are not aliased.
  const containerStyle = { ...(variant === 'tile' ? tileStyle : rowStyle), position: 'relative' as const };
  const tintColor = colorForTint(action.tint);

  // quick-actions-wiring-2026-06-22 — the Clock tile flips its label +
  // glyph based on whether the user is currently clocked in. "Clock
  // In/Out" stays the catalog default for screen readers; the visible
  // label and the tint just track session state.
  const isClockTile = action.actionId === 'clock-in-out';
  const displayLabel = isClockTile
    ? (clockedIn ? 'Clock Out' : 'Clock In')
    : action.label;
  const displayIcon = isClockTile && clockedIn ? '■' : glyphFor(action);
  const liveTint = isClockTile && clockedIn ? 'var(--theme-danger)' : tintColor;

  const inner = (
    <>
      {/* admin-ui-alignment-2026-08-14 — the glyph sits in a tinted disc.
       *
       * `colorForTint` was applied as the glyph's text colour, and every icon in the fallback table
       * is a colour emoji, which ignores `color` entirely. The tint each catalog entry declares —
       * and the colour a user picks for their own link — was therefore invisible on every tile. The
       * disc behind the glyph shows it whatever the glyph is, and still tints the character itself
       * for the text-presentation ones (★, ✓, ✎). */}
      <GlyphDisc glyph={displayIcon} color={liveTint} size={variant === 'tile' ? 32 : 26} />
      {displayStyle === 'icon-label' && (
        <span style={{ fontSize: 'var(--hub-font-sm, 0.875rem)', fontWeight: 500 }}>{displayLabel}</span>
      )}
      {badge > 0 && (
        <span
          aria-label={`${badge} new`}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: 'var(--theme-danger)',
            color: 'var(--theme-accent-fg)',
            fontSize: '0.625rem',
            fontWeight: 700,
            lineHeight: '16px',
            textAlign: 'center',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  );

  if (action.kind === 'link' && action.href) {
    // A user-authored link may point off-site. next/link is for in-app routes only, and an external
    // target gets its own tab plus `noopener` so the opened page cannot reach back through
    // `window.opener` into an authenticated admin session.
    if (isExternalHref(action.href)) {
      return (
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          role="listitem"
          style={containerStyle}
          aria-label={action.label}
          title={action.description}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link href={action.href} role="listitem" style={containerStyle} aria-label={action.label} title={action.description}>
        {inner}
      </Link>
    );
  }

  // Action-kind: dispatch via the widget-provided handler. Unknown
  // action ids still render as a disabled "Coming soon" pill.
  if (action.kind === 'action' && action.actionId) {
    const hasHandler = action.actionId === 'clock-in-out';
    if (hasHandler) {
      return (
        <button
          type="button"
          role="listitem"
          onClick={() => onDispatch(action.actionId!)}
          style={{ ...containerStyle, border: 'none', cursor: 'pointer' }}
          aria-label={displayLabel}
          title={action.description}
        >
          {inner}
        </button>
      );
    }
  }

  return (
    <button
      type="button"
      role="listitem"
      disabled
      style={{ ...containerStyle, opacity: 0.7, cursor: 'not-allowed', border: 'none' }}
      aria-label={`${action.label} (coming soon)`}
      title="Coming soon"
    >
      {inner}
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

export function colsForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 1;
    case 'small': return 2;
    case 'medium': return 3;
    case 'large': return 4;
    case 'xlarge': return 6;
  }
}

export function capForBucket(bucket: ReturnType<typeof sizeBucket>): number {
  switch (bucket) {
    case 'tiny': return 2;
    case 'small': return 4;
    case 'medium': return 6;
    case 'large': return 12;
    case 'xlarge': return 24;
  }
}

function colorForTint(tint: QuickActionDef['tint']): string {
  switch (tint) {
    case 'success': return 'var(--theme-success)';
    case 'warning': return 'var(--theme-warning)';
    case 'info':    return 'var(--theme-info)';
    case 'danger':  return 'var(--theme-danger)';
    case 'accent':
    case undefined: return 'var(--theme-accent)';
  }
}

/** The glyph in its tinted disc. One component so the tile, the row and the settings preview cannot
 *  drift apart. */
function GlyphDisc({ glyph, color, size }: { glyph: string; color: string; size: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        fontSize: `${Math.round(size * 0.55)}px`,
        color,
        lineHeight: 1,
      }}
    >
      {glyph}
    </span>
  );
}

/** The glyph a tile shows: a user-authored action carries its own; a catalog action is looked up. */
function glyphFor(action: Pick<QuickActionDef, 'glyph' | 'iconName'>): string {
  return action.glyph || emojiForAction(action.iconName);
}

function emojiForAction(iconName: string): string {
  // Same fallback table style as pinned-pages — replaced with real
  // lucide components in slice 100.
  const map: Record<string, string> = {
    Clock: '⏱',
    FilePlus: '➕',
    BadgeCheck: '✔︎',
    FileBarChart: '📊',
    PenTool: '✏️',
    MessageSquarePlus: '💬',
    Camera: '📷',
    Calendar: '🗓',
  };
  return map[iconName] ?? '⚡';
}

// ─── Style fragments ───────────────────────────────────────────────────

const listFillStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
  height: '100%',
};

const tileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-2, 8px)',
  borderRadius: 8,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  textAlign: 'center' as const,
  minHeight: 56,
  font: 'inherit',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  background: 'var(--theme-bg-elevated)',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  width: '100%',
  font: 'inherit',
  textAlign: 'left' as const,
};

const settingsLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

const chosenRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
};

// 28px is the floor in docs/admin-styling-contract.md — nothing interactive renders under it. These
// were 24px, which is the size the alignment sweep fails as `small-target`.
const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 4,
  width: 28,
  height: 28,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
};

/** Form controls in the settings panel. Height comes from the token so the field and the button
 *  beside it line up — see docs/admin-styling-contract.md. */
const fieldStyle: React.CSSProperties = {
  width: '100%',
  height: 'var(--input-height, 40px)',
  boxSizing: 'border-box',
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  font: 'inherit',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};

const primaryBtnStyle: React.CSSProperties = {
  height: 'var(--button-height, 40px)',
  padding: '0 14px',
  borderRadius: 6,
  border: '1px solid var(--theme-accent)',
  background: 'var(--theme-accent)',
  color: 'var(--theme-accent-fg)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  fontWeight: 500,
};

const textBtnStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 4,
  height: 28,
  padding: '0 8px',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  lineHeight: 1,
  flexShrink: 0,
};

const addChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 32,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};
