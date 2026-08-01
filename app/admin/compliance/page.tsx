'use client';
// app/admin/compliance/page.tsx — the compliance surface §3 says is missing (Phase 2 item 12, 8m).
//
// *"CE hours, license renewal, COI expiry, and vehicle registration/inspection are all business-
// critical dates with no home."* This is the home.
//
// ── THE MISSING-DATE PANEL IS NOT A NICETY ──────────────────────────────────────────────────────
//
// A page that lists only the obligations it knows about reports "all clear" for a firm that has
// recorded nothing — which is every firm on day one, and this one today (`equipment_inventory` has
// 0 rows). So "nothing on record" is rendered as loudly as "expired", because for a signing surveyor
// an instrument with no calibration history is not a gap in the software, it is a liability.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, FileWarning, Plus, ShieldCheck } from 'lucide-react';
import type { ComplianceItem, ComplianceSummary, UnrecordedObligation } from '@/lib/compliance/register';
import { describeDeadline } from '@/lib/compliance/register';

const STATE_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  expired: { label: 'Expired', color: 'var(--danger-fg, #b42318)', bg: 'var(--danger-bg, #fef3f2)' },
  critical: { label: 'Critical', color: 'var(--warn-fg, #b54708)', bg: 'var(--warn-bg, #fffaeb)' },
  due: { label: 'Due soon', color: 'var(--accent-fg, #175cd3)', bg: 'var(--accent-bg, #eff8ff)' },
  ok: { label: 'Current', color: 'var(--ok-fg, #027a48)', bg: 'var(--ok-bg, #ecfdf3)' },
  no_expiry: { label: 'No expiry', color: 'var(--muted-fg, #475467)', bg: 'var(--muted-bg, #f9fafb)' },
};

const SUBJECT_LABEL: Record<string, string> = {
  employee: 'Person',
  vehicle: 'Vehicle',
  equipment: 'Instrument',
  organization: 'The firm',
};

export default function CompliancePage() {
  const [items, setItems] = useState<ComplianceItem[] | null>(null);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [unrecorded, setUnrecorded] = useState<UnrecordedObligation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'insurance', identifier: '', issuing_authority: '', expires_on: '', renewal_lead_days: 60 });

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/admin/compliance', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || `Could not load the register (${r.status}).`); setItems([]); return; }
      setItems(j.items ?? []);
      setSummary(j.summary ?? null);
      setUnrecorded(j.unrecorded ?? []);
    } catch {
      // Named. A blank compliance page reads as "all clear", which is the worst possible way for
      // this screen in particular to fail.
      setError('Could not reach the server. This page is showing nothing because it failed to load — not because everything is current.');
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch('/api/admin/compliance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error || 'Could not save.'); return; }
    setForm({ title: '', category: 'insurance', identifier: '', issuing_authority: '', expires_on: '', renewal_lead_days: 60 });
    setAdding(false);
    load();
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 0 60px' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, margin: 0 }}>
          <ShieldCheck size={22} aria-hidden /> Compliance
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--muted-fg, #475467)', fontSize: 14 }}>
          Licences, certifications, insurance, vehicle registration and instrument calibration — every
          date the firm gets caught out by, in one list.
        </p>
      </header>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 20 }}>
          {([
            ['Expired', summary.expired, 'expired', AlertTriangle],
            ['Critical', summary.critical, 'critical', AlertTriangle],
            ['Due soon', summary.due, 'due', CalendarClock],
            ['Current', summary.ok, 'ok', CheckCircle2],
            ['Nothing on record', unrecorded.length, 'no_expiry', FileWarning],
          ] as const).map(([label, count, state, Icon]) => (
            <div key={label} style={{ border: '1px solid var(--border, #e4e7ec)', borderRadius: 10, padding: '12px 14px', background: STATE_STYLE[state].bg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: STATE_STYLE[state].color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <Icon size={14} aria-hidden /> {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: STATE_STYLE[state].color }}>{count}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ border: '1px solid var(--danger-fg, #b42318)', background: 'var(--danger-bg, #fef3f2)', color: 'var(--danger-fg, #b42318)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Tracked obligations</h2>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border, #e4e7ec)', background: 'transparent', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
          >
            <Plus size={14} aria-hidden /> Add a firm obligation
          </button>
        </div>

        {adding && (
          <form onSubmit={addItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, border: '1px solid var(--border, #e4e7ec)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <label style={{ fontSize: 12 }}>Title
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="E&O policy" style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4 }}>
                <option value="insurance">Insurance</option>
                <option value="registration">Registration</option>
                <option value="license">Licence</option>
                <option value="policy">Policy</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label style={{ fontSize: 12 }}>Number
              <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>Issued by
              <input value={form.issuing_authority} onChange={(e) => setForm({ ...form, issuing_authority: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>Expires
              <input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12 }}>Warn me this many days ahead
              {/* Per-item, not global: an E&O renewal needs 60 days because the underwriter does; a
                  vehicle registration needs about a week. One threshold either buries you or arrives
                  too late. */}
              <input type="number" min={1} max={365} value={form.renewal_lead_days} onChange={(e) => setForm({ ...form, renewal_lead_days: Number(e.target.value) })} style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
              <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: 'var(--accent-fg, #175cd3)', color: '#fff', cursor: 'pointer' }}>Save</button>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #e4e7ec)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        )}

        {items === null ? (
          <p style={{ color: 'var(--muted-fg, #475467)', fontSize: 14 }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--muted-fg, #475467)', fontSize: 14 }}>
            Nothing is being tracked yet. Add the firm&rsquo;s insurance and registrations here; employee
            licences come from their certifications, calibration from the instrument record, and vehicle
            dates from the vehicle.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {items.map((item) => {
              const s = STATE_STYLE[item.state] ?? STATE_STYLE.ok;
              return (
                <div key={item.register_key} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border, #e4e7ec)', borderLeft: `4px solid ${s.color}`, borderRadius: 8, padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.color, background: s.bg, padding: '2px 8px', borderRadius: 999 }}>{s.label}</span>
                  <div style={{ minWidth: 200, flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-fg, #475467)' }}>
                      {SUBJECT_LABEL[item.subject_kind] ?? item.subject_kind} · {item.subject_label}
                      {item.identifier ? ` · ${item.identifier}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: s.color, whiteSpace: 'nowrap' }}>{describeDeadline(item)}</div>
                  {item.document_url && (
                    <a href={item.document_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Document</a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {unrecorded.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>Nothing on record</h2>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted-fg, #475467)' }}>
            These have no date at all, so they cannot expire &mdash; and cannot warn you either. An
            instrument with no calibration history is not the same as one that is current.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {unrecorded.map((u) => (
              <div key={`${u.subject_kind}:${u.subject_id}:${u.what}`} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px dashed var(--border, #e4e7ec)', borderRadius: 8, padding: '8px 14px' }}>
                <FileWarning size={15} aria-hidden style={{ color: 'var(--muted-fg, #475467)' }} />
                <div style={{ flex: 1, fontSize: 14 }}>{u.subject_label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-fg, #475467)' }}>{u.what}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
