// lib/scan/setup.ts — what the Scan pop-up says when there is nothing to scan with yet.
//
// Owner, 2026-10-06: "If there are none, then the scanning button will just open a modal that tells
// the user what they need to do to set up scanning. As soon as the computer senses the user has made
// the changes and met the requirements for scanning, the scanning options will become available."
//
// Pure: the helper's status (or null) and the visitor's OS in, the steps out. The pop-up re-asks the
// helper every few seconds, so each step disappears the moment it is done.
import type { HelperStatus } from './helper-client';

export type SetupState =
  /** The helper is not running (or not installed) on this computer. */
  | 'no-helper'
  /** The helper runs but sees no scanner and no scanning app. */
  | 'no-sources'
  /** A scanner is installed but switched off or asleep. */
  | 'scanner-asleep'
  /** Ready: at least one scanner or app. */
  | 'ready'
  /** A phone or tablet: the camera is the scanner; no helper exists for these. */
  | 'mobile';

export interface SetupStep { title: string; detail: string }

export interface SetupAdvice {
  state: SetupState;
  headline: string;
  steps: SetupStep[];
}

type Os = 'windows' | 'mac' | 'linux' | 'ios' | 'android' | 'chromeos' | 'other';

const HELPER_STEP: Record<string, SetupStep> = {
  windows: {
    title: 'Install the Starr Scan helper',
    detail: 'Download it below and run it once. It starts with Windows from then on and lets this website use the scanners and scanning apps on this computer. It needs no account and never connects to the internet.',
  },
  mac: {
    title: 'Install the Starr Scan helper',
    detail: 'Download it below, open it, and allow it in System Settings › Privacy & Security if macOS asks. It starts when you log in from then on.',
  },
  linux: {
    title: 'Install the Starr Scan helper',
    detail: 'Download it below and run it once (it adds itself to your login items). For USB scanners it uses SANE — install the "sane-utils" package if `scanimage -L` is not available.',
  },
  chromeos: {
    title: 'Scan from another app, then upload',
    detail: 'Chromebooks cannot run the helper. Open the Scan app (it finds most USB and Wi-Fi scanners), save the scan, then choose "Upload a scan you already have" here.',
  },
  other: {
    title: 'Install the Starr Scan helper',
    detail: 'The helper runs on Windows, Mac and Linux. On anything else, scan with your usual app and use "Upload a scan you already have".',
  },
};

export function adviseSetup(status: HelperStatus | null, os: Os): SetupAdvice {
  if (os === 'ios' || os === 'android') {
    return {
      state: 'mobile',
      headline: 'On a phone, the camera is your scanner.',
      steps: [{ title: 'Scan with the camera', detail: 'Take a photo of each page. You will see every page before anything is saved.' }],
    };
  }
  if (!status) {
    return {
      state: 'no-helper',
      headline: 'This computer is not set up to scan here yet.',
      steps: [
        HELPER_STEP[os] ?? HELPER_STEP.other,
        { title: 'Connect your scanner', detail: 'Plug it in with its USB cable (or connect it to the same Wi-Fi), and turn it on. If it works with your computer\'s own scan app, it will work here.' },
        { title: 'Come back here', detail: 'This window checks every few seconds. Your scanner appears as soon as it is ready — there is nothing to refresh.' },
      ],
    };
  }
  const devices = status.sources.filter((s) => s.kind === 'device');
  const apps = status.sources.filter((s) => s.kind === 'app');
  const asleep = (status.installed ?? []).filter((i) => !i.present);
  if (devices.length || apps.length) {
    return { state: 'ready', headline: '', steps: asleep.length && !devices.length ? [wakeStep(asleep[0].name)] : [] };
  }
  if (asleep.length) {
    return {
      state: 'scanner-asleep',
      headline: `${asleep[0].name} is installed but switched off.`,
      steps: [wakeStep(asleep[0].name)],
    };
  }
  return {
    state: 'no-sources',
    headline: 'The helper is running, but it cannot see a scanner yet.',
    steps: [
      { title: 'Connect and turn on the scanner', detail: 'USB: plug it in and switch it on. Wi-Fi: make sure it is on the same network as this computer.' },
      {
        title: 'Install its driver if needed',
        detail: os === 'windows'
          ? 'If Windows Scan cannot see it either, install the driver from the scanner maker\'s website. Scanners that only have a TWAIN driver also need NAPS2 (free, naps2.com).'
          : os === 'mac'
            ? 'If Image Capture cannot see it either, install the maker\'s driver. NAPS2 (free, naps2.com) adds TWAIN scanners.'
            : 'Run `scanimage -L` in a terminal; if it lists nothing, install the SANE backend for your scanner.',
      },
      { title: 'It appears here on its own', detail: 'This window checks every few seconds.' },
    ],
  };
}

function wakeStep(name: string): SetupStep {
  return {
    title: `Turn on ${name}`,
    detail: 'Press its power button, or feed it a page — many scanners switch themselves off when idle and wake when paper goes in. It appears here within a few seconds.',
  };
}
