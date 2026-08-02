'use client';
// app/AndrewAsh/studio/coaching/PackageEditor.tsx — the rate card.
//
// ── THE DEFAULTS ARE OFFERED, NOT ASSUMED ───────────────────────────────────────────────────────
//
// Until Andrew saves a package, the public coaching page renders the researched defaults from
// `lib/voice/settings.ts` — so the site is never priceless, which is the worst state for a page whose
// job is to convert. But those numbers are a starting point, not a decision, so this panel shows them
// as an explicit "use these" offer. One click turns a developer's research into HIS rate card, which
// is the moment they become his responsibility rather than a guess he inherited.
//
// The per-lesson figure is computed and shown beside every price, because that is the number a
// student compares and the one Andrew is actually setting. A $240 block is invisible until you see it
// is $60 a lesson.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { formatCents, parseCents } from '@/lib/voice/money';

interface Pkg {
  id: string;
  name: string;
  blurb: string;
  priceCents: number;
  sessionCount: number;
  sessionMinutes: number;
  highlighted: boolean;
  active: boolean;
  inclusions: string[];
}

interface DefaultPkg {
  name: string;
  blurb: string;
  priceCents: number;
  sessionCount: number;
  sessionMinutes: number;
  highlighted: boolean;
  inclusions: string[];
}

export default function PackageEditor({ packages, defaults }: { packages: Pkg[]; defaults: DefaultPkg[] }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; price: string; count: string; minutes: string; blurb: string }>({
    name: '',
    price: '',
    count: '1',
    minutes: '45',
    blurb: '',
  });

  async function call(method: string, body: Record<string, unknown> | null, key: string, query = ''): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/voice/coaching${query}`, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That did not work.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const perLesson = (cents: number, count: number): string => formatCents(Math.round(cents / Math.max(1, count)));

  return (
    <div className="vaPanel">
      <div className="vaPanelHead">
        <h2 className="vaPanelTitle">Your rates</h2>
        {packages.length > 0 && !editing && (
          <button
            type="button"
            className="vaBtn vaBtnOutline vaBtnSm"
            onClick={() => {
              setEditing('new');
              setDraft({ name: '', price: '', count: '1', minutes: '45', blurb: '' });
            }}
          >
            <Plus size={13} aria-hidden /> Add a package
          </button>
        )}
      </div>

      {error && (
        <div className="vaNotice vaNoticeBad" role="alert">
          {error}
        </div>
      )}

      {packages.length === 0 ? (
        <>
          <p className="vaMuted" style={{ fontSize: '0.9375rem', marginBottom: 16 }}>
            Your coaching page is currently showing these researched starting rates. They are set for a
            teacher with a music degree — above the $40–50 hobby-teacher line, below the $80–120 a
            master&rsquo;s commands. Adopt them and change what you disagree with.
          </p>
          <div className="vaGrid vaGrid3" style={{ marginBottom: 18 }}>
            {defaults.map((d) => (
              <div key={d.name} className="vaCard">
                <h3 className="vaCardTitle" style={{ fontSize: '1rem' }}>{d.name}</h3>
                <p className="vaPackagePrice" style={{ fontSize: '1.6rem' }}>{formatCents(d.priceCents)}</p>
                <p className="vaCardBody">
                  {d.sessionCount} × {d.sessionMinutes} min · {perLesson(d.priceCents, d.sessionCount)} a lesson
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="vaBtn vaBtnSolid vaBtnSm"
            disabled={busy === 'adopt'}
            onClick={async () => {
              setBusy('adopt');
              setError(null);
              try {
                // Sequential, not parallel: `highlighted` clears the others on write, and three
                // concurrent inserts would race over which one ends up highlighted.
                for (const [i, d] of defaults.entries()) {
                  const res = await fetch('/api/voice/coaching', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kind: 'package', ...d, sortOrder: i }),
                  });
                  if (!res.ok) throw new Error('Could not save those.');
                }
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save those.');
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'adopt' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Check size={14} aria-hidden />}
            Use these as my rates
          </button>
        </>
      ) : (
        <table className="vaDataTable">
          <thead>
            <tr>
              <th>Package</th>
              <th className="vaNum">Price</th>
              <th className="vaNum">Per lesson</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} style={p.active ? undefined : { opacity: 0.5 }}>
                <td data-label="Package">
                  <span style={{ color: 'var(--va-text)', fontWeight: 600 }}>{p.name}</span>
                  {p.highlighted && <span className="vaStatusPill vaStatusNew" style={{ marginLeft: 8 }}>Most popular</span>}
                  {!p.active && <span className="vaStatusPill" style={{ marginLeft: 8 }}>Hidden</span>}
                  <span style={{ display: 'block', color: 'var(--va-text-muted)', fontSize: '0.8125rem' }}>
                    {p.sessionCount} × {p.sessionMinutes} min
                  </span>
                </td>
                <td data-label="Price" className="vaNum">
                  {editing === p.id ? (
                    <input
                      className="vaInput"
                      style={{ maxWidth: 110 }}
                      inputMode="decimal"
                      defaultValue={(p.priceCents / 100).toFixed(2)}
                      onBlur={(e) => {
                        const cents = parseCents(e.target.value);
                        if (cents !== p.priceCents) void call('PATCH', { kind: 'package', id: p.id, priceCents: cents }, `p-${p.id}`);
                        setEditing(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button type="button" className="vaInlineEdit" onClick={() => setEditing(p.id)}>
                      {formatCents(p.priceCents)}
                    </button>
                  )}
                </td>
                <td data-label="Per lesson" className="vaNum vaMuted">{perLesson(p.priceCents, p.sessionCount)}</td>
                <td data-label="">
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!p.highlighted && (
                      <button
                        type="button"
                        className="vaBtn vaBtnGhost vaBtnSm"
                        title="Mark as most popular"
                        disabled={busy === `h-${p.id}`}
                        onClick={() => void call('PATCH', { kind: 'package', id: p.id, highlighted: true }, `h-${p.id}`)}
                      >
                        <Star size={12} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      className="vaBtn vaBtnGhost vaBtnSm"
                      disabled={busy === `a-${p.id}`}
                      onClick={() => void call('PATCH', { kind: 'package', id: p.id, active: !p.active }, `a-${p.id}`)}
                    >
                      {p.active ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="vaBtn vaBtnGhost vaBtnSm"
                      style={{ color: 'var(--va-danger)' }}
                      disabled={busy === `d-${p.id}`}
                      onClick={() => {
                        if (!window.confirm(`Remove "${p.name}"? If students are on it, it will just be hidden.`)) return;
                        void call('DELETE', null, `d-${p.id}`, `?kind=package&id=${encodeURIComponent(p.id)}`);
                      }}
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing === 'new' && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--va-line)', paddingTop: 18 }}>
          <div className="vaFieldRow vaFieldRow2">
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-pk-name">Name</label>
              <input id="va-pk-name" className="vaInput" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-pk-price">Price</label>
              <input id="va-pk-price" className="vaInput" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </div>
          </div>
          <div className="vaFieldRow vaFieldRow2">
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-pk-count">Lessons</label>
              <input id="va-pk-count" className="vaInput" inputMode="numeric" value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })} />
            </div>
            <div className="vaField">
              <label className="vaLabel" htmlFor="va-pk-mins">Minutes each</label>
              <input id="va-pk-mins" className="vaInput" inputMode="numeric" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: e.target.value })} />
            </div>
          </div>
          <div className="vaField">
            <label className="vaLabel" htmlFor="va-pk-blurb">One line about it</label>
            <input id="va-pk-blurb" className="vaInput" value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} />
          </div>
          <div className="vaStudioActions">
            <button
              type="button"
              className="vaBtn vaBtnSolid vaBtnSm"
              disabled={busy === 'new' || !draft.name.trim()}
              onClick={async () => {
                const ok = await call(
                  'POST',
                  {
                    kind: 'package',
                    name: draft.name,
                    blurb: draft.blurb,
                    priceCents: parseCents(draft.price || '0'),
                    sessionCount: Number(draft.count) || 1,
                    sessionMinutes: Number(draft.minutes) || 45,
                    sortOrder: packages.length,
                  },
                  'new',
                );
                if (ok) setEditing(null);
              }}
            >
              {busy === 'new' ? <Loader2 size={14} aria-hidden className="vaSpin" /> : <Plus size={14} aria-hidden />}
              Add it
            </button>
            <button type="button" className="vaBtn vaBtnGhost vaBtnSm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {packages.length > 0 && (
        <p className="vaHint" style={{ marginTop: 14 }}>
          Click a price to change it. Existing students keep what they agreed to — that lives on their
          contract and invoice, not here.
        </p>
      )}
    </div>
  );
}
