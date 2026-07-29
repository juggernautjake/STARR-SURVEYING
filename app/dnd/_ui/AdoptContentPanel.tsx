'use client';
// AdoptContentPanel — put shared custom content onto this character (P6-8).
//
// The Studio's payoff surface. Everything before this made content authorable, browsable and readable;
// this is where it lands on a sheet and starts changing numbers.
//
// It offers only pieces that could plausibly apply — the server filters to the character's system plus
// `'any'` — and then lets the SERVER be the authority on whether each one actually may. That split is
// deliberate: this component never tries to predict the DM allowlist or whether a payload resolves, it
// asks and reports what came back. A client that guesses at a gate is a client that will eventually
// disagree with it, and the disagreement always looks like a bug to the player.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './hextech.module.css';

interface Piece {
  id: string;
  name: string;
  kind: string;
  system: string;
  summary?: string;
  creator: { name: string };
}

export default function AdoptContentPanel({
  characterId,
  system,
}: {
  characterId: string;
  /** The character's system — the catalog is fetched scoped to it (plus `'any'` pieces). */
  system: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/dnd/homebrew?system=${encodeURIComponent(system)}`)
      .then((r) => (r.ok ? r.json() : { content: [] }))
      .then((j) => setPieces((j.content ?? []) as Piece[]))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [system]);

  // Fetch on first open rather than on mount: this panel sits on every sheet, and most visits never open
  // it. Same reasoning as the Build Kit's collapsed default.
  useEffect(() => { if (open && !loaded) load(); }, [open, loaded, load]);

  async function adopt(p: Piece) {
    if (busy) return;
    setBusy(p.id); setMsg(null);
    try {
      const r = await fetch(`/api/dnd/homebrew/${p.id}/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // The server's message is shown verbatim. It knows WHICH of the three gates refused — wrong
        // system, DM hasn't allowed it, or the piece is prose with nothing to apply — and each needs a
        // different action from the player. A generic "could not add" would hide that.
        setMsg({ ok: false, text: j.error ?? 'Could not add that.' });
        return;
      }
      setMsg({ ok: true, text: `${j.summary}. You can undo this from the sheet's history.` });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'Network error — please try again.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '12px auto 0', padding: '0 12px' }}>
      <section className={styles.framedPanel} style={{ padding: '12px 16px', display: 'grid', gap: 10 }}>
        <div className={styles.framedPanelTop} />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 0, textAlign: 'left' }}
          aria-expanded={open}
        >
          <span style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 14, letterSpacing: '0.04em' }}>
            ✚ Add custom content
            <span style={{ color: 'var(--hx-muted)', fontSize: 12, marginLeft: 8, letterSpacing: 0 }}>
              community-made classes, feats and items for this system
            </span>
          </span>
          <span style={{ color: 'var(--hx-muted)', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div style={{ display: 'grid', gap: 10 }}>
            {!loaded && <p style={{ margin: 0, color: 'var(--hx-muted)', fontSize: 12.5 }}>Loading…</p>}

            {loaded && pieces.length === 0 && (
              <p style={{ margin: 0, color: 'var(--hx-muted)', fontSize: 12.5, lineHeight: 1.55 }}>
                Nothing has been published for this system yet.{' '}
                <Link href="/dnd/content/new" style={{ color: 'var(--hx-teal-1)' }}>Build the first thing</Link>.
              </p>
            )}

            {loaded && pieces.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {pieces.map((p) => (
                  <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'space-between', border: '1px solid var(--hx-line)', background: 'rgba(1,10,19,0.35)', padding: '9px 11px', borderRadius: 3, flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: 2, flex: '1 1 240px' }}>
                      <Link href={`/dnd/content/${p.id}`} style={{ fontFamily: 'var(--hx-font-display)', color: 'var(--hx-gold-2)', fontSize: 14, textDecoration: 'none' }}>
                        {p.name}
                      </Link>
                      <span style={{ fontSize: 11, color: 'var(--hx-muted)' }}>
                        {p.kind} · by {p.creator.name}{p.system === 'any' ? ' · any system' : ''}
                      </span>
                      {p.summary && <span style={{ fontSize: 12, color: 'var(--hx-text)', opacity: 0.85, lineHeight: 1.45 }}>{p.summary}</span>}
                    </div>
                    <button
                      type="button"
                      className={styles.hexBtn}
                      onClick={() => adopt(p)}
                      disabled={!!busy}
                      style={{ padding: '6px 14px', fontSize: 12.5 }}
                      title={`Apply ${p.name} to this character. It is marked as custom on the sheet, and you can undo it.`}
                    >
                      {busy === p.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {msg && (
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: msg.ok ? 'var(--hx-teal-1)' : 'var(--hx-danger, #ff6b6b)' }}>
                {msg.text}
              </p>
            )}

            <p style={{ margin: 0, fontSize: 11.5, color: 'var(--hx-muted)', lineHeight: 1.5 }}>
              Anything you add is flagged as custom on the sheet and shows in its history, so it can be
              reviewed — and undone — like any other change. In a campaign, your DM decides what is allowed.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
