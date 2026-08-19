// lib/jobs/upload-background.ts — uploads that survive leaving the page.
//
// Owner, 2026-08-19: *"I want it so that I can leave the web app and have it still working in the
// background while I'm doing other things on my phone, and then once it is done it can notify me
// that it uploaded."*
//
// ── THE PLATFORM FACT THAT DECIDES THIS ─────────────────────────────────────────────────────────
//
// A page's JavaScript stops when its tab is closed or suspended. The ONLY web API that continues a
// transfer after that is **Background Fetch**, which hands the request to the browser process, shows
// OS-level progress, and wakes a service worker when it finishes.
//
//   Chrome / Edge / Samsung Internet / Chrome on Android — supported.
//   Safari, and therefore EVERY browser on iOS — not supported, and not shimmable.
//
// That second line is a limitation of the platform, not of this code: iOS gives a web page no way to
// keep uploading once it is backgrounded. Pretending otherwise would mean a crew member locking
// their phone, walking away, and coming back to find the recording never arrived — the exact failure
// this feature exists to prevent. So `backgroundUploadSupport()` reports what is actually available
// and the UI says which one is in play, rather than promising the same thing everywhere.
//
// The pure decisions live here and are tested; the worker half is `public/admin/sw.js`.

export type BackgroundUploadMode = 'background' | 'foreground';

export interface BackgroundSupport {
  mode: BackgroundUploadMode;
  /** Shown to the person, so the promise on screen matches what the browser will actually do. */
  explanation: string;
  /** True when a completion notification can be raised without asking for anything further. */
  canNotify: boolean;
}

interface SupportProbe {
  hasServiceWorker: boolean;
  hasBackgroundFetch: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
}

/** Split from the DOM read so the decision itself can be tested against every combination. */
export function decideSupport(probe: SupportProbe): BackgroundSupport {
  const canNotify = probe.notificationPermission === 'granted';
  if (probe.hasServiceWorker && probe.hasBackgroundFetch) {
    return {
      mode: 'background',
      explanation: canNotify
        ? 'This will keep uploading if you leave the app, and you will get a notification when it finishes.'
        : 'This will keep uploading if you leave the app. Allow notifications to be told when it finishes.',
      canNotify,
    };
  }
  return {
    mode: 'foreground',
    // Named plainly rather than as a generic "not supported": somebody who knows they must keep the
    // page open will keep it open. Somebody told "unsupported" will close it and lose the upload.
    explanation: 'This browser can only upload while the page is open — keep it open until it finishes. '
      + '(iPhones and iPads cannot upload in the background; on Android, Chrome can.)',
    canNotify,
  };
}

/** What this browser can actually do, right now. */
export function backgroundUploadSupport(): BackgroundSupport {
  if (typeof window === 'undefined') {
    return { mode: 'foreground', explanation: '', canNotify: false };
  }
  return decideSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    // The manager hangs off the ServiceWorkerRegistration prototype; checking the prototype avoids
    // needing a live registration just to answer "is this possible here?".
    hasBackgroundFetch: typeof ServiceWorkerRegistration !== 'undefined'
      && 'backgroundFetch' in ServiceWorkerRegistration.prototype,
    notificationPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  });
}

/** Everything the worker needs to finish the job once the bytes have landed. */
export interface PendingUploadRow {
  id: string;
  /** Where to POST the row once storage has the bytes. */
  rowEndpoint: string;
  rowBody: Record<string, unknown>;
  fileName: string;
  sizeBytes: number;
  /** Where a tap on the notification should land. */
  openUrl: string;
}

const DB_NAME = 'starr-uploads';
const STORE = 'pending';

/**
 * A tiny IndexedDB, because the worker that finishes the upload is a DIFFERENT execution context
 * from the page that started it — it cannot see any variable the page held. Background Fetch carries
 * only an id, so the row payload has to be somewhere both can reach.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the upload store.'));
  });
}

export async function rememberPendingUpload(row: PendingUploadRow): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the pending upload.'));
  });
  db.close();
}

/**
 * Hand one file to the browser to upload in the background.
 *
 * Returns false when Background Fetch is unavailable, so the caller falls back to the foreground
 * path rather than silently doing nothing — an upload that reports success and never happened is
 * the worst outcome available here.
 */
export async function startBackgroundUpload(input: {
  signedUrl: string;
  file: File;
  contentType: string;
  row: PendingUploadRow;
}): Promise<boolean> {
  const support = backgroundUploadSupport();
  if (support.mode !== 'background') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const bg = (reg as unknown as { backgroundFetch?: { fetch: (id: string, reqs: Request[], opts?: unknown) => Promise<unknown> } }).backgroundFetch;
    if (!bg) return false;

    // Stored BEFORE the fetch starts: a very fast upload can fire `backgroundfetchsuccess` before a
    // later write would have landed, and the worker would then have bytes in storage and no idea
    // what row to create for them.
    await rememberPendingUpload(input.row);

    await bg.fetch(
      input.row.id,
      [new Request(input.signedUrl, {
        method: 'PUT',
        body: input.file,
        headers: { 'Content-Type': input.contentType },
      })],
      {
        title: `Uploading ${input.file.name}`,
        // `downloadTotal` is what the OS progress notification counts against. It is named for
        // downloads but is the only size hint the API takes; without it Android shows an
        // indeterminate spinner for a ten-minute upload.
        downloadTotal: input.file.size,
      },
    );
    return true;
  } catch {
    // Quota, a duplicate id, or a browser that claims the API and refuses the call. The foreground
    // path still works, so falling back beats failing.
    return false;
  }
}

/** Ask for notification permission, but only when it can still be granted. */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  // `denied` is final until the person changes it in browser settings; asking again does nothing
  // and some browsers count repeated prompts against the origin.
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
