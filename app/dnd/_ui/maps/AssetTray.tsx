'use client';
// app/dnd/_ui/maps/AssetTray.tsx — the campaign's own images, ready to put on a map (M4-3).
//
// M4-3: *"Campaign-scoped asset tray with search; recently-used first, because placing forty trees means
// using the same asset forty times."*
//
// ── ARM, THEN CLICK THE MAP — THE SAME MECHANISM AS EVERY OTHER PLACING CONTROL ─────────────────────
//
// The plan says "drag from an asset tray onto the map". Arm-then-click is not a compromise: it is one
// mechanism that works with a mouse, a finger and a stylus, it survives a scroll between picking the
// asset and choosing the spot, and the armed state is a visible bar that says what the next click does.
// A drag has no equivalent of "I am in a mode I forgot about", but it also has no equivalent of "the tray
// is above the fold and the spot I want is below it".
//
// ── THE TRAY DOES NOT UPLOAD ────────────────────────────────────────────────────────────────────────
//
// Uploading is `/api/dnd/media`, which already has the quota, the size cap and the rate limit. This is a
// picker, and it says where to add an image rather than growing a second uploader beside the first.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../hextech.module.css';
import type { MapAsset } from '@/lib/dnd/maps/assets';
import { searchAssets } from '@/lib/dnd/maps/assets';
import MapClickCatcher from './MapClickCatcher';

/** What a placed asset becomes. `image` is scenery under everything; `prop` is a thing in the room. */
const KINDS = [
  { value: 'prop', label: 'Prop' },
  { value: 'image', label: 'Scenery' },
] as const;

export default function AssetTray({
  campaignId,
  nodeId,
  assets,
  /** One grid cell in world units — an asset dropped on a battle map should cover a square, not a pixel. */
  cell,
}: {
  campaignId: string;
  nodeId: string;
  assets: MapAsset[];
  cell: number | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'prop' | 'image'>('prop');
  const [armed, setArmed] = useState<MapAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => searchAssets(assets, q), [assets, q]);

  async function placeAt(x: number, y: number) {
    if (!armed) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId, kind, x, y, label: armed.label,
          // One grid cell square by default, or five world units on a map with no grid. A DM resizes from
          // there; the alternative — a fixed pixel size — is a different fraction of every map.
          w: cell && cell > 0 ? cell : 5,
          h: cell && cell > 0 ? cell : 5,
          // Scenery and props are things the party is meant to SEE. Unlike a trap or a secret door, which
          // the route rightly defaults to DM-only, a tree nobody can see is a tree that does nothing.
          visibility: 'players',
          // The URL is what the map draws; the id is kept so a later slice can trace a placement back to
          // its library row without re-matching on a string.
          assetUrl: armed.url,
          data: { assetId: armed.id },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j?.error ?? 'That did not work.'); return; }
      // NOT cleared. Placing forty trees means using the same asset forty times — that sentence is the
      // reason this slice exists, and a tray that disarmed after every drop would make it forty round
      // trips through the picker.
      router.refresh();
    } catch {
      setMsg('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
          Asset tray
        </span>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
          <span className={styles.srOnly}>Search the campaign&rsquo;s images</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search images…"
            style={{
              minHeight: 44, padding: '0 10px', minWidth: 160,
              background: 'rgba(1,10,19,0.72)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)',
            }}
          />
        </label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--hx-muted)' }}>
          Place as
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'prop' | 'image')}
            style={{
              minHeight: 44, background: 'rgba(1,10,19,0.72)', border: '1px solid var(--hx-line)',
              color: 'var(--hx-text)', padding: '0 8px',
            }}
          >
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      </div>

      {assets.length === 0 ? (
        // The empty state points at the uploader that already exists rather than growing one here.
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
          No images in this campaign yet.{' '}
          <Link href={`/dnd/campaigns/${campaignId}/gallery`} style={{ color: 'var(--hx-teal-1)' }}>
            Upload some to the gallery
          </Link>{' '}
          and they will appear here.
        </p>
      ) : shown.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--hx-muted)' }}>
          Nothing matches &ldquo;{q}&rdquo; — {assets.length} image{assets.length === 1 ? '' : 's'} in this campaign.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {shown.map((a) => {
            const on = armed?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => setArmed(on ? null : a)}
                // The count is shown, not just used for sorting: "already on 12 objects" is how a DM
                // recognises the tree they have been using without opening each one.
                title={`${a.label}${a.uses ? ` — already on ${a.uses} object${a.uses === 1 ? '' : 's'}` : ''}`}
                style={{
                  display: 'grid', gap: 4, justifyItems: 'center', width: 84, padding: 6, cursor: 'pointer',
                  minHeight: 44,
                  background: 'rgba(1,10,19,0.72)',
                  border: `1px solid ${on ? 'var(--hx-teal-1)' : 'var(--hx-line)'}`,
                  color: on ? 'var(--hx-teal-1)' : 'var(--hx-text)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.thumbUrl || a.url}
                  alt=""
                  loading="lazy"
                  style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }}
                />
                <span style={{ fontSize: 11, lineHeight: 1.2, textAlign: 'center', wordBreak: 'break-word' }}>
                  {a.label.length > 22 ? `${a.label.slice(0, 21)}…` : a.label}
                </span>
                {a.uses > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--hx-muted)' }}>×{a.uses}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {armed && (
        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            border: '1px solid var(--hx-teal-1)', padding: '8px 10px', fontSize: 12.5,
          }}
        >
          <strong style={{ color: 'var(--hx-teal-1)' }}>
            Click the map to place {armed.label}. It stays armed, so you can place several.
          </strong>
          <button
            type="button"
            onClick={() => setArmed(null)}
            style={{ background: 'none', border: 'none', color: 'var(--hx-muted)', cursor: 'pointer', textDecoration: 'underline', minHeight: 44 }}
          >
            Done
          </button>
        </div>
      )}

      {armed && (
        <MapClickCatcher
          onPick={placeAt}
          onCancel={() => setArmed(null)}
          label={`Click the map to place ${armed.label}, or press Escape to stop`}
        />
      )}

      {msg && <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)' }}>{msg}</div>}
    </div>
  );
}
