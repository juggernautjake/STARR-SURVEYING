/**
 * Centralised permission-denial prompt with Settings deep-link.
 *
 * Camera, location, and notification denials all need the same
 * affordance: a clear "this is what's blocking you, here's how to
 * fix it" alert that takes the user straight to the OS settings.
 * Without a single owner, each callsite invented its own copy and
 * some had no Settings button at all — leaving the user stuck.
 *
 * Two helpers:
 *
 *   promptForSettings({ kind, denialReason? }) — shows the alert.
 *     The user picks "Not now" (no-op) or "Open Settings"
 *     (Linking.openSettings).
 *
 *   isPermissionDeniedError(err) — best-effort detection of the
 *     thrown shape from useCaptureReceipt / useAttachPhoto's
 *     pickAndCompress so the screen can branch on it.
 */
import { Alert, Linking } from 'react-native';

import { logWarn } from './log';

export type PermissionKind = 'camera' | 'photoLibrary' | 'location' | 'notifications';

interface PromptOptions {
  kind: PermissionKind;
  /** Optional second-line context; appears under the body copy. */
  denialReason?: string;
  /** Optional Sentry-extra payload for the breadcrumb. */
  extra?: Record<string, unknown>;
}

/**
 * Show a "we need permission, open Settings?" alert. Logs a
 * `permission.denied` warn breadcrumb so Sentry sees how often users
 * deny each kind (useful for deciding whether to nudge harder).
 */
export function promptForSettings(opts: PromptOptions): void {
  const { kind, denialReason, extra } = opts;
  const copy = COPY_BY_KIND[kind];

  logWarn('permission.denied', kind, undefined, {
    kind,
    reason: denialReason ?? null,
    ...(extra ?? {}),
  });

  const body = denialReason
    ? `${copy.body}\n\n${denialReason}`
    : copy.body;

  Alert.alert(
    copy.title,
    body,
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => {
          // Linking.openSettings opens the app's settings page on iOS
          // and Android. Best-effort: errors are non-fatal (the user
          // still has the app's settings deep link via the OS).
          Linking.openSettings().catch((err) => {
            logWarn('permission.openSettings', 'openSettings failed', err, {
              kind,
            });
          });
        },
      },
    ],
    { cancelable: true }
  );
}

/**
 * Heuristic — does this thrown error look like a permission denial?
 * Catches the shape thrown by lib/storage/mediaUpload.ts and lib/
 * fieldMedia helpers ("Camera permission denied.", "Photo library
 * permission denied."). Used by capture screens to upgrade a generic
 * Alert.alert('Capture failed', err.message) into the
 * promptForSettings flow.
 */
export function isPermissionDeniedError(err: unknown): PermissionKind | null {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes('camera permission denied')) return 'camera';
  if (msg.includes('photo library permission denied')) return 'photoLibrary';
  if (msg.includes('location permission denied')) return 'location';
  return null;
}

interface CopyEntry {
  title: string;
  body: string;
}

const COPY_BY_KIND: Record<PermissionKind, CopyEntry> = {
  camera: {
    title: 'Camera access blocked',
    body: 'Starr Field needs camera access to capture receipts and survey photos. Tap Open Settings, find Starr Field, and turn on Camera.',
  },
  photoLibrary: {
    title: 'Photo library blocked',
    body: 'Starr Field needs photo library access to attach existing photos. Tap Open Settings, find Starr Field, and turn on Photos.',
  },
  location: {
    title: 'Location off',
    body: 'Starr Field uses GPS to stamp clock-ins, survey points, and mileage. Tap Open Settings to turn on location for Starr Field.',
  },
  notifications: {
    title: 'Notifications blocked',
    body: '"Still working?" reminders need notification access. Tap Open Settings to enable them; receipts and points still work without notifications.',
  },
};
