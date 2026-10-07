// scan-helper/src/apps.mjs — scanning apps already on this computer, and the folders they save to.
//
// Owner, 2026-10-06: "a menu that allows us to select what app we wanna use to scan with or what
// device". Any app works the same way: the helper opens it, the person scans as they always do, and
// whatever the app saves — into the Starr Scans folder, or the app's own usual folder — appears in
// the website's preview, ready to confirm. Nothing about the app needs to change.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { OS, HOME, INBOX_DIR, firstExisting, which } from './util.mjs';

const PF = process.env.ProgramFiles ?? 'C:\\Program Files';
const PF86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
const WIN = process.env.SystemRoot ?? 'C:\\Windows';

/** [id, name, how to find it, folders it saves into by default]. First match per id wins. */
function catalogue() {
  if (OS === 'win32') {
    return [
      ['windows-scan', 'Windows Scan', [{ uwp: 'Microsoft.WindowsScan_8wekyb3d8bbwe!App' }], [path.join(HOME, 'Pictures', 'Scans')]],
      ['windows-fax-scan', 'Windows Fax and Scan', [path.join(WIN, 'System32', 'WFS.exe')], [path.join(HOME, 'Documents', 'Scanned Documents')]],
      ['brother-iprint-scan', 'Brother iPrint&Scan', [path.join(PF86, 'Brother', 'iPrint&Scan', 'Brother iPrint&Scan.exe'), path.join(PF, 'Brother', 'iPrint&Scan', 'Brother iPrint&Scan.exe')], [path.join(HOME, 'Pictures', 'iPrint&Scan'), path.join(HOME, 'Documents', 'iPrint&Scan'), path.join(HOME, 'Pictures', 'ControlCenter4', 'Scan')]],
      ['naps2', 'NAPS2', [path.join(PF, 'NAPS2', 'NAPS2.exe'), path.join(PF86, 'NAPS2', 'NAPS2.exe')], [path.join(HOME, 'Documents')]],
      ['vuescan', 'VueScan', [path.join(PF, 'VueScan', 'vuescan.exe')], [path.join(HOME, 'Documents', 'VueScan'), path.join(HOME, 'Pictures')]],
      ['epson-scan-2', 'Epson Scan 2', [path.join(PF86, 'EPSON', 'Epson Scan 2', 'Core', 'es2launcher.exe')], [path.join(HOME, 'Documents'), path.join(HOME, 'Pictures')]],
      ['canon-ij-scan', 'Canon IJ Scan Utility', [path.join(PF86, 'Canon', 'IJ Scan Utility', 'SCANUTILITY.exe')], [path.join(HOME, 'Documents'), path.join(HOME, 'Pictures')]],
      ['hp-scan', 'HP Scan', [path.join(PF, 'HP', 'HP Scan', 'hpscan.exe'), path.join(PF86, 'HP', 'Digital Imaging', 'bin', 'hpiscnapp.exe')], [path.join(HOME, 'Documents'), path.join(HOME, 'Pictures')]],
      ['scansnap-home', 'ScanSnap Home', [path.join(PF86, 'PFU', 'ScanSnap', 'Home', 'PfuSshMain.exe')], [path.join(HOME, 'Documents', 'ScanSnap')]],
      ['paperstream', 'PaperStream Capture', [path.join(PF86, 'fiScanner', 'PaperStream Capture', 'PSC.exe')], [path.join(HOME, 'Documents')]],
    ];
  }
  if (OS === 'darwin') {
    return [
      ['image-capture', 'Image Capture', ['/System/Applications/Image Capture.app', '/Applications/Image Capture.app'], [path.join(HOME, 'Pictures'), path.join(HOME, 'Documents')]],
      ['preview', 'Preview (File › Import from Scanner)', ['/System/Applications/Preview.app', '/Applications/Preview.app'], [path.join(HOME, 'Documents'), path.join(HOME, 'Desktop')]],
      ['naps2', 'NAPS2', ['/Applications/NAPS2.app'], [path.join(HOME, 'Documents')]],
      ['vuescan', 'VueScan', ['/Applications/VueScan.app'], [path.join(HOME, 'Documents', 'VueScan')]],
      ['scansnap-home', 'ScanSnap Home', ['/Applications/ScanSnap Home.app'], [path.join(HOME, 'Documents', 'ScanSnap')]],
      ['epson-scan-2', 'Epson ScanSmart', ['/Applications/Epson Software/Epson ScanSmart.app'], [path.join(HOME, 'Documents')]],
      ['brother-iprint-scan', 'Brother iPrint&Scan', ['/Applications/Brother iPrint&Scan.app'], [path.join(HOME, 'Documents'), path.join(HOME, 'Pictures')]],
    ];
  }
  return [
    ['simple-scan', 'Document Scanner (Simple Scan)', [{ cmd: 'simple-scan' }], [path.join(HOME, 'Documents'), path.join(HOME, 'Pictures')]],
    ['naps2', 'NAPS2', [{ cmd: 'naps2' }], [path.join(HOME, 'Documents')]],
    ['skanlite', 'Skanlite', [{ cmd: 'skanlite' }], [path.join(HOME, 'Pictures'), path.join(HOME, 'Documents')]],
    ['xsane', 'XSane', [{ cmd: 'xsane' }], [path.join(HOME, 'Pictures'), path.join(HOME, 'Documents')]],
    ['vuescan', 'VueScan', [{ cmd: 'vuescan' }], [path.join(HOME, 'Documents')]],
  ];
}

async function uwpInstalled(appId) {
  const pkg = appId.split('!')[0].split('_')[0];
  const { run, powershellArgs } = await import('./util.mjs');
  const r = await run('powershell.exe', powershellArgs(`if (Get-AppxPackage -Name '${pkg}' -ErrorAction SilentlyContinue) { 'yes' }`), { timeout: 20_000 });
  return r.stdout.includes('yes');
}

async function locate(candidates) {
  for (const c of candidates) {
    if (typeof c === 'string') { if (existsSync(c)) return { path: c }; continue; }
    if (c.uwp && OS === 'win32' && (await uwpInstalled(c.uwp))) return { uwp: c.uwp };
    if (c.cmd) { const p = await which(c.cmd); if (p) return { path: p }; }
  }
  return null;
}

let cache = null;
let cachedAt = 0;

/** Scanning apps installed here. Cached for a minute — this does not change while a modal is open. */
export async function listApps() {
  if (cache && Date.now() - cachedAt < 60_000) return cache;
  const out = [];
  for (const [id, name, candidates, folders] of catalogue()) {
    const where = await locate(candidates);
    if (!where) continue;
    out.push({ id: `app:${id}`, kind: 'app', driver: 'app', name, launch: where, folders: [INBOX_DIR, ...folders] });
  }
  cache = out;
  cachedAt = Date.now();
  return out;
}

export async function launchApp(appId) {
  const app = (await listApps()).find((a) => a.id === appId);
  if (!app) throw new Error('That app is not installed on this computer.');
  const opts = { detached: true, stdio: 'ignore', windowsHide: false };
  if (app.launch.uwp) spawn('explorer.exe', [`shell:AppsFolder\\${app.launch.uwp}`], opts).unref();
  else if (OS === 'darwin') spawn('open', ['-a', app.launch.path], opts).unref();
  else spawn(app.launch.path, [], opts).unref();
  return app;
}

const SCAN_FILE = /\.(pdf|png|jpe?g|tiff?|bmp|heic|webp)$/i;

/** Files in an app's folders that appeared after `since` (ms). Top level only — apps save there. */
export function newFilesSince(folders, since) {
  const found = [];
  for (const dir of new Set(folders)) {
    if (!existsSync(dir)) continue;
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (!SCAN_FILE.test(n)) continue;
      const full = path.join(dir, n);
      try {
        const st = statSync(full);
        if (st.isFile() && st.mtimeMs >= since - 2000 && st.size > 0) found.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
      } catch { /* vanished */ }
    }
  }
  return found.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export { firstExisting };
