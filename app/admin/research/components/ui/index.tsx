'use client';

// app/admin/research/components/ui/index.tsx — the shared research primitives (Phase A2).
//
// ── WHY THESE EXIST ─────────────────────────────────────────────────────────────────────────────
//
// Ninety components under app/admin/research style themselves. That is why the portal reads as
// ninety separately authored screens, and why "restyle everything" was otherwise an unbounded job:
// there was no shared vocabulary to restyle. These six are that vocabulary. Later phases consume
// them; nothing else in the plan can start until they exist.
//
// ── ONE FILE, NOT SIX ───────────────────────────────────────────────────────────────────────────
//
// Each is small — the largest is forty lines — and they are always imported together. Six files
// plus a barrel would be more ceremony than code, and the barrel would be the only thing anyone
// imports anyway.
//
// ── THE STYLES TRAVEL WITH THEM ─────────────────────────────────────────────────────────────────
//
// `./primitives.css` is imported here, not added to AdminResearch.css. That stylesheet is
// route-scoped to /admin/research/**, and the last shared component to rely on a route-scoped
// sheet rendered unstyled on a route that did not import it — with nothing erroring. Third
// instance in this repo. A caller of these primitives cannot forget to bring the styles.

import React, { useCallback, useId, useRef, useState } from 'react';
import './primitives.css';

import { nextTabIndex } from '@/lib/admin/portal/tab-keyboard';

// ── Accordion ───────────────────────────────────────────────────────────────────────────────────

export interface AccordionProps {
  title: React.ReactNode;
  /** Shown beside the title when collapsed — e.g. "3 set". Lets a closed section still inform. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * A disclosure section.
 *
 * A real `<button>` rather than a div with onClick: it is focusable, Enter and Space activate it,
 * and screen readers announce it as a control, all without a keydown handler. `aria-expanded` and
 * `aria-controls` are what make the state audible rather than merely visible.
 */
export function Accordion({ title, summary, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="rui-accordion">
      <button
        type="button"
        className="rui-accordion__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {title}
          {summary !== undefined && <span className="rui-accordion__summary"> — {summary}</span>}
        </span>
        <span
          className={`rui-accordion__chevron${open ? ' rui-accordion__chevron--open' : ''}`}
          aria-hidden="true"
        >
          ▸
        </span>
      </button>
      {/* Rendered but hidden rather than unmounted, so form state inside survives a collapse.
          Losing what somebody typed because they folded a section is the modal-overlay bug again. */}
      <div className="rui-accordion__panel" id={panelId} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────────────────────────

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  /** Say what the CURRENT state means, not what the control is. See the paid-documents toggle. */
  help?: React.ReactNode;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * A labelled checkbox.
 *
 * The hand-rolled version of this exists in at least two places already (ProjectsTab, PipelineTab),
 * each with slightly different spacing. A native `<input type="checkbox">` inside a `<label>` is
 * used deliberately: the whole row becomes the hit target and the association needs no `htmlFor`.
 */
export function Toggle({ checked, onChange, label, help, disabled, ...rest }: ToggleProps) {
  return (
    <label className={`rui-toggle${disabled ? ' rui-toggle--disabled' : ''}`}>
      <input
        type="checkbox"
        className="rui-toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={rest['data-testid']}
      />
      <span>
        <span className="rui-toggle__label">{label}</span>
        {help !== undefined && <span className="rui-toggle__help">{help}</span>}
      </span>
    </label>
  );
}

// ── SegmentedTabs ───────────────────────────────────────────────────────────────────────────────

export interface SegmentedTab {
  id: string;
  label: React.ReactNode;
  /** Optional count badge. `0` renders — "0 documents" is information, not absence. */
  count?: number;
  /** id of the element this tab controls, so `aria-controls` can point at something real. */
  panelId?: string;
}

export interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeId: string;
  onChange: (id: string) => void;
  'aria-label': string;
}

/**
 * Which tab an arrow key should move to — `null` for a key this bar does not handle.
 *
 * Pure because it is the only part of the tablist keyboard contract that can be WRONG in an
 * interesting way: the wrap at both ends, and Home/End on a one-tab bar. There is no React testing
 * library in this repo, so a rendered keydown cannot be asserted; this keeps the arithmetic under a
 * real test instead of under a regex that checks the source merely mentions `ArrowRight`.
 *
 * **Moved to `lib/admin/portal/tab-keyboard.ts`** when a second consumer appeared: seventeen admin
 * portals declare `role="tablist"`, three implement no keyboard at all, and the shell has no
 * business importing a research component. Re-exported here so this file's tests and the primitive
 * keep pointing at ONE implementation — two copies of a keyboard contract is how one of them ends
 * up missing Home/End, which is exactly what had happened across those seventeen bars.
 */
export { nextTabIndex } from '@/lib/admin/portal/tab-keyboard';

/**
 * An in-page tab bar. Phase B splits the 3,654-line project page with this.
 *
 * `role="tablist"` with `aria-selected` rather than styled links: these switch a panel in place,
 * they do not navigate, and announcing them as links would promise a page change that never comes.
 *
 * ── ROVING TABINDEX (Phase F1) ────────────────────────────────────────────────────────────────
 *
 * Claiming `role="tablist"` is a PROMISE about the keyboard, and the first version of this made
 * the promise without keeping it. A screen reader announces "tab 2 of 5" and the user reaches for
 * an arrow key, because that is what the role means; the arrow key did nothing, and Tab walked
 * through every tab one at a time on the way to the panel.
 *
 * So: exactly one tab is in the tab order (`tabIndex={0}`, the selected one) and the rest are
 * `-1`. Arrow keys move selection and focus together, Home and End jump to the ends, and the
 * whole bar is a single Tab stop. This is the WAI-ARIA "tabs with automatic activation" pattern —
 * chosen over manual activation because these panels are already mounted, so moving selection
 * costs nothing and a second keypress to confirm would just be ceremony.
 *
 * The alternative was to drop the role and let them be plain buttons. That was rejected: the
 * grouping and the "2 of 5" position are genuinely useful, and the fix is fifteen lines.
 */
export function SegmentedTabs({ tabs, activeId, onChange, ...rest }: SegmentedTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = useCallback(
    (index: number) => {
      const wrapped = ((index % tabs.length) + tabs.length) % tabs.length;
      const tab = tabs[wrapped];
      if (!tab) return;
      onChange(tab.id);
      // Focus follows selection. Without this the ring stays on the tab you left, and the reader
      // announces a tab you are no longer on — worse than no arrow support at all.
      refs.current[wrapped]?.focus();
    },
    [tabs, onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = nextTabIndex(e.key, index, tabs.length);
    if (target === null) return;
    e.preventDefault();
    focusTab(target);
  };

  return (
    <div className="rui-tabs" role="tablist" aria-label={rest['aria-label']}>
      {tabs.map((t, i) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            ref={(el) => { refs.current[i] = el; }}
            aria-selected={active}
            aria-controls={t.panelId}
            tabIndex={active ? 0 : -1}
            className={`rui-tabs__tab${active ? ' rui-tabs__tab--active' : ''}`}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className="rui-tabs__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── SectionHeader ───────────────────────────────────────────────────────────────────────────────

export interface SectionHeaderProps {
  title: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}

/** Title, optional count, optional right-hand action. Six panels reinvent this shape. */
export function SectionHeader({ title, count, action }: SectionHeaderProps) {
  return (
    <div className="rui-section-header">
      <div className="rui-section-header__titles">
        <h3 className="rui-section-header__title">{title}</h3>
        {count !== undefined && <span className="rui-section-header__count">{count}</span>}
      </div>
      {action !== undefined && <div className="rui-section-header__action">{action}</div>}
    </div>
  );
}

// ── StatPill ────────────────────────────────────────────────────────────────────────────────────

export type StatTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

export interface StatPillProps {
  children: React.ReactNode;
  tone?: StatTone;
  title?: string;
}

/**
 * The status chip six panels reinvent.
 *
 * Tone is a named meaning rather than a colour, so a caller writes `tone="bad"` and cannot pick a
 * red that means nothing. The text is always present — colour is never the only carrier of the
 * signal, because for some readers it carries nothing.
 */
export function StatPill({ children, tone = 'neutral', title }: StatPillProps) {
  return (
    <span className={`rui-stat-pill rui-stat-pill--${tone}`} title={title}>
      {children}
    </span>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  title: React.ReactNode;
  /** What to do about it. An empty state that only says "nothing here" wastes the moment. */
  body?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, body, icon, action }: EmptyStateProps) {
  return (
    <div className="rui-empty">
      {icon !== undefined && <div className="rui-empty__icon" aria-hidden="true">{icon}</div>}
      <div className="rui-empty__title">{title}</div>
      {body !== undefined && <div className="rui-empty__body">{body}</div>}
      {action !== undefined && <div className="rui-empty__action">{action}</div>}
    </div>
  );
}
