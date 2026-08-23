// lib/design/client.ts — the browser's side of the seam: server first, browser as the safety net.
//
// Slice S1/S2 of docs/planning/completed/DESIGN_STUDIO_2026-08-23.md.
//
// ── THE RULE, IN ONE LINE ───────────────────────────────────────────────────────────────────────
//
// **The server is the truth. The browser is the copy that survives losing it.**
//
// Every function here tries the network and falls back to `localStorage`, and every one of them
// reports which happened rather than hiding it. That last part is the whole design: a studio that
// silently drops back to local storage is a studio that tells you your work is saved on an evening
// when it is saved in exactly one place, and you find out when you open the other laptop.
//
// The fallback is not a degraded mode to be ashamed of — losing the network mid-design should cost
// nothing, and every save keeps writing locally regardless of whether the server took it. What
// matters is that the UI can say "saved here only", and it can, because `offline` is returned.

import type { DesignDocument } from './document';
import {
  listDesigns as listLocal,
  loadDesign as loadLocal,
  saveDesign as saveLocal,
  deleteDesign as deleteLocal,
  type DesignSummary,
} from './storage';

export type { DesignSummary };

export interface Outcome<T> {
  value: T;
  /** True when the server could not be reached or refused, and this came from/went to the browser. */
  offline: boolean;
  /** Something a person can act on. Never a stack trace. */
  message?: string;
}

async function askServer<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `The server said ${res.status}.`);
  }
  return res.json() as Promise<T>;
}

/**
 * Every design, from the server, merged with anything this browser has that the server does not.
 *
 * The merge matters on exactly one day: the first time this runs after the studio moves off
 * localStorage. Designs made before then exist only here, and a list that showed the server's
 * (empty) answer would look precisely like "my work is gone".
 */
export async function fetchDesigns(): Promise<Outcome<DesignSummary[]>> {
  const local = listLocal();
  try {
    const { designs } = await askServer<{ designs: DesignSummary[] }>('/api/admin/design');
    const known = new Set(designs.map((d) => d.id));
    const onlyHere = local.filter((d) => !known.has(d.id));
    const merged = [...designs, ...onlyHere].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      value: merged,
      offline: false,
      message: onlyHere.length
        ? `${onlyHere.length} design${onlyHere.length === 1 ? '' : 's'} here have never been saved to the server — open and save to upload.`
        : undefined,
    };
  } catch (err) {
    return { value: local, offline: true, message: reason(err) };
  }
}

export async function fetchDesign(id: string): Promise<Outcome<DesignDocument | null>> {
  try {
    const { doc } = await askServer<{ doc: DesignDocument }>(`/api/admin/design/${encodeURIComponent(id)}`);
    return { value: doc, offline: false };
  } catch (err) {
    // A 404 lands here too, and falling back to the local copy is right for it: a design made in
    // this browser before it was ever uploaded is not a missing design.
    return { value: loadLocal(id), offline: true, message: reason(err) };
  }
}

/**
 * Save, to both places.
 *
 * Local first and unconditionally, because it cannot fail for network reasons and it is what makes
 * a failed upload cost nothing. The version number then comes from the SERVER when the server
 * accepted it — it is the one that knows what other tabs have written.
 */
export async function pushDesign(doc: DesignDocument, summary?: string): Promise<Outcome<DesignDocument>> {
  const local = saveLocal(doc, new Date().toISOString());
  try {
    const { doc: saved } = await askServer<{ doc: DesignDocument }>('/api/admin/design', {
      method: 'POST',
      body: JSON.stringify({ doc, summary }),
    });
    return { value: saved, offline: false };
  } catch (err) {
    return {
      value: local.doc,
      offline: true,
      message: local.ok
        ? `Saved in this browser only — ${reason(err)}`
        : 'Could not save anywhere: the server refused and this browser will not store data.',
    };
  }
}

export async function removeDesign(id: string): Promise<Outcome<null>> {
  deleteLocal(id);
  try {
    await askServer(`/api/admin/design/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return { value: null, offline: false };
  } catch (err) {
    return { value: null, offline: true, message: reason(err) };
  }
}

export interface VersionSummary {
  version: number;
  summary: string | null;
  authorEmail: string;
  createdAt: string;
  counts: { desktop: number; mobile: number };
}

export async function fetchVersions(id: string): Promise<Outcome<VersionSummary[]>> {
  try {
    const { versions } = await askServer<{ versions: VersionSummary[] }>(
      `/api/admin/design/${encodeURIComponent(id)}/versions`,
    );
    return { value: versions, offline: false };
  } catch (err) {
    return { value: [], offline: true, message: reason(err) };
  }
}

/** Restore an old version. It comes back as a NEW version — nothing after it is destroyed. */
export async function restoreVersion(id: string, version: number): Promise<Outcome<DesignDocument | null>> {
  try {
    const { doc } = await askServer<{ doc: DesignDocument }>(
      `/api/admin/design/${encodeURIComponent(id)}/versions`,
      { method: 'POST', body: JSON.stringify({ version }) },
    );
    saveLocal(doc, doc.updatedAt);
    return { value: doc, offline: false };
  } catch (err) {
    return { value: null, offline: true, message: reason(err) };
  }
}

function reason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  // `fetch` says "Failed to fetch" for offline, DNS, CORS and a dead server alike. The honest
  // translation is the one that does not claim to know which.
  return /failed to fetch|networkerror|load failed/i.test(text)
    ? 'the server could not be reached.'
    : text;
}
