'use client'
// app/pay/usePublicFirm.ts — the firm whose portal this is (audit §3c.3, item 8h).
//
// The client-side twin of `/api/public/tenant`. Same module-level cache reasoning as
// `lib/saas/use-tenant-profile.ts`: the header, the hero and the invoice page all want the same
// answer and should share one request.
//
// Cached per invoice key, because the answer genuinely differs by invoice once a second firm exists —
// a single shared cache would show the first-loaded firm's branding on the next invoice.
import { useEffect, useState } from 'react';

export interface PublicFirm {
  name: string;
  phone: string | null;
  phoneE164: string | null;
  addressLine1: string;
  addressLine2: string;
  website: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export const BLANK_FIRM: PublicFirm = {
  name: '',
  phone: null,
  phoneE164: null,
  addressLine1: '',
  addressLine2: '',
  website: '',
  logoUrl: null,
  brandColor: null,
};

const cache = new Map<string, PublicFirm>();
const inFlight = new Map<string, Promise<PublicFirm>>();

function load(invoice?: string): Promise<PublicFirm> {
  const key = invoice ?? '';
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inFlight.get(key);
  if (!p) {
    const qs = invoice ? `?invoice=${encodeURIComponent(invoice)}` : '';
    p = fetch(`/api/public/tenant${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const firm = (j?.firm as PublicFirm | undefined) ?? BLANK_FIRM;
        cache.set(key, firm);
        return firm;
      })
      .catch(() => BLANK_FIRM)
      .finally(() => { inFlight.delete(key); });
    inFlight.set(key, p);
  }
  return p;
}

/** The firm for this portal page. `loaded` is false until the answer arrives — a name that has not
 *  loaded and a firm that has not set one look identical, and only one of them is worth reporting. */
export function usePublicFirm(invoice?: string): { firm: PublicFirm; loaded: boolean } {
  const key = invoice ?? '';
  const [firm, setFirm] = useState<PublicFirm>(cache.get(key) ?? BLANK_FIRM);
  const [loaded, setLoaded] = useState<boolean>(cache.has(key));

  useEffect(() => {
    let alive = true;
    load(invoice).then((f) => {
      if (!alive) return;
      setFirm(f);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [invoice]);

  return { firm, loaded };
}
