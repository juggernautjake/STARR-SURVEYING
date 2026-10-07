// scan-helper/src/autostart.mjs — start the helper with the computer, so Scan just works.
//
// Windows: a shortcut in the Startup folder. Mac: a LaunchAgent. Linux: an XDG autostart entry.
// Each runs the same program the person installed, with no window.
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { OS, HOME, run } from './util.mjs';

/** The command that starts the helper: the packaged executable, or node + this script. */
function command() {
  const exe = process.execPath;
  const script = process.argv[1];
  const packaged = !/node(\.exe)?$/i.test(path.basename(exe));
  return packaged ? { file: exe, args: ['--background'] } : { file: exe, args: [path.resolve(script), '--background'] };
}

export async function installAutostart() {
  const { file, args } = command();
  if (OS === 'win32') {
    // A .vbs in the Startup folder runs the helper with window style 0 — fully hidden. A shortcut to
    // a console program would show a console window at every login.
    const startupDir = path.join(process.env.APPDATA ?? path.join(HOME, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const vbs = path.join(startupDir, 'Starr Scan.vbs');
    const line = [file, ...args].map((a) => `""${a}""`).join(' ');
    writeFileSync(vbs, `CreateObject("WScript.Shell").Run "${line}", 0, False\r\n`);
    await run('wscript.exe', [vbs], { timeout: 10_000 });
    return `Starr Scan will start with Windows (${vbs}).`;
  }
  if (OS === 'darwin') {
    const dir = path.join(HOME, 'Library', 'LaunchAgents');
    mkdirSync(dir, { recursive: true });
    const plist = path.join(dir, 'com.starrsurveying.scan.plist');
    writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.starrsurveying.scan</string>
  <key>ProgramArguments</key><array>${[file, ...args].map((a) => `<string>${a}</string>`).join('')}</array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>`);
    await run('launchctl', ['load', '-w', plist]);
    return `Starr Scan will start when you log in (${plist}).`;
  }
  const dir = path.join(HOME, '.config', 'autostart');
  mkdirSync(dir, { recursive: true });
  const entry = path.join(dir, 'starr-scan.desktop');
  writeFileSync(entry, `[Desktop Entry]\nType=Application\nName=Starr Scan\nExec=${[file, ...args].map((a) => `"${a}"`).join(' ')}\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n`);
  // Start it now too, not only at the next login.
  spawn(file, args, { detached: true, stdio: 'ignore' }).unref();
  return `Starr Scan will start when you log in (${entry}).`;
}

export async function uninstallAutostart() {
  const targets = OS === 'win32'
    ? ['Starr Scan.vbs', 'Starr Scan.lnk'].map((f) => path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', f))
    : OS === 'darwin' ? [path.join(HOME, 'Library', 'LaunchAgents', 'com.starrsurveying.scan.plist')]
      : [path.join(HOME, '.config', 'autostart', 'starr-scan.desktop')];
  for (const t of targets) if (existsSync(t)) {
    if (OS === 'darwin') await run('launchctl', ['unload', t]);
    rmSync(t, { force: true });
  }
  return 'Starr Scan will no longer start automatically.';
}
