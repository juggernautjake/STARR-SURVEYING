// scripts/check-files-video-upload.mjs — can a person really put a video in the Files area and watch it?
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// The unit tests pin the RULES: the cap is 500 MB, the bucket seed sets 500 MB, `isPreviewable`
// says yes to video. Not one of them can tell you that the `file-explorer` bucket exists, that
// storage accepts the bytes, that the row records a playable type, or that the viewer actually
// plays it. That gap is this repo's most common defect — code that is authored but not wired.
//
// So this drives the real product: it makes a REAL video in the browser (canvas → MediaRecorder,
// so the bytes are a file a decoder accepts, not a blob with a video name), uploads it through the
// page's own Upload control, opens it in the viewer, and waits for playback to advance.
//
// It cleans up after itself: the node is deleted and the storage object removed.
//
// Usage: node --env-file=.env.local scripts/check-files-video-upload.mjs [--base URL] [--as EMAIL]

import { chromium } from 'playwright';
import { encode } from '@auth/core/jwt';

const arg = (f) => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const BASE = arg('--base') ?? 'http://127.0.0.1:3211';
const AS = arg('--as') ?? 'jacobmaddux@starr-surveying.com';

const secret = (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').replace(/^["']|["']$/g, '');
if (!secret) { console.error('AUTH_SECRET is not set'); process.exit(2); }

const findings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { findings.push(m); console.log(`  ✗ ${m}`); };

const token = await encode({
  token: { email: AS, name: 'Files video check', sub: AS },
  secret, salt: 'authjs.session-token', maxAge: 60 * 60,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const page = await ctx.newPage();
if (process.argv.includes('--verbose')) {
  await page.addInitScript(() => {
    const Orig = window.XMLHttpRequest;
    window.XMLHttpRequest = function Patched() {
      const x = new Orig();
      const send = x.send.bind(x);
      x.send = (b) => {
        x.addEventListener('readystatechange', () => console.log(`XHR readyState=${x.readyState} status=${x.status}`));
        x.addEventListener('error', () => console.log('XHR error event'));
        x.upload.addEventListener('progress', (e) => console.log(`XHR upload ${e.loaded}/${e.total}`));
        return send(b);
      };
      return x;
    };
  });
}
page.on('pageerror', (e) => bad(`page error: ${String(e).slice(0, 200)}`));
// `--verbose` prints the traffic and the console. An upload has three legs — sign, PUT, record —
// and when one of them is the problem, knowing WHICH is most of the answer. Asset noise is dropped.
if (process.argv.includes('--verbose')) {
  page.on('console', (m) => console.log(`    [console.${m.type()}] ${m.text().slice(0, 200)}`));
  page.on('request', (r) => { if (!r.url().includes('/_next/')) console.log(`    [→] ${r.method()} ${r.url().slice(0, 110)}`); });
  page.on('requestfailed', (r) => console.log(`    [failed] ${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));
  page.on('response', async (r) => {
    const u = r.url();
    if (u.includes('/_next/')) return;
    const body = r.ok() ? '' : (await r.text().catch(() => '')).slice(0, 200);
    console.log(`    [${r.status()}] ${r.request().method()} ${u.slice(0, 140)} ${body}`);
  });
}

const api = {
  get: (p) => page.request.get(`${BASE}${p}`),
  del: (p) => page.request.delete(`${BASE}${p}`),
};

let nodeId = null;

try {
  console.log(`\n  ${BASE} — a video, from picker to playback\n`);
  await page.goto(`${BASE}/admin/files`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="file-explorer"]', { timeout: 60_000 });
  ok('the Files page rendered');

  // ── A real video, recorded in the browser ─────────────────────────────────────────────────────
  //
  // A blob with a .mp4 name would prove the upload and prove nothing about playback. Recording a
  // canvas gives genuine WebM/VP8 the decoder will accept, which is what makes the last assertion
  // meaningful. Three seconds is enough to have a duration and to advance while we watch.
  const b64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const c2d = canvas.getContext('2d');
    const stream = canvas.captureStream(25);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; });
    rec.start();
    for (let i = 0; i < 75; i += 1) {
      c2d.fillStyle = `hsl(${i * 4}, 80%, 50%)`;
      c2d.fillRect(0, 0, 320, 240);
      c2d.fillStyle = '#fff';
      c2d.font = '32px sans-serif';
      c2d.fillText(String(i), 20, 120);
      await new Promise((r) => setTimeout(r, 40));
    }
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const byte of buf) s += String.fromCharCode(byte);
    return btoa(s);
  });
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 1000) { bad(`the recording produced only ${bytes.length} bytes`); throw new Error('no video'); }
  ok(`recorded a real video in the browser (${(bytes.length / 1024).toFixed(0)} KB of VP8)`);

  // ── Upload it the way a person does ───────────────────────────────────────────────────────────
  const name = `qa-walkthrough-${Date.now() % 1000000}.webm`;
  const before = await (await api.get('/api/admin/files?parent=root')).json();
  const beforeIds = new Set((before.nodes ?? []).map((n) => n.id));

  await page.setInputFiles('input[type="file"]', { name, mimeType: 'video/webm', buffer: bytes });

  // ── WAIT ON THE FACT, NOT ON THE SCREEN ──────────────────────────────────────────────────────
  //
  // This polls the listing API. It used to wait for the row to appear in the DOM, and that stalled
  // the upload every time: Playwright's text engine polls the page while the XHR is in flight, and
  // the request never came back. A property of the harness rather than of the product — the same
  // upload completes in a second when nothing is watching the DOM — but it cost an afternoon and it
  // would have been read as a product failure.
  let made = null;
  for (let waited = 0; waited < 120_000 && !made; waited += 1_000) {
    await page.waitForTimeout(1_000);
    const listing = await (await api.get('/api/admin/files?parent=root')).json();
    made = (listing.nodes ?? []).find((n) => !beforeIds.has(n.id) && n.name === name) ?? null;
  }
  if (!made) { bad('the video never appeared in the listing — the upload did not complete'); throw new Error('no node'); }
  nodeId = made.id;
  ok(`uploaded it through the page's own control (${made.name})`);

  // ── The two things the row has to record ──────────────────────────────────────────────────────
  if (made.mime_type === 'video/webm') ok(`stored a playable type (${made.mime_type})`);
  else bad(`stored mime_type "${made.mime_type}" — the viewer cannot tell this is a video`);
  if (made.size_bytes === bytes.length) ok(`recorded the true size (${made.size_bytes} bytes)`);
  else bad(`size recorded as ${made.size_bytes}, the file is ${bytes.length}`);

  // ── Open it, and require the picture to MOVE ──────────────────────────────────────────────────
  // The page has been sitting on a listing from before the upload; reload so the row is really there.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="file-explorer"]', { timeout: 60_000 });
  await page.click(`text=${name}`);
  const video = await page.waitForSelector('[data-testid="fx-viewer-video"]', { timeout: 30_000 }).catch(() => null);
  if (!video) { bad('clicking the video did not open it in the viewer — it fell through to a download'); throw new Error('no viewer'); }
  ok('it opens in the in-app viewer rather than downloading');

  const played = await page.evaluate(async () => {
    const el = document.querySelector('[data-testid="fx-viewer-video"]');
    if (!el) return { ok: false, why: 'no element' };
    try { await el.play(); } catch (e) { /* autoplay may already have started it */ }
    const start = el.currentTime;
    await new Promise((r) => setTimeout(r, 1500));
    return {
      ok: el.readyState >= 2 && (el.currentTime > start || el.currentTime > 0),
      readyState: el.readyState,
      currentTime: el.currentTime,
      duration: el.duration,
      error: el.error ? el.error.code : null,
    };
  });
  if (played.ok) ok(`and it PLAYS — ${played.currentTime.toFixed(1)}s in, readyState ${played.readyState}`);
  else bad(`the viewer opened but nothing played (readyState ${played.readyState}, error ${played.error})`);

  // ── The link has to outlive the watching ──────────────────────────────────────────────────────
  //
  // A 60-second signed URL used to die the moment somebody scrubbed a long video, because every
  // seek is a fresh range request validated against the token's expiry.
  const inline = await (await api.get(`/api/admin/files/${nodeId}/download?inline=1`)).json();
  const exp = /[?&]token=([^&]+)/.exec(inline.url ?? '');
  if (exp) {
    const payload = JSON.parse(Buffer.from(exp[1].split('.')[1], 'base64url').toString());
    const lifetime = payload.exp - payload.iat;
    if (lifetime >= 60 * 60) ok(`the inline link lasts ${Math.round(lifetime / 60)} minutes — long enough to watch and seek`);
    else bad(`the inline link lasts only ${lifetime}s; seeking a long video will fail`);
  } else {
    bad('could not read the signed link back to check its lifetime');
  }

  // A range request is what a seek actually is. It must come back 206 with the bytes.
  const ranged = await page.request.get(inline.url, { headers: { Range: 'bytes=0-1023' } });
  if (ranged.status() === 206) ok('a range request (what a seek is) returns 206 from storage');
  else bad(`a range request returned ${ranged.status()} — seeking will not work`);
} catch (err) {
  bad(`stopped early: ${err.message}`);
} finally {
  if (nodeId) {
    const del = await api.del(`/api/admin/files/${nodeId}`);
    console.log(del.ok() ? `\n  cleaned up (${nodeId} deleted)` : `\n  NOTE: could not delete ${nodeId} — remove it by hand`);
  }
  await browser.close();
}

console.log(findings.length === 0
  ? '\n✓ A video can be uploaded to the Files area and watched there.\n'
  : `\n✗ ${findings.length} problem(s):\n${findings.map((f) => `   · ${f}`).join('\n')}\n`);
process.exit(findings.length === 0 ? 0 : 1);
