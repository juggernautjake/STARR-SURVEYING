'use client';
// app/dnd/_ui/maps/WorldAuthor.tsx — the DM's world-building controls (M4-4).
//
// WHY THIS IS THE SLICE THAT MATTERED. The schema went live, the browser worked, the player console was
// wired to it — and there was no way to create a single node, so the entire stack was unreachable in
// practice. Read-only infrastructure nobody can put data into is the same defect as an unwired component,
// arriving from the other direction.
//
// Deliberately small: create a child here, rename, re-tier, publish, link to a console body, delete. The
// richer authoring (drag to place, the asset tray, grid design) is M4-1..M4-3; this is the minimum that
// makes the world usable, and shipping it now is what stops the rest being built on something untested.
//
// `router.refresh()` after every write rather than local state: the page is a server component, and
// re-fetching is both simpler and impossible to get out of sync with the tree. A world edit is not a
// keystroke-latency interaction.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const TIERS = ['space', 'world', 'continent', 'province', 'city', 'district', 'site'] as const;

interface WorldAuthorProps {
  campaignId: string;
  /** The node being viewed — the parent for "add inside", and the subject for edit/delete. Null at an
   *  empty world, where only "create a root" applies. */
  current: {
    id: string;
    name: string;
    tier: string;
    depth: number;
    blurb: string | null;
    published: boolean;
    consoleRef: string | null;
  } | null;
  /** How many children the current node has — so Delete can say what it will take with it. */
  childCount: number;
}

const API = (campaignId: string) => `/api/dnd/campaigns/${encodeURIComponent(campaignId)}/world`;

const field: React.CSSProperties = {
  width: '100%', padding: '8px 10px', minHeight: 40, fontSize: 13,
  background: 'rgba(1,10,19,0.5)', border: '1px solid var(--hx-line)', color: 'var(--hx-text)',
};
const btn: React.CSSProperties = {
  minHeight: 40, padding: '8px 14px', fontSize: 13, cursor: 'pointer', borderRadius: 6,
  border: '1px solid var(--hx-line)', background: 'rgba(10,200,185,0.12)', color: 'var(--hx-teal-1)',
};

export default function WorldAuthor({ campaignId, current, childCount }: WorldAuthorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<'add' | 'edit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The tier a child should default to: one step finer than its parent, which is what a DM means nine
  // times out of ten. At `site` there is nowhere finer, so it stays.
  const childTier = (() => {
    const i = TIERS.indexOf(current?.tier as (typeof TIERS)[number]);
    return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : 'site';
  })();

  const [name, setName] = useState('');
  const [tier, setTier] = useState<string>(childTier);
  const [editName, setEditName] = useState(current?.name ?? '');
  const [editTier, setEditTier] = useState(current?.tier ?? 'site');
  const [editBlurb, setEditBlurb] = useState(current?.blurb ?? '');
  const [editRef, setEditRef] = useState(current?.consoleRef ?? '');

  /** Every write goes through here so the error handling and the refresh cannot diverge per button. The
   *  server's message is shown verbatim — the depth and cycle refusals are written FOR a DM, and replacing
   *  them with "Something went wrong" throws away the only useful part. */
  async function send(method: 'POST' | 'PATCH' | 'DELETE', payload: unknown, query = '') {
    setError(null);
    try {
      const res = await fetch(API(campaignId) + query, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error || `Failed (${res.status})`); return false; }
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError('Could not reach the server.');
      return false;
    }
  }

  const atMaxDepth = (current?.depth ?? 0) >= 7;

  return (
    <section
      style={{
        border: '1px solid var(--hx-line)', padding: '12px 14px', display: 'grid', gap: 10,
        background: 'rgba(1,10,19,0.35)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--hx-teal-1)' }}>
          DM tools
        </strong>
        <button type="button" style={btn} onClick={() => { setOpen(open === 'add' ? null : 'add'); setError(null); }}>
          {current ? `+ Location inside ${current.name}` : '+ Create the first map'}
        </button>
        {current && (
          <button type="button" style={btn} onClick={() => { setOpen(open === 'edit' ? null : 'edit'); setError(null); }}>
            ✎ Edit this
          </button>
        )}
        {current && (
          <button
            type="button"
            style={{ ...btn, background: 'rgba(198,64,59,0.14)', color: '#e08b86', borderColor: '#7a3b38' }}
            disabled={pending}
            onClick={async () => {
              // NAME WHAT WILL BE DESTROYED. Deleting cascades to the whole subtree, and a bare "Are you
              // sure?" does not tell a DM they are about to lose six locations (plan M4-4).
              const warning = childCount
                ? `Delete "${current.name}" AND the ${childCount} location${childCount === 1 ? '' : 's'} directly inside it (and anything inside those)?`
                : `Delete "${current.name}"?`;
              if (!window.confirm(warning)) return;
              const ok = await send('DELETE', null, `?nodeId=${encodeURIComponent(current.id)}`);
              // Navigate away from a node that no longer exists, or the next render 404s on ?node=.
              if (ok) router.push(`/dnd/campaigns/${campaignId}/world`);
            }}
          >
            🗑 Delete
          </button>
        )}
        {current && (
          <button
            type="button"
            style={btn}
            disabled={pending}
            onClick={() => send('PATCH', { nodeId: current.id, published: !current.published })}
            title={current.published ? 'Hide this from players' : 'Let players see this'}
          >
            {current.published ? '● Published' : '○ Unpublished'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: '#e08b86', fontSize: 12.5, margin: 0 }}>{error}</p>
      )}

      {open === 'add' && (
        <form
          style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr auto auto', alignItems: 'end' }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const ok = await send('POST', { name, tier, parentId: current?.id ?? null });
            if (ok) { setName(''); setOpen(null); }
          }}
        >
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
            Name
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ironrow" autoFocus />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
            Scale
            <select style={field} value={tier} onChange={(e) => setTier(e.target.value)}>
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button type="submit" style={btn} disabled={pending || !name.trim() || atMaxDepth}>
            {atMaxDepth ? 'At level 7' : 'Add'}
          </button>
          {atMaxDepth && (
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: 'var(--hx-muted)' }}>
              Seven levels is the limit — this is where encounters happen.
            </p>
          )}
        </form>
      )}

      {open === 'edit' && current && (
        <form
          style={{ display: 'grid', gap: 8 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await send('PATCH', {
              nodeId: current.id,
              name: editName,
              tier: editTier,
              blurb: editBlurb,
              // Empty string clears the link rather than setting "".
              consoleRef: editRef.trim() || null,
            });
            if (ok) setOpen(null);
          }}
        >
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 160px' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
              Name
              <input style={field} value={editName} onChange={(e) => setEditName(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
              Scale
              <select style={field} value={editTier} onChange={(e) => setEditTier(e.target.value)}>
                {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
            Description — players see this on the map and in the console readout
            <textarea style={{ ...field, minHeight: 76, resize: 'vertical' }} value={editBlurb} onChange={(e) => setEditBlurb(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 11, color: 'var(--hx-muted)' }}>
            Console body id — links this location to a planet/star in the space map. Leave blank to match by
            name instead.
            <input style={field} value={editRef} onChange={(e) => setEditRef(e.target.value)} placeholder="e.g. inst-4f2a" />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={btn} disabled={pending}>Save</button>
            <button type="button" style={{ ...btn, background: 'transparent' }} onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
