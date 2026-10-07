// scan-helper/src/util.mjs — small shared pieces: running programs, temp folders, logging.
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir, homedir, platform } from 'node:os';
import path from 'node:path';

export const OS = platform(); // 'win32' | 'darwin' | 'linux'

export const HOME = homedir();

/** Where scans are written while they wait for the person to preview and save them. */
export const WORK_DIR = path.join(tmpdir(), 'starr-scan');
mkdirSync(WORK_DIR, { recursive: true });

/** The folder any scanning app can save into; everything that lands here is offered to the site. */
export const INBOX_DIR = path.join(HOME, 'Documents', 'Starr Scans');
mkdirSync(INBOX_DIR, { recursive: true });

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/** Run a program and collect its output. Never throws; resolves with the exit code. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: opts.timeout ?? 60_000, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: err ? String(err.message ?? err) : null });
    });
  });
}

/** Run a program, calling `onLine` for each line of stdout as it arrives (scans report page by page). */
export function runStreaming(cmd, args, onLine, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, ...opts });
    let buf = '';
    let err = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => resolve({ code: 1, stderr: String(e.message ?? e) }));
    child.on('close', (code) => {
      if (buf.trim()) onLine(buf.trim());
      resolve({ code: code ?? 1, stderr: err });
    });
  });
}

/** Is a program on the PATH? */
export async function which(cmd) {
  const r = await run(OS === 'win32' ? 'where' : 'which', [cmd], { timeout: 5000 });
  return r.code === 0 ? r.stdout.split(/\r?\n/)[0].trim() || null : null;
}

export function firstExisting(paths) {
  for (const p of paths) if (p && existsSync(p)) return p;
  return null;
}

/** Run a PowerShell script (Windows). The script is passed base64-encoded so quoting cannot break it. */
export function powershellArgs(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
}
