// scan-helper/src/main.mjs — start the Starr Scan helper (or install/uninstall it at login).
//
//   starr-scan              (double-click) set it to start with the computer, start it, and close
//   starr-scan --background the long-running copy that answers the Starr Surveying website
//   starr-scan --foreground the same, attached to this terminal (for troubleshooting)
//   starr-scan --install    start with the computer from now on (and start now)
//   starr-scan --uninstall  stop starting with the computer
import { createServer, refreshDevices, PORT, VERSION } from './server.mjs';
import { installAutostart, uninstallAutostart } from './autostart.mjs';
import { INBOX_DIR, log } from './util.mjs';

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--version')) { console.log(VERSION); return; }
  if (argv.includes('--install')) { console.log(await installAutostart()); return; }
  if (argv.includes('--uninstall')) { console.log(await uninstallAutostart()); return; }
  // Double-clicked (no --background): install for login, start the hidden background copy, say so,
  // and close. The background copy is the one that serves the website.
  if (!argv.includes('--background') && !argv.includes('--foreground')) {
    console.log('Setting up Starr Scan…');
    console.log(await installAutostart());
    console.log('Starr Scan is installed and running in the background. You can close this window.');
    await new Promise((r) => setTimeout(r, 6000));
    return;
  }
  createServer().listen(PORT, '127.0.0.1', () => {
    log(`Starr Scan ${VERSION} listening on http://127.0.0.1:${PORT} (scans saved to ${INBOX_DIR} are picked up)`);
    refreshDevices(true).then((d) => log(`found ${d.list.length} scanner(s)`));
  }).on('error', (e) => {
    if (e.code === 'EADDRINUSE') { log('Starr Scan is already running.'); process.exit(0); }
    throw e;
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
