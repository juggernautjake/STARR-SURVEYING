// lib/scan/helper-client.ts — the website's side of the Starr Scan helper (scan-helper/).
//
// Owner, 2026-10-06: "a button that is just for scanning a document, then it opens up a menu that
// allows us to select what app we wanna use to scan with or what device". A web page cannot reach a
// scanner on any operating system, so a small helper runs on the computer and answers on
// 127.0.0.1:47615 (scan-helper/src/server.mjs). This is the client: is it there, what can it see,
// scan, and fetch the pages for the preview.
//
// The helper never uploads anything. Pages come back here, the person previews and confirms them,
// and the ordinary upload pop-up files them under the person's own session.

export const HELPER_URL = 'http://127.0.0.1:47615';

export type ScanColor = 'color' | 'gray' | 'bw';
export type PaperSource = 'feeder' | 'flatbed' | 'duplex';

export interface ScanSource {
  id: string;
  kind: 'device' | 'app';
  driver: 'wia' | 'twain' | 'sane' | 'escl' | 'image-capture' | 'app';
  name: string;
  maker?: string | null;
  sources?: PaperSource[];
  dpis?: number[];
  network?: boolean;
  via?: string;
  offline?: boolean;
}

export interface HelperStatus {
  app: 'starr-scan';
  version: string;
  os: 'win32' | 'darwin' | 'linux' | string;
  inbox: string;
  sources: ScanSource[];
  /** Scanners with a driver installed and whether each is switched on (Windows). */
  installed: Array<{ name: string; present: boolean }>;
  naps2: boolean;
  busy: boolean;
}

export interface ScanPageInfo { n: number; name: string; size: number; type: string }

export interface ScanJob {
  id: string;
  kind: 'device' | 'app';
  state: 'scanning' | 'waiting' | 'done' | 'error';
  error: string | null;
  appName: string | null;
  pages: ScanPageInfo[];
}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${HELPER_URL}${path}`, { ...init, signal: ctl.signal, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `The scanner helper answered ${res.status}.`);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

/** The helper's status, or null when it is not running (or not installed). Never throws. */
export async function helperStatus(refresh = false): Promise<HelperStatus | null> {
  try {
    const s = await call<HelperStatus>(`/v1/status${refresh ? '?refresh=1' : ''}`, undefined, refresh ? 15000 : 8000);
    return s?.app === 'starr-scan' ? s : null;
  } catch {
    return null;
  }
}

export function startScan(opts: { sourceId: string; source: PaperSource; dpi: number; color: ScanColor }): Promise<ScanJob> {
  return call<ScanJob>('/v1/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts) });
}

export function launchApp(appId: string): Promise<ScanJob> {
  return call<ScanJob>('/v1/apps/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId }) });
}

export function getJob(id: string): Promise<ScanJob> {
  return call<ScanJob>(`/v1/jobs/${encodeURIComponent(id)}`);
}

/** Stop collecting from an app: the pages saved so far are what is kept. */
export function finishJob(id: string): Promise<ScanJob> {
  return call<ScanJob>(`/v1/jobs/${encodeURIComponent(id)}/finish`, { method: 'POST' });
}

export async function discardJob(id: string): Promise<void> {
  await call(`/v1/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
}

export async function fetchPage(jobId: string, n: number): Promise<Blob> {
  const res = await fetch(`${HELPER_URL}/v1/jobs/${encodeURIComponent(jobId)}/pages/${n}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Page ${n} could not be read from the scanner helper.`);
  return res.blob();
}

/** Which OS the visitor is on, for setup steps when the helper is not there to say. */
export function clientOs(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'chromeos' | 'other' {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/CrOS/i.test(ua)) return 'chromeos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

/**
 * Has the browser been told it may talk to this computer's own programs?
 *
 * Chrome and Edge (2025+) ask "Allow this site to access devices on your local network?" the first
 * time a website contacts the helper. A person who clicks Block gets a Scan button that looks
 * exactly like "the helper is not installed" — the request simply fails. This reads the permission
 * so the pop-up can say "your browser blocked it" and how to undo that, instead of sending them to
 * install a program they already have. Browsers that have no such permission report 'unsupported'.
 */
export async function localNetworkPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  for (const name of ['local-network-access', 'loopback-network']) {
    try {
      const s = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
      return s.state;
    } catch {
      // This browser does not know that permission name; try the next.
    }
  }
  return 'unsupported';
}

/** Which browser, for the "how to unblock it" steps. */
export function clientBrowser(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): 'edge' | 'chrome' | 'firefox' | 'safari' | 'other' {
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}
