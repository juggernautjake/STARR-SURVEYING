// scan-helper/src/drivers/naps2.mjs — TWAIN (Windows), Apple Image Capture (Mac) and SANE (Linux)
// through NAPS2's command line.
//
// NAPS2 is free, open-source scanning software that speaks every scanner protocol each OS has. When
// it is installed, its console program gives this helper TWAIN — which is how most scanner makers'
// own software talks to their hardware — without a native module. When it is not installed, this
// driver simply reports nothing and the setup guide offers it as the way to reach a TWAIN-only or
// Mac-only scanner.
import path from 'node:path';
import { readdirSync } from 'node:fs';
import { run, which, firstExisting, OS } from '../util.mjs';

export async function naps2Path() {
  if (OS === 'win32') {
    return firstExisting([
      'C:\\Program Files\\NAPS2\\NAPS2.Console.exe',
      'C:\\Program Files (x86)\\NAPS2\\NAPS2.Console.exe',
    ]) ?? (await which('NAPS2.Console.exe'));
  }
  if (OS === 'darwin') return firstExisting(['/Applications/NAPS2.app/Contents/MacOS/NAPS2']);
  return (await which('naps2')) ?? firstExisting(['/usr/bin/naps2', '/opt/naps2/naps2']);
}

/** The drivers NAPS2 offers on this OS. WIA is left to the built-in driver on Windows. */
function driversHere() {
  if (OS === 'win32') return ['twain'];
  if (OS === 'darwin') return ['apple', 'twain'];
  return ['sane'];
}

function consoleArgs(exe, args) {
  // On Mac and Linux the NAPS2 binary runs its console with a `console` subcommand.
  return OS === 'win32' ? args : ['console', ...args];
}

export async function listNaps2() {
  const exe = await naps2Path();
  if (!exe) return [];
  const out = [];
  for (const driver of driversHere()) {
    const r = await run(exe, consoleArgs(exe, ['--listdevices', '--driver', driver]), { timeout: 45_000 });
    if (r.code !== 0) continue;
    for (const name of r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      out.push({
        id: `naps2:${driver}:${name}`,
        kind: 'device',
        driver: driver === 'twain' ? 'twain' : driver === 'apple' ? 'image-capture' : 'sane',
        name,
        maker: null,
        sources: ['feeder', 'flatbed', 'duplex'],
        dpis: [150, 200, 300, 600],
        via: 'NAPS2',
      });
    }
  }
  return out;
}

export async function scanNaps2(opts, onPage) {
  const exe = await naps2Path();
  if (!exe) throw new Error('NAPS2 is not installed.');
  const [, driver, ...rest] = opts.sourceId.split(':');
  const device = rest.join(':');
  const source = opts.source === 'flatbed' ? 'glass' : opts.source === 'duplex' ? 'duplex' : 'feeder';
  const bitdepth = opts.color === 'gray' ? 'gray' : opts.color === 'bw' ? 'bw' : 'color';
  const pattern = path.join(opts.outDir, 'page-$(nnn).png');
  const r = await run(exe, consoleArgs(exe, [
    '-o', pattern, '--split', '--force',
    '--driver', driver, '--device', device,
    '--source', source, '--dpi', String(opts.dpi), '--bitdepth', bitdepth,
  ]), { timeout: 15 * 60_000 });
  const pages = readdirSync(opts.outDir).filter((f) => /^page-\d+\.png$/.test(f)).sort();
  if (!pages.length) throw new Error((r.stderr || r.stdout).trim().split(/\r?\n/).pop() || 'The scan produced no pages.');
  for (const p of pages) onPage(path.join(opts.outDir, p));
  return pages.length;
}
