'use client';
// CampaignVisibilityControl — who can find this campaign, and how to close it down (P2-5, audit D-2).
//
// Until this shipped, `/dnd` listed EVERY campaign ever created — with the DM's name, every player's name
// and every character's name — to anyone who opened it, and a campaign once created could never be removed
// or hidden by anyone. This is the DM's control over both.
//
// TWO DESIGN NOTES:
//
//  · Existing campaigns were backfilled to **unlisted**, not public (seed 457). So the common case here is a
//    DM discovering their table is no longer on the public index and choosing whether to put it back. The
//    copy says that plainly rather than presenting three neutral radio buttons.
//  · **Archive is the default destructive action**; the hard delete is behind a second confirmation and is
//    described in terms of what it destroys. A campaign holds sessions, recaps, roll history and a roster,
//    and "delete" means "get it off my list" to almost everyone almost all of the time.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './hextech.module.css';

type Visibility = 'public' | 'unlisted' | 'private';

const OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: 'public', label: 'Listed publicly', hint: 'Shown on the Campaigns page to anyone, with your table’s roster.' },
  { value: 'unlisted', label: 'Anyone with the link', hint: 'Not listed anywhere. People you send the link to can open it.' },
  { value: 'private', label: 'Members only', hint: 'Only people you have added can see it.' },
];

export default function CampaignVisibilityControl({
  campaignId,
  current,
}: {
  campaignId: string;
  current?: string | null;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(
    current === 'public' || current === 'private' ? current : 'unlisted',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function setTo(v: Visibility) {
    if (busy) return;
    const previous = visibility;
    setVisibility(v); setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: v }),
      });
      // Roll the highlight back on failure. A control that shows the state you asked for rather than the
      // state that saved is how someone believes their campaign is private when it is not.
      if (!r.ok) { setVisibility(previous); setErr('Could not change that. Try again.'); }
    } catch {
      setVisibility(previous); setErr('Network error — please try again.');
    } finally { setBusy(false); }
  }

  /** Download the whole campaign as JSON (P9-2). Triggers a file save rather than navigating, so the DM
   *  stays on the page they were about to delete from. */
  async function exportCampaign() {
    if (busy) return;
    setBusy(true); setExporting(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}/export`);
      if (!r.ok) { setErr('Could not export this campaign.'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disp = r.headers.get('Content-Disposition') ?? '';
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(disp)?.[1] ?? 'campaign.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr('Network error — please try again.');
    } finally { setBusy(false); setExporting(false); }
  }

  async function remove(hard: boolean) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${campaignId}${hard ? '?hard=1' : ''}`, { method: 'DELETE' });
      if (!r.ok) { setErr('Could not remove this campaign.'); return; }
      router.push('/dnd');
    } catch {
      setErr('Network error — please try again.');
    } finally { setBusy(false); }
  }

  return (
    <section className={styles.framedPanel} style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
      <div className={styles.framedPanelTop} />
      <h2 className={styles.panelTitle} style={{ margin: 0, fontSize: 14 }}>Who can find this campaign</h2>

      <div style={{ display: 'grid', gap: 6 }}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTo(o.value)}
            disabled={busy}
            aria-pressed={visibility === o.value}
            style={{
              display: 'grid', gap: 2, textAlign: 'left', padding: '9px 11px', borderRadius: 3, cursor: busy ? 'default' : 'pointer',
              border: visibility === o.value ? '1px solid var(--hx-teal-1)' : '1px solid var(--hx-line)',
              background: visibility === o.value ? 'rgba(10,200,185,0.1)' : 'rgba(1,10,19,0.3)',
              color: 'inherit',
            }}
          >
            <strong style={{ fontSize: 13, color: visibility === o.value ? 'var(--hx-teal-1)' : 'var(--hx-gold-2)' }}>{o.label}</strong>
            <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.45 }}>{o.hint}</span>
          </button>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
        Campaigns made before this setting existed are <strong>unlisted</strong> — every link still works, they
        just stopped appearing on the public Campaigns page along with everyone else’s roster.
      </p>

      <div style={{ borderTop: '1px solid var(--hx-line)', paddingTop: 10, display: 'grid', gap: 7 }}>
        <span style={{ fontSize: 12, color: 'var(--hx-gold-2)', fontFamily: 'var(--hx-font-display)' }}>Closing this table</span>
        {!confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Export sits BEFORE both destructive buttons on purpose (P9-2). The delete confirmation
                below lists what is about to be lost; until this existed, that list was a warning with
                nothing you could do about it. */}
            {/* Its own flag, not the shared `busy`: labelling this "Exporting…" while an ARCHIVE is in
                flight would tell the DM a download is happening when none is. */}
            <button type="button" className={styles.hexBtn} disabled={busy} onClick={exportCampaign} style={{ padding: '6px 14px', fontSize: 12.5 }}>
              {exporting ? 'Exporting…' : '⇩ Export everything'}
            </button>
            <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => remove(false)} style={{ padding: '6px 14px', fontSize: 12.5 }}>
              Archive it
            </button>
            <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => setConfirmDelete(true)}
              style={{ padding: '6px 14px', fontSize: 12.5, borderColor: 'var(--hx-danger, #ff6b6b)', color: '#ff9d9d' }}>
              Delete permanently…
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 7 }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--hx-text)' }}>
              This destroys the campaign’s <strong>sessions, recaps, roll history, invites and roster</strong>,
              and cannot be undone. <strong style={{ color: 'var(--hx-teal-1)' }}>Characters are not deleted</strong> —
              they belong to their players and simply leave the table.
            </p>
            {/* Offered again HERE, at the moment it matters. Someone who reached this dialog did not read
                the toolbar; telling them now costs one line and is the difference between a warning and a
                way out. */}
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
              <button type="button" onClick={exportCampaign} disabled={busy}
                style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--hx-gold-2)', cursor: 'pointer', textDecoration: 'underline' }}>
                Export everything first
              </button>{' '}— one JSON file with all of the above.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => remove(true)}
                style={{ padding: '6px 14px', fontSize: 12.5, borderColor: 'var(--hx-danger, #ff6b6b)', color: '#ff9d9d' }}>
                {busy ? 'Deleting…' : 'Yes, delete it permanently'}
              </button>
              <button type="button" className={styles.hexBtn} disabled={busy} onClick={() => setConfirmDelete(false)} style={{ padding: '6px 14px', fontSize: 12.5 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
          Archiving takes it off every list and out of every search, and keeps everything. It can be brought
          back.
        </span>
      </div>

      {err && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-danger, #ff6b6b)' }}>{err}</p>}
    </section>
  );
}
