// scan-helper/src/server.mjs — the Starr Scan helper: lets the Starr Surveying website use the
// scanners and scanning apps on this computer.
//
// Owner, 2026-10-06: "I want it so that virtually any scanner can work with our STARR SURVEYING
// system. As long as it is functioning and hooked up to the computer in some way and we can use it,
// I want it so that everything works." A web page cannot reach a scanner on any OS — browsers do not
// allow it — so this small program runs in the background and answers on 127.0.0.1 only:
//
//   GET    /v1/status               scanners (WIA, TWAIN via NAPS2, SANE, network eSCL) and scanning
//                                   apps found right now, plus installed-but-asleep scanners
//   POST   /v1/scan                 { sourceId, source, dpi, color } → { jobId }
//   POST   /v1/apps/launch          { appId } → { jobId }; opens the app and collects what it saves
//   GET    /v1/jobs/:id             { state, error, pages[] }
//   GET    /v1/jobs/:id/pages/:n    the page image (or PDF) itself
//   DELETE /v1/jobs/:id             discard the job's temporary files
//
// The website does the uploading, under the signed-in person's own session; this program holds no
// credentials and never talks to the internet. It answers only pages from the Starr Surveying site
// (and local development), so another website cannot drive the scanner.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { OS, WORK_DIR, INBOX_DIR, log } from './util.mjs';
import { listWia, installedWia, scanWia } from './drivers/wia.mjs';
import { listNaps2, scanNaps2, naps2Path } from './drivers/naps2.mjs';
import { listSane, scanSane } from './drivers/sane.mjs';
import { discover, scanEscl } from './drivers/escl.mjs';
import { listApps, launchApp, newFilesSince } from './apps.mjs';

export const VERSION = '1.0.1';
export const PORT = Number(process.env.STARR_SCAN_PORT || 47615);

const ALLOWED_ORIGINS = new Set([
  'https://www.starr-surveying.com',
  'https://starr-surveying.com',
  'http://localhost:3000',
  'http://localhost:3100',
  ...(process.env.STARR_SCAN_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]);

/** Starr preview deployments on Vercel are allowed too, so a branch can be tested end to end. */
export function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^https:\/\/starr-surveying-[a-z0-9-]+\.vercel\.app$/.test(origin);
}

// ── device list, cached briefly: the website polls every few seconds while the modal is open ──────
let devices = { at: 0, list: [], installed: [], busy: null };
async function refreshDevices(force = false) {
  if (!force && Date.now() - devices.at < 4000) return devices;
  if (devices.busy) return devices.busy;
  devices.busy = (async () => {
    const [wia, naps2, sane, escl, installed] = await Promise.all([
      listWia().catch(() => []),
      listNaps2().catch(() => []),
      listSane().catch(() => []),
      discover(1200).catch(() => []),
      installedWia().catch(() => []),
    ]);
    // The same scanner can show up through WIA and TWAIN; keep both (they behave differently) but
    // list the built-in route first.
    devices = { at: Date.now(), list: [...wia, ...escl, ...sane, ...naps2], installed, busy: null };
    return devices;
  })();
  return devices.busy;
}

// ── jobs ─────────────────────────────────────────────────────────────────────────────────────────
const jobs = new Map();

function newJob(kind, extra) {
  const id = randomUUID();
  const dir = path.join(WORK_DIR, id);
  mkdirSync(dir, { recursive: true });
  const job = { id, kind, dir, state: 'scanning', error: null, pages: [], createdAt: Date.now(), ...extra };
  jobs.set(id, job);
  return job;
}

function addPage(job, file) {
  const st = statSync(file);
  job.pages.push({ n: job.pages.length + 1, file, name: path.basename(file), size: st.size, type: typeOf(file) });
}

function typeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.bmp': 'image/bmp', '.pdf': 'application/pdf', '.webp': 'image/webp', '.heic': 'image/heic' }[ext] ?? 'application/octet-stream';
}

async function startScan(body) {
  const sourceId = String(body.sourceId ?? '');
  const opts = {
    sourceId,
    source: ['flatbed', 'duplex', 'feeder'].includes(body.source) ? body.source : 'feeder',
    dpi: Math.max(75, Math.min(1200, Number(body.dpi) || 200)),
    color: ['color', 'gray', 'bw'].includes(body.color) ? body.color : 'color',
  };
  const scanner = sourceId.startsWith('wia:') ? scanWia
    : sourceId.startsWith('naps2:') ? scanNaps2
      : sourceId.startsWith('sane:') ? scanSane
        : sourceId.startsWith('escl:') ? scanEscl : null;
  if (!scanner) throw Object.assign(new Error('Unknown scanner.'), { status: 400 });
  if ([...jobs.values()].some((j) => j.kind === 'device' && j.state === 'scanning')) {
    throw Object.assign(new Error('A scan is already running.'), { status: 409 });
  }
  const job = newJob('device', { sourceId });
  log(`scan ${job.id} on ${sourceId} (${opts.source}, ${opts.dpi} dpi, ${opts.color})`);
  scanner({ ...opts, outDir: job.dir }, (file) => addPage(job, file))
    .then(() => { job.state = 'done'; log(`scan ${job.id}: ${job.pages.length} pages`); })
    .catch((e) => { job.state = 'error'; job.error = e.message || String(e); log(`scan ${job.id} failed: ${job.error}`); });
  return job;
}

async function startApp(body) {
  const app = await launchApp(String(body.appId ?? ''));
  const job = newJob('app', { appId: app.id, appName: app.name, folders: app.folders, since: Date.now(), state: 'waiting' });
  log(`app ${app.name} opened for job ${job.id}; watching ${app.folders.join(' | ')}`);
  return job;
}

/** An app job's pages are whatever has been saved into its folders since it was opened. */
function refreshAppJob(job) {
  if (job.kind !== 'app') return;
  const seen = new Set(job.pages.map((p) => p.file));
  for (const f of newFilesSince(job.folders, job.since)) {
    if (seen.has(f.path)) continue;
    // Skip a file that is still being written: its size must be stable for a moment.
    const st = statSync(f.path);
    if (Date.now() - st.mtimeMs < 1500) continue;
    addPage(job, f.path);
  }
}

function jobView(job) {
  if (job.kind === 'app') refreshAppJob(job);
  return {
    id: job.id, kind: job.kind, state: job.state, error: job.error,
    appName: job.appName ?? null,
    pages: job.pages.map(({ n, name, size, type }) => ({ n, name, size, type })),
  };
}

function discard(job) {
  // Only the helper's own temporary folder is deleted. Files an app saved into the person's
  // Documents are theirs and are left alone.
  try { rmSync(job.dir, { recursive: true, force: true }); } catch { /* */ }
  jobs.delete(job.id);
}

// Temporary scans nobody saved are cleared after a day.
setInterval(() => {
  for (const j of jobs.values()) if (Date.now() - j.createdAt > 24 * 3600_000) discard(j);
}, 3600_000).unref();

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isBuf ? headers['Content-Type'] ?? 'application/octet-stream' : 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = originAllowed(origin)
      ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Chrome's Private Network Access: a public site asking a local address must be told yes.
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      }
      : {};
    if (req.method === 'OPTIONS') { res.writeHead(origin && !originAllowed(origin) ? 403 : 204, cors); res.end(); return; }
    // A browser always sends Origin on these requests; refuse any other website outright.
    if (origin && !originAllowed(origin)) { send(res, 403, { error: 'This site may not use the scanner.' }); return; }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && url.pathname === '/v1/status') {
        const d = await refreshDevices(url.searchParams.get('refresh') === '1');
        const apps = await listApps().catch(() => []);
        send(res, 200, {
          app: 'starr-scan', version: VERSION, os: OS, inbox: INBOX_DIR,
          sources: [...d.list, ...apps.map(({ id, kind, driver, name }) => ({ id, kind, driver, name }))],
          installed: d.installed,
          naps2: Boolean(await naps2Path()),
          busy: [...jobs.values()].some((j) => j.kind === 'device' && j.state === 'scanning'),
        }, cors);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/scan') {
        const job = await startScan(await readJson(req));
        send(res, 202, jobView(job), cors);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/apps/launch') {
        const job = await startApp(await readJson(req));
        send(res, 202, jobView(job), cors);
        return;
      }
      if (parts[0] === 'v1' && parts[1] === 'jobs' && parts[2]) {
        const job = jobs.get(parts[2]);
        if (!job) { send(res, 404, { error: 'No such scan.' }, cors); return; }
        if (req.method === 'DELETE' && parts.length === 3) { discard(job); send(res, 200, { ok: true }, cors); return; }
        if (req.method === 'POST' && parts[3] === 'finish') { job.state = 'done'; send(res, 200, jobView(job), cors); return; }
        if (req.method === 'GET' && parts.length === 3) { send(res, 200, jobView(job), cors); return; }
        if (req.method === 'GET' && parts[3] === 'pages' && parts[4]) {
          const page = job.pages[Number(parts[4]) - 1];
          if (!page || !existsSync(page.file)) { send(res, 404, { error: 'No such page.' }, cors); return; }
          send(res, 200, readFileSync(page.file), { ...cors, 'Content-Type': page.type });
          return;
        }
      }
      if (req.method === 'GET' && url.pathname === '/') {
        send(res, 200, { app: 'starr-scan', version: VERSION, ok: true }, cors);
        return;
      }
      send(res, 404, { error: 'Not found.' }, cors);
    } catch (e) {
      send(res, e.status ?? 500, { error: e.message || String(e) }, cors);
    }
  });
}

// The entry point (start, --install, --uninstall) is src/main.mjs, so this module can be imported by
// tests without starting a server.
export { refreshDevices, INBOX_DIR, log };
