// lib/scan/downloads.ts — where the Starr Scan helper is downloaded from, per OS.
//
// Built by .github/workflows/scan-helper-release.yml on a `scan-helper-v*` tag and attached to that
// GitHub release. The version here is the one the setup page offers; bump it with the tag.

export const SCAN_HELPER_VERSION = '1.0.1';
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
    url: `${BASE}/starr-scan-mac`,
    steps: [
      'Open Terminal, then run:  chmod +x ~/Downloads/starr-scan-mac && ~/Downloads/starr-scan-mac',
      'If macOS says it cannot be opened, open System Settings › Privacy & Security and choose "Open Anyway", then run the command again.',
      'It starts when you log in from now on.',
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
