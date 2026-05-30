'use client';
// lib/hub/widgets/bookmarks/index.tsx
//
// Bookmarks widget. Free-form alternative to Pinned Pages — each
// bookmark is a user-defined {label, url, icon} tuple stored in the
// widget's content. Renders a grid or list of links.
//
// Slice 115 of customizable-hub-and-work-mode-2026-05-28.md.

import React from 'react';
import { defineWidget, type WidgetProps, type WidgetSettingsFormProps } from '@/lib/hub/widget-registry';
import { sizeBucket, type SizeBucket } from '@/lib/hub/size-bucket';
import WidgetEmpty from '@/lib/hub/components/WidgetEmpty';
import { isValidBookmarkUrl, safeBookmarks } from './url';
import { moveUp, moveDown } from '@/lib/hub/widgets/_shared/ordered-list';

export interface Bookmark {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface BookmarksContent extends Record<string, unknown> {
  bookmarks: Bookmark[];
  layoutStyle: 'grid' | 'list';
}

const DEFAULTS: BookmarksContent = {
  bookmarks: [],
  layoutStyle: 'grid',
};

function BookmarksWidget({ size, content }: WidgetProps<BookmarksContent>) {
  const settings = { ...DEFAULTS, ...content };
  const bucket = sizeBucket(size.w, size.h);

  // R2 — only render bookmarks with a safe, complete URL (never a
  // javascript:/data:/blank/unfinished link).
  const renderable = safeBookmarks(settings.bookmarks);

  if (renderable.length === 0) {
    return (
      <WidgetEmpty
        icon="🔖"
        title="No bookmarks yet"
        description="Add quick links to anywhere in the settings panel."
      />
    );
  }

  // ── Tiny: the bookmark count (a label list doesn't fit a 1×1 cell).
  if (bucket === 'tiny') {
    return (
      <div style={tinyWrapStyle}>
        <span style={tinyCountStyle}>{renderable.length}</span>
        <span style={tinyLabelStyle}>bookmarks</span>
      </div>
    );
  }

  const cap = capForBucket(bucket);
  const visible = renderable.slice(0, cap);

  if (settings.layoutStyle === 'list') {
    return (
      <ul role="list" style={listStyle}>
        {visible.map((b) => (
          <li key={b.id}>
            <a href={b.url} target={isExternal(b.url) ? '_blank' : undefined} rel="noopener noreferrer" style={rowStyle}>
              <span style={iconStyle} aria-hidden>{b.icon ?? '🔗'}</span>
              <span style={titleStyle}>{b.label}</span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  const cols = colsForBucket(bucket);
  return (
    <div role="list" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 'var(--hub-spc-3, 12px)' }}>
      {visible.map((b) => (
        <a
          key={b.id}
          href={b.url}
          target={isExternal(b.url) ? '_blank' : undefined}
          rel="noopener noreferrer"
          role="listitem"
          style={tileStyle}
        >
          <span style={tileIconStyle} aria-hidden>{b.icon ?? '🔗'}</span>
          <span style={tileLabelStyle}>{b.label}</span>
        </a>
      ))}
    </div>
  );
}

function BookmarksSettings({ value, onChange }: WidgetSettingsFormProps<BookmarksContent>) {
  const settings = { ...DEFAULTS, ...value };

  function addBookmark() {
    onChange({
      ...settings,
      bookmarks: [
        ...settings.bookmarks,
        { id: makeId(), label: 'New bookmark', url: 'https://', icon: '' },
      ],
    });
  }

  function updateBookmark(id: string, patch: Partial<Bookmark>) {
    onChange({
      ...settings,
      bookmarks: settings.bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  }

  function removeBookmark(id: string) {
    onChange({ ...settings, bookmarks: settings.bookmarks.filter((b) => b.id !== id) });
  }

  function reorder(index: number, dir: 'up' | 'down') {
    const next = dir === 'up' ? moveUp(settings.bookmarks, index) : moveDown(settings.bookmarks, index);
    onChange({ ...settings, bookmarks: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-3, 12px)' }}>
      <label>
        <span style={labelStyle}>Layout</span>
        <select
          value={settings.layoutStyle}
          onChange={(e) => onChange({ ...settings, layoutStyle: e.target.value as 'grid' | 'list' })}
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </label>

      <fieldset style={{ border: '1px solid var(--theme-border)', borderRadius: 6, padding: 'var(--hub-spc-3, 12px)' }}>
        <legend style={labelStyle}>Bookmarks</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hub-spc-2, 8px)' }}>
          {settings.bookmarks.map((b, i) => {
            // Inline validation — flag a non-empty URL that isn't safe to
            // render (R2). A blank URL is a not-yet-filled draft, not an
            // error.
            const urlInvalid = b.url.trim().length > 0 && !isValidBookmarkUrl(b.url);
            return (
              <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--hub-spc-2, 8px)', borderRadius: 4, background: 'var(--theme-bg-elevated)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={b.label}
                    placeholder="Label"
                    onChange={(e) => updateBookmark(b.id, { label: e.target.value })}
                    style={{ ...textInputStyle, flex: 1 }}
                  />
                  <button type="button" aria-label="Move bookmark up" disabled={i === 0}
                    onClick={() => reorder(i, 'up')} style={iconBtnStyle}>↑</button>
                  <button type="button" aria-label="Move bookmark down" disabled={i === settings.bookmarks.length - 1}
                    onClick={() => reorder(i, 'down')} style={iconBtnStyle}>↓</button>
                </div>
                <input
                  type="url"
                  value={b.url}
                  placeholder="https://example.com or /admin/jobs"
                  aria-invalid={urlInvalid || undefined}
                  onChange={(e) => updateBookmark(b.id, { url: e.target.value })}
                  style={{ ...textInputStyle, borderColor: urlInvalid ? 'var(--theme-danger)' : 'var(--theme-border)' }}
                />
                {urlInvalid && (
                  <span style={{ fontSize: 'var(--hub-font-xs, 0.75rem)', color: 'var(--theme-danger)' }}>
                    Enter a full http(s):// URL or an internal /path.
                  </span>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={b.icon ?? ''}
                    placeholder="Icon (emoji)"
                    onChange={(e) => updateBookmark(b.id, { icon: e.target.value })}
                    style={{ ...textInputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => removeBookmark(b.id)} style={removeButtonStyle}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={addBookmark} style={addButtonStyle}>
            + Add bookmark
          </button>
        </div>
      </fieldset>
    </div>
  );
}

defineWidget<BookmarksContent>({
  id: 'bookmarks',
  label: 'Bookmarks',
  description: 'Quick links to anywhere — internal or external.',
  category: 'personal',
  iconName: 'Bookmark',
  defaultSize: { w: 4, h: 2 },
  // Slice 217 — minSize lowered to 1×1; widget already had a tiny bucket render.
  minSize: { w: 1, h: 1 },
  maxSize: { w: 8, h: 6 },
  defaultContent: DEFAULTS,
  allowedRoles: [],
  Widget: BookmarksWidget,
  SettingsForm: BookmarksSettings,
});

// ─── Helpers (exported for tests) ────────────────────────────────────

export function capForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 2;
    case 'small':  return 4;
    case 'medium': return 6;
    case 'large':  return 12;
    case 'xlarge': return 24;
  }
}

export function colsForBucket(bucket: SizeBucket): number {
  switch (bucket) {
    case 'tiny':   return 1;
    case 'small':  return 2;
    case 'medium': return 3;
    case 'large':  return 4;
    case 'xlarge': return 6;
  }
}

export function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url) && !url.startsWith('/');
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

const tinyWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 2,
};
const tinyCountStyle: React.CSSProperties = {
  fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--theme-accent)',
};
const tinyLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-xs, 0.75rem)',
  color: 'var(--theme-fg-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const iconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  borderRadius: 4,
  width: 24,
  height: 24,
  cursor: 'pointer',
  fontSize: '0.85rem',
  lineHeight: 1,
  flexShrink: 0,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hub-spc-2, 8px)',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-2, 8px) var(--hub-spc-3, 12px)',
  borderRadius: 6,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
};

const iconStyle: React.CSSProperties = {
  fontSize: '1rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--hub-spc-2, 8px)',
  padding: 'var(--hub-spc-3, 12px) var(--hub-spc-2, 8px)',
  borderRadius: 8,
  background: 'var(--theme-bg-elevated)',
  textDecoration: 'none',
  color: 'var(--theme-fg-primary)',
  textAlign: 'center' as const,
  minHeight: 56,
};

const tileIconStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  lineHeight: 1,
};

const tileLabelStyle: React.CSSProperties = {
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 500,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
  fontWeight: 600,
  marginBottom: 4,
};

const textInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--theme-border)',
  background: 'var(--theme-bg-surface)',
  color: 'var(--theme-fg-primary)',
  fontSize: '0.85rem',
};

const removeButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--theme-danger)',
  background: 'transparent',
  color: 'var(--theme-danger)',
  cursor: 'pointer',
  fontSize: '0.75rem',
};

const addButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px dashed var(--theme-border)',
  background: 'transparent',
  color: 'var(--theme-fg-secondary)',
  cursor: 'pointer',
  fontSize: 'var(--hub-font-sm, 0.875rem)',
};
