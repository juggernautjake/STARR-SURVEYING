// lib/scan/downloads.ts — where the Starr Scan helper is downloaded from, per OS.
//
// Built by .github/workflows/scan-helper-release.yml on a `scan-helper-v*` tag and attached to that
// GitHub release. The version here is the one the setup page offers; bump it with the tag.

export const SCAN_HELPER_VERSION = '1.0.2';
const BASE = `https://github.com/juggernautjake/STARR-SURVEYING/releases/download/scan-helper-v${SCAN_HELPER_VERSION}`;

export interface HelperDownload {
  os: 'windows' | 'mac' | 'linux';
  label: string;
  url: string;
  steps: string[];
}

export const SCAN_HELPER_DOWNLOADS: HelperDownload[] = [
  {
    os: 'windows',
    label: 'Windows',
    url: `${BASE}/starr-scan-windows.exe`,
    steps: [
      'Open the downloaded starr-scan-windows.exe. If Windows SmartScreen says it does not recognise the app, choose "More info", then "Run anyway".',
      'A small window says "Starr Scan is installed and running" and closes itself.',
      'That is all — it starts with Windows from now on, with no window. This page turns green.',
    ],
  },
  {
    os: 'mac',
    label: 'Mac',
    url: `${BASE}/Starr-Scan-mac.zip`,
    steps: [
      'Open the downloaded Starr-Scan-mac.zip (Safari usually opens it for you) and drag "Starr Scan" into your Applications folder.',
      'Double-click "Starr Scan". macOS will say it cannot check the app — click Done, open System Settings › Privacy & Security, scroll down and click "Open Anyway", then open it again.',
      'A message says Starr Scan is installed and running. It starts when you log in from now on, with no window.',
    ],
  },
  {
    os: 'linux',
    label: 'Linux',
    url: `${BASE}/starr-scan-linux`,
    steps: [
      'Run:  chmod +x ~/Downloads/starr-scan-linux && ~/Downloads/starr-scan-linux',
      'For USB scanners, install SANE if `scanimage -L` is missing (Debian/Ubuntu: sudo apt install sane-utils).',
      'It starts when you log in from now on.',
    ],
  },
];
