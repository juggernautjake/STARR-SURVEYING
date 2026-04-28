/**
 * OTA updates wiring (Batch HH, F0 closer).
 *
 * Closes the F0 deferral *"OTA updates working — `expo-updates`
 * installed but `app.json` has no `"updates"` block (no channel URL
 * set). Need to flip on once EAS Update is provisioned."*
 *
 * Two-channel update strategy:
 *
 *   1. **Silent cold-start check** (`useCheckForUpdatesOnLaunch`)
 *      mounts at the root, fires once per app launch, and applies
 *      any available update with `Updates.reloadAsync()`. Surveyors
 *      reopening the app after a critical fix lands get it
 *      automatically — no UI friction. Uses a 60 s timeout so a
 *      bad CDN / no-signal launch never blocks startup.
 *
 *   2. **Manual "Check for updates"** (`useManualUpdateCheck`)
 *      lives behind a Me-tab button so a surveyor can pull a fresh
 *      JS bundle on-demand. Returns explicit state
 *      (`'idle' | 'checking' | 'downloading' | 'no-update' | 'error'`)
 *      so the UI can render a useful caption.
 *
 * Activation gate: requires `app.json.expo.updates.url` pointing at
 * an EAS Update channel. Without that, `Updates.checkForUpdateAsync`
 * returns `isAvailable: false` immediately — both hooks degrade
 * silently and remain safe to ship in builds that haven't yet been
 * connected to a channel. Run `eas update:configure` when the EAS
 * project is provisioned to flip the URL on; the wiring in this
 * file requires no further changes.
 *
 * Resilience: every async call is wrapped in try/catch. Network
 * failures, CDN 5xx, and the no-channel-configured case all log a
 * warn breadcrumb instead of crashing the launch path.
 */
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';

import { logInfo, logWarn } from './log';
import { isOnlineNow } from './networkState';

/** Cap so a stuck CDN call never blocks app launch. 60 s is generous
 *  against typical EAS CDN latency. */
const COLD_START_TIMEOUT_MS = 60_000;

/** Fire-and-forget cold-start update check. Mount once at the root
 *  layout (alongside `<UploadQueueDrainer />` etc).
 *
 *  Behavior:
 *   - Skips when expo-updates isn't enabled (dev mode, no URL set).
 *   - Skips when offline at launch — there's no point trying.
 *   - On `isAvailable=true` → fetch + `reloadAsync()`. The next
 *     paint is the new bundle.
 *   - All errors log a warn and bail; the user keeps the existing
 *     bundle. */
export function useCheckForUpdatesOnLaunch(): void {
  useEffect(() => {
    if (!Updates.isEnabled) {
      logInfo('otaUpdates.coldStart', 'expo-updates disabled — skipping');
      return;
    }
    if (__DEV__) {
      // Dev builds don't pull OTAs; they're served from Metro.
      return;
    }
    if (!isOnlineNow()) {
      logInfo('otaUpdates.coldStart', 'offline — skipping');
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      cancelled = true;
      logWarn('otaUpdates.coldStart', 'timed out', null, {
        timeout_ms: COLD_START_TIMEOUT_MS,
      });
    }, COLD_START_TIMEOUT_MS);
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (cancelled) return;
        if (!check.isAvailable) {
          logInfo('otaUpdates.coldStart', 'no update', {
            current_id: Updates.updateId ?? null,
          });
          return;
        }
        logInfo('otaUpdates.coldStart', 'fetching', {
          current_id: Updates.updateId ?? null,
        });
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        logInfo('otaUpdates.coldStart', 'reloading');
        // reloadAsync() throws if a fetch hadn't actually landed,
        // so the await above gates it correctly.
        await Updates.reloadAsync();
      } catch (err) {
        if (cancelled) return;
        logWarn('otaUpdates.coldStart', 'check/fetch failed', err);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
}

export type ManualUpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading' }
  | { kind: 'no-update'; checkedAt: string }
  | { kind: 'ready-to-restart' }
  | { kind: 'error'; message: string };

interface ManualUpdateApi {
  state: ManualUpdateState;
  check: () => Promise<void>;
  restart: () => Promise<void>;
}

/** Hand-rolled "Check for updates" controller for the Me-tab
 *  button. Exposes explicit state transitions so the UI can render
 *  a useful caption + spinner.
 *
 *  When an update is available, we download immediately + transition
 *  to 'ready-to-restart' (rather than auto-reloading) so the user
 *  finishes their current task before we yank the JS context. */
export function useManualUpdateCheck(): ManualUpdateApi {
  const [state, setState] = useState<ManualUpdateState>({ kind: 'idle' });

  const check = useCallback(async () => {
    if (!Updates.isEnabled) {
      setState({
        kind: 'error',
        message:
          'OTA updates aren’t enabled in this build. Reinstall from the App Store / Play Store to upgrade.',
      });
      return;
    }
    if (!isOnlineNow()) {
      setState({
        kind: 'error',
        message: 'No reception. Try again when you have signal.',
      });
      return;
    }
    setState({ kind: 'checking' });
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setState({
          kind: 'no-update',
          checkedAt: new Date().toISOString(),
        });
        logInfo('otaUpdates.manualCheck', 'no update', {
          current_id: Updates.updateId ?? null,
        });
        return;
      }
      setState({ kind: 'downloading' });
      await Updates.fetchUpdateAsync();
      setState({ kind: 'ready-to-restart' });
      logInfo('otaUpdates.manualCheck', 'fetched — ready to restart', {
        current_id: Updates.updateId ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message: msg });
      logWarn('otaUpdates.manualCheck', 'failed', err);
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message: msg });
      logWarn('otaUpdates.restart', 'reload failed', err);
    }
  }, []);

  return { state, check, restart };
}

/** Snapshot of version-related constants for the Me-tab About row.
 *  All fields are best-effort — `runtimeVersion` is null in dev,
 *  `updateId` is null when running the embedded bundle, etc. */
export interface AppVersionInfo {
  /** App store version from app.json (`expo.version`). */
  appVersion: string | null;
  /** Runtime version string the OTA targets. Same string as
   *  `app.json.expo.runtimeVersion` after policy resolution. */
  runtimeVersion: string | null;
  /** EAS Update channel ('production' / 'preview' / 'development').
   *  Null when no channel is configured. */
  channel: string | null;
  /** UUID of the currently-running update, OR null when running the
   *  bundle compiled into the binary. */
  updateId: string | null;
  /** True when expo-updates can theoretically apply OTAs. False in
   *  dev mode + when no URL is configured. */
  enabled: boolean;
}

export function getAppVersionInfo(): AppVersionInfo {
  // expo-updates exposes these as constants. Cast through `unknown`
  // for the channel since the type isn't always present in older
  // versions of @types/expo-updates.
  return {
    // Updates.nativeAppVersion exists at runtime; type-cast since
    // not all versions of @types declare it.
    appVersion:
      (Updates as unknown as { nativeAppVersion?: string | null })
        .nativeAppVersion ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
    channel: Updates.channel ?? null,
    updateId: Updates.updateId ?? null,
    enabled: Updates.isEnabled,
  };
}
