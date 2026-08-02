'use client';
// app/AndrewAsh/_ui/RegisterVoicePWA.tsx — install (and uninstall) the /AndrewAsh service worker.
//
// The owner's requirement: "a web app that works on pc or on his phone so he can get notifications
// and manage the business". That is a PWA — installable to a home screen, with a service worker to
// receive push while the tab is closed.
//
// ── SCOPED TO /AndrewAsh/, WHICH IS ENFORCED BY THE URL ─────────────────────────────────────────
//
// This repository also serves a live land-surveying business. A worker registered at the root would
// sit in front of every admin page, every receipt upload and every invoice of a company that has
// nothing to do with Andrew — for every user, permanently, including after this file changed. A
// worker's scope is capped by the path it is served from, so serving it at `/AndrewAsh/sw.js` makes
// "it cannot touch the surveying app" a property of the URL rather than a promise in a comment.
//
// ── THE OFF PATH ACTIVELY UNINSTALLS ────────────────────────────────────────────────────────────
//
// A flag that merely skips registration leaves an already-installed worker running forever, so the
// switch would turn the feature on and never off again. With the flag off, this unregisters any
// worker under our scope and drops its caches — which is what makes it a real rollback, and which
// matters more than usual here because this code is destined to move to another domain.

import { useEffect } from 'react';

const SW_URL = '/AndrewAsh/sw.js';
const SCOPE = '/AndrewAsh/';
const CACHE_PREFIX = 'andrewash-';

export default function RegisterVoicePWA(): null {
  // Default ON, unlike /dnd's opt-in flag: the studio is meant to live on a phone, and an install
  // prompt that never appears is a feature that does not exist. `NEXT_PUBLIC_VOICE_PWA=0` is the
  // killswitch.
  const enabled = process.env.NEXT_PUBLIC_VOICE_PWA !== '0';

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;

    async function enable(): Promise<void> {
      try {
        await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
      } catch {
        // A failed registration must never surface to a visitor. The site works without it — that is
        // the entire definition of a progressive enhancement.
      }
    }

    async function disable(): Promise<void> {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          // Ours only. Unregistering by breadth would take out any worker the surveying app adds
          // later, from a component that has no business touching it.
          if (reg.scope.endsWith(SCOPE)) await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
        }
      } catch {
        /* nothing to clean up, or the browser refused — either way there is nothing to tell anyone */
      }
    }

    if (cancelled) return;
    void (enabled ? enable() : disable());
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
