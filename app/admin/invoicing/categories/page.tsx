// app/admin/invoicing/categories/page.tsx
//
// Phase-2 Slice 11 (UI) of
// docs/planning/completed/CUSTOMER_INVOICING_PHASE2_2026-06-21.md.
//
// Editor for the seed-374 financial_allocation_categories rows. Dad
// sets the target percentage for each spending bucket (equipment /
// salaries / savings / investing / etc.); the allocation engine
// (slice 8) uses those percentages to split every cleared payment.
//
// Validation runs inline via the slice-11 helpers — typing an
// out-of-range percent or a key whose siblings don&rsquo;t sum to
// 100 surfaces an inline error and disables the save button. No
// "+ New category" or "delete" affordances in this cut; the seeded
// 18-category default list is comprehensive, and the schema&rsquo;s
// `is_active` + ON DELETE RESTRICT semantics need their own slice.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  previewEdit,
  type EditableCategory,
} from '@/lib/payments/category-editor';

interface CategoryRow extends EditableCategory {
  created_at?: string;
  updated_at?: string;
}

export default function CategoriesEditorPage(): React.ReactElement {
  const { data: session, status } = useSession();
  const roles = (session?.user?.roles ?? []) as string[];
  const canView = roles.includes('admin') || roles.includes('developer');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [original, setOriginal] = useState<CategoryRow[]>([]);
  const [draft, setDraft] = useState<CategoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/invoicing/categories', { cache: 'no-store' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { categories: CategoryRow[] };
      setOriginal(data.categories);
      setDraft(data.categories.map((c) => ({ ...c })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated' && canView) void load();
  }, [status, canView, load]);

  const preview = useMemo(() => previewEdit(original, draft), [original, draft]);
  const hasChanges = preview.delta.modified.length > 0 || preview.delta.added.length > 0 || preview.delta.removed.length > 0;

  const updatePercent = (id: string, value: number) => {
    setSaveMessage(null);
    setDraft((cur) =>
      cur.map((c) => (c.id === id ? { ...c, target_percent: Number.isFinite(value) ? value : 0 } : c)),
    );
  };

  const onReset = () => {
    setDraft(original.map((c) => ({ ...c })));
    setSaveMessage(null);
  };

  const onSave = async () => {
    if (!preview.validation.valid || saving) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const body = {
        categories: preview.delta.modified.map((m) => ({
          id: m.after.id,
          target_percent: m.after.target_percent,
        })),
      };
      const res = await fetch('/api/admin/invoicing/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updated_count?: number;
        validation?: { errors?: { message: string }[] };
      };
      if (!res.ok) {
        const validationMsg = data.validation?.errors?.[0]?.message;
        throw new Error(validationMsg ?? data.error ?? `HTTP ${res.status}`);
      }
      setSaveMessage(`Saved ${data.updated_count ?? 0} categor${(data.updated_count ?? 0) === 1 ? 'y' : 'ies'}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Auth gating mirrors the parent route ─────────────────────────
  if (status === 'loading') return <Shell><p style={styles.muted}>Loading session&hellip;</p></Shell>;
  if (status === 'unauthenticated' || !session?.user) {
    return (
      <Shell>
        <Gate
          title="Sign in required"
          body="The category editor is admin- and developer-only."
          actionHref="/api/auth/signin"
          actionLabel="Sign in"
        />
      </Shell>
    );
  }
  if (!canView) {
    return (
      <Shell>
        <Gate
          title="Access denied"
          body={`This page is admin/developer-only. You're signed in as ${session.user.email}.`}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <header style={styles.header}>
        <div>
          <Link href="/admin/invoicing" style={styles.back}>&larr; Back to invoicing</Link>
          <h1 style={styles.h1}>Allocation categories</h1>
          <p style={styles.subtitle}>
            Set the target percentage of every cleared payment that flows into each bucket. Active
            percentages must total exactly <strong>100%</strong>.
          </p>
        </div>
      </header>

      {error && <div style={styles.errorBanner} role="alert">{error}</div>}
      {saveMessage && <div style={styles.successBanner} role="status">{saveMessage}</div>}

      {loading ? (
        <p style={styles.muted}>Loading categories&hellip;</p>
      ) : (
        <>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Bucket</th>
                  <th style={styles.thRight}>Target %</th>
                  <th style={styles.thRight}>Actual % (after edit)</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((c) => {
                  const modified = preview.delta.modified.find((m) => m.category_key === c.category_key);
                  return (
                    <tr key={c.id}>
                      <td style={styles.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {c.color && (
                            <span aria-hidden="true" style={{ ...styles.swatch, background: c.color }} />
                          )}
                          <div>
                            <div style={styles.tdLabel}>{c.label}</div>
                            <code style={styles.tdKey}>{c.category_key}</code>
                          </div>
                        </div>
                      </td>
                      <td style={styles.tdRight}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min={0}
                          max={100}
                          value={c.target_percent}
                          disabled={!c.is_active}
                          onChange={(e) => updatePercent(c.id, parseFloat(e.target.value))}
                          style={styles.percentInput}
                          aria-label={`Target percent for ${c.label}`}
                        />
                      </td>
                      <td style={styles.tdRight}>
                        {c.is_active ? `${roundTo(2, Number(c.target_percent))}%` : <span style={styles.muted}>archived</span>}
                      </td>
                      <td style={styles.td}>
                        {modified ? (
                          <span style={styles.changedPill}>changed</span>
                        ) : (
                          <span style={styles.muted}>&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={styles.tdFoot}><strong>Total of active buckets</strong></td>
                  <td style={styles.tdFootRight}>
                    <strong
                      style={{
                        color: preview.validation.valid ? '#059669' : '#DC2626',
                      }}
                    >
                      {preview.validation.total_active_percent}%
                    </strong>
                  </td>
                  <td style={styles.tdFootRight}>
                    {preview.percent_delta !== 0 && (
                      <span style={styles.muted}>
                        {preview.percent_delta > 0 ? '+' : ''}{preview.percent_delta} from saved
                      </span>
                    )}
                  </td>
                  <td style={styles.tdFoot} />
                </tr>
              </tfoot>
            </table>
          </div>

          {preview.validation.errors.length > 0 && (
            <ul style={styles.errorList} role="alert">
              {preview.validation.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          {preview.validation.warnings.length > 0 && (
            <ul style={styles.warningList} role="status">
              {preview.validation.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          )}

          <div style={styles.actions}>
            <button
              type="button"
              onClick={onReset}
              disabled={!hasChanges || saving}
              style={{ ...styles.btn, ...styles.btnGhost }}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!hasChanges || !preview.validation.valid || saving}
              style={{
                ...styles.btn,
                ...styles.btnPrimary,
                opacity: (!hasChanges || !preview.validation.valid || saving) ? 0.55 : 1,
              }}
            >
              {saving ? 'Saving…' : `Save ${preview.delta.modified.length} change${preview.delta.modified.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}

// ── Layout pieces ───────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }): React.ReactElement {
  return <main style={styles.shell}>{children}</main>;
}

function Gate({
  title, body, actionHref, actionLabel,
}: {
  title: string; body: string; actionHref?: string; actionLabel?: string;
}): React.ReactElement {
  return (
    <div style={styles.gate}>
      <h2 style={styles.gateTitle}>{title}</h2>
      <p style={styles.gateBody}>{body}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} style={styles.gateAction}>{actionLabel}</Link>
      )}
    </div>
  );
}

function roundTo(places: number, n: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 1080, margin: '0 auto', padding: '2rem 1.5rem',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#0F1419',
  },
  back: { color: '#6B7280', textDecoration: 'none', fontSize: '0.82rem' },
  header: { marginBottom: '1.25rem' },
  h1: { fontFamily: 'Sora, sans-serif', fontSize: '1.65rem', margin: '0.4rem 0 0.4rem', fontWeight: 600 },
  subtitle: { color: '#4B5563', margin: 0, fontSize: '0.92rem', lineHeight: 1.55 },
  errorBanner: {
    background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B',
    padding: '0.75rem 1rem', borderRadius: 8, margin: '0 0 1rem', fontSize: '0.88rem',
  },
  successBanner: {
    background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46',
    padding: '0.75rem 1rem', borderRadius: 8, margin: '0 0 1rem', fontSize: '0.88rem',
  },
  tableWrap: { background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0 },
  th: {
    textAlign: 'left', padding: '0.55rem 0.85rem', background: '#F9FAFB',
    borderBottom: '1px solid #E5E7EB', fontSize: '0.74rem',
    textTransform: 'uppercase', color: '#4B5563', fontWeight: 600, letterSpacing: 0.04,
  },
  thRight: {
    textAlign: 'right', padding: '0.55rem 0.85rem', background: '#F9FAFB',
    borderBottom: '1px solid #E5E7EB', fontSize: '0.74rem',
    textTransform: 'uppercase', color: '#4B5563', fontWeight: 600, letterSpacing: 0.04,
  },
  td: { padding: '0.65rem 0.85rem', borderBottom: '1px solid #F3F4F6', fontSize: '0.9rem', verticalAlign: 'middle' },
  tdRight: { padding: '0.65rem 0.85rem', borderBottom: '1px solid #F3F4F6', fontSize: '0.9rem', verticalAlign: 'middle', textAlign: 'right' },
  tdFoot: { padding: '0.7rem 0.85rem', borderTop: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: '0.9rem' },
  tdFootRight: { padding: '0.7rem 0.85rem', borderTop: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: '0.9rem', textAlign: 'right' },
  tdLabel: { fontWeight: 600, fontSize: '0.92rem' },
  tdKey: { color: '#6B7280', fontSize: '0.74rem', fontFamily: 'JetBrains Mono, ui-monospace, monospace' },
  swatch: { width: 14, height: 14, borderRadius: 3, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 },
  percentInput: {
    width: 88, height: 32, padding: '0 0.5rem', fontSize: '0.9rem', textAlign: 'right',
    border: '1px solid #D1D5DB', borderRadius: 6, fontFamily: 'inherit',
  },
  changedPill: {
    display: 'inline-block', padding: '0.12rem 0.5rem', borderRadius: 999,
    fontSize: '0.7rem', fontWeight: 600,
    background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D',
    textTransform: 'uppercase', letterSpacing: 0.04,
  },
  errorList: { color: '#991B1B', margin: '0.85rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' },
  warningList: { color: '#92400E', margin: '0.85rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' },
  actions: { display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' },
  btn: {
    height: 36, padding: '0 1rem', borderRadius: 8, fontFamily: 'inherit',
    fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', border: '1px solid transparent',
  },
  btnGhost: { background: '#FFFFFF', color: '#374151', borderColor: '#E5E7EB' },
  btnPrimary: { background: '#1D3095', color: '#FFFFFF' },
  muted: { color: '#6B7280', fontSize: '0.85rem' },
  gate: {
    background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '2rem',
    maxWidth: 520, margin: '3rem auto', textAlign: 'center',
  },
  gateTitle: { fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', margin: '0 0 0.6rem' },
  gateBody: { color: '#4B5563', lineHeight: 1.6, margin: '0 0 0.85rem' },
  gateAction: {
    display: 'inline-block', background: '#1D3095', color: '#FFFFFF',
    padding: '0.55rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: '0.92rem',
  },
};
