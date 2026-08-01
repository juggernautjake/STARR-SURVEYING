'use client';
// app/dnd/_ui/maps/TokenDrag.tsx — pick a token up and put it somewhere else (M4-2 / M7-1).
//
// The write path has existed since M4-2 and the gesture has not: moving a piece meant arming a control
// under the map and then clicking. That works, and it is not what anyone does with a token.
//
// ── IT DOES NOT FIGHT THE PAN, BECAUSE IT STARTS ON THE TOKEN ──────────────────────────────────────
//
// The map's own drag is pan (M3-1), on every device. Box-select had to be a MODE for exactly that reason
// — a drag on empty map is ambiguous. A drag that begins on a token is not: nothing else could be meant.
// So this attaches to the tokens themselves and stops the gesture reaching the viewport, and no mode is
// needed at all.
//
// ── AND IT DOES NOT FIGHT THE CLICK EITHER ─────────────────────────────────────────────────────────
//
// A token is a LINK — clicking it selects it and shows its movement (M5-2). A drag handler that
// swallowed every pointerdown would break that, so the distinction is DISTANCE: under a few pixels is a
// click and the link is left alone; past it, the navigation is suppressed and the piece moves. The
// threshold is in SCREEN pixels rather than world units, because it is about the reader's hand rather
// than about the map.
//
// ── IT ASKS THE SERVER, IT DOES NOT DECIDE ─────────────────────────────────────────────────────────
//
// The drop sends a raw world coordinate. Snapping to the grid, clamping to the map, the DM/own-token
// gate and the `token_enters` triggers all happen server-side, exactly as they do for the click-to-place
// path — a client that computed its own square would be a second answer to "which square is this on".
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { screenToMapWorld } from './MapClickCatcher';

/** Screen pixels of movement before a press becomes a drag rather than a click. */
const SLOP = 5;

export default function TokenDrag({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const drag = useRef<{ id: string; el: HTMLElement; startX: number; startY: number; moved: boolean } | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-token-id]') as HTMLElement | null;
      if (!el || e.button !== 0) return;
      drag.current = { id: el.dataset.tokenId!, el, startX: e.clientX, startY: e.clientY, moved: false };
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < SLOP) return;
      if (!d.moved) {
        d.moved = true;
        // Only now is the viewport's pan suppressed. Before the threshold this is still possibly a click,
        // and stealing the gesture early would make the map un-pannable anywhere a token is standing.
        d.el.setPointerCapture?.(e.pointerId);
        d.el.style.opacity = '0.55';
        d.el.style.cursor = 'grabbing';
      }
      // Dragged in SCREEN space, so the piece keeps up with the finger at any zoom. The transform is
      // additive to the token's own centring translate, which is why it is set here rather than replaced.
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const scale = Number(getComputedStyle(document.querySelector('[data-lod]') as HTMLElement).getPropertyValue('--map-scale')) || 1;
      d.el.style.setProperty('--drag-x', `${dx / scale}px`);
      d.el.style.setProperty('--drag-y', `${dy / scale}px`);
      e.preventDefault();
    };

    const onUp = async (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      d.el.style.opacity = '';
      d.el.style.cursor = '';
      d.el.style.removeProperty('--drag-x');
      d.el.style.removeProperty('--drag-y');
      if (!d.moved) return; // a click — leave the link alone

      // Suppress the navigation this press would otherwise have triggered.
      const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      d.el.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => d.el.removeEventListener('click', swallow, { capture: true }), 0);

      const at = screenToMapWorld(e.clientX, e.clientY);
      if (!at) return;
      try {
        const r = await fetch(`/api/dnd/campaigns/${encodeURIComponent(campaignId)}/map-objects`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: d.id, x: at.x, y: at.y }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMsg(j?.error ?? 'That piece could not be moved.'); return; }
        // A trap the token walked into says so — otherwise a sheet changes and nobody knows why.
        if (Array.isArray(j.triggered) && j.triggered.length) setMsg(j.triggered.join(' · '));
        else setMsg(null);
        router.refresh();
      } catch {
        setMsg('Network error — the piece did not move.');
      }
    };

    // On the window, not on each token: the tokens are server-rendered and replaced wholesale by every
    // `router.refresh()`, so per-element listeners would have to be re-attached on each one.
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [campaignId, router]);

  if (!msg) return null;
  return (
    <div role="status" style={{ fontSize: 12, color: 'var(--hx-gold-2)', padding: '4px 12px' }}>
      {msg}
    </div>
  );
}
