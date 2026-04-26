/**
 * Background GPS tracker — captures location samples while clocked in.
 *
 * Per the user's resilience requirement: "if the gps signal is lost,
 * we just need to keep track of the last known location of the user's
 * phone until they get reception again." This module is the
 * always-on counterpart to lib/location.ts (which only takes one-off
 * fixes at clock-in / clock-out).
 *
 * Lifecycle:
 *
 *   useClockIn  ──► startBackgroundTracking(entryId, userId, email)
 *                   ├─ ensures Always-On location permission
 *                   ├─ writes a 'clock_in' ping (immediate one-shot)
 *                   ├─ registers TASK_NAME with expo-task-manager
 *                   └─ Location.startLocationUpdatesAsync — every 30s
 *                      OR every 50m, whichever comes first
 *
 *   task body   ──► writes one 'background' (or 'foreground') ping
 *                   per update INTO local SQLite. PowerSync's CRUD
 *                   queue replays the inserts when reception returns.
 *
 *   useClockOut ──► stopBackgroundTracking()
 *                   ├─ writes a 'clock_out' ping (immediate one-shot)
 *                   └─ Location.stopLocationUpdatesAsync — task ends
 *
 * Privacy contract (plan §5.10.1): tracking ONLY runs while there's
 * an open job_time_entries row. The task is started by useClockIn
 * and stopped by useClockOut; if the app is killed mid-shift, the
 * task continues running (Android foreground service / iOS deferred
 * updates) until clock-out. The mount-time recovery hook below also
 * STOPS the task on app launch when there's no open clock-in (covers
 * the "phone died, was clocked in" edge case where clock-out never
 * fired).
 *
 * Battery awareness:
 *   - >50% : High accuracy, 30 s / 50 m updates
 *   - 21-50%: Balanced, 60 s / 100 m
 *   - ≤20% : Low, 120 s / 200 m
 *
 * Offline buffering: PowerSync's local SQLite + CRUD queue. We don't
 * need a separate localOnly queue because every INSERT is durable
 * the moment SQLite flushes; the queue replays the row server-side
 * once reception + sync return. The unique index on
 * (user_id, client_id) makes the replay idempotent.
 */
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { getDatabaseForHeadlessTask } from './db';
import { logError, logInfo, logWarn } from './log';
import { randomUUID } from './uuid';

// ── Constants ────────────────────────────────────────────────────────────────

/** Single global task id. Re-registering with the same id is idempotent. */
const TASK_NAME = 'starr-field/location-tracker';

/** AsyncStorage-equivalent key for "currently-tracked entry context."
 *  We use TaskManager's task params (passed at start) for the live
 *  tracker, but keep a copy in module state so the recovery code in
 *  useTrackingLifecycle() can look it up cross-launch without going
 *  through TaskManager's internals. */
let activeEntryContext: ActiveEntryContext | null = null;

interface ActiveEntryContext {
  entryId: string;
  userId: string;
  userEmail: string;
}

interface AccuracyTier {
  accuracy: Location.Accuracy;
  timeIntervalMs: number;
  distanceIntervalM: number;
  /** Diagnostic label included in breadcrumbs. */
  label: 'high' | 'balanced' | 'low';
}

/**
 * Battery-aware tier selection. Re-evaluated on every start; we don't
 * dynamically downgrade mid-shift because expo-location requires a
 * full stop-then-start to change parameters.
 */
async function pickTier(): Promise<AccuracyTier> {
  let battery = 1;
  try {
    battery = await Battery.getBatteryLevelAsync();
  } catch (err) {
    logWarn(
      'locationTracker.pickTier',
      'battery read failed — defaulting to high tier',
      err
    );
  }
  const pct = Math.round(battery * 100);
  if (pct > 50) {
    return {
      accuracy: Location.Accuracy.High,
      timeIntervalMs: 30_000,
      distanceIntervalM: 50,
      label: 'high',
    };
  }
  if (pct > 20) {
    return {
      accuracy: Location.Accuracy.Balanced,
      timeIntervalMs: 60_000,
      distanceIntervalM: 100,
      label: 'balanced',
    };
  }
  return {
    accuracy: Location.Accuracy.Low,
    timeIntervalMs: 120_000,
    distanceIntervalM: 200,
    label: 'low',
  };
}

// ── Permission ───────────────────────────────────────────────────────────────

/**
 * Ensure background ("Always") location permission. iOS requires the
 * user to have already granted "When in use" at least once before
 * "Always" can be requested — Location.requestBackgroundPermissionsAsync
 * handles that ordering internally on supported SDKs.
 *
 * Returns true on grant. On denial we return false; the clock-in
 * flow proceeds without background tracking (clock-in / clock-out
 * stamps still capture coordinates via lib/location.ts).
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
  try {
    // First need foreground; the OS forces this ordering.
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== Location.PermissionStatus.GRANTED) {
      const fgRequest = await Location.requestForegroundPermissionsAsync();
      if (fgRequest.status !== Location.PermissionStatus.GRANTED) {
        logInfo(
          'locationTracker.ensureBackgroundPermission',
          'foreground denied — cannot request background'
        );
        return false;
      }
    }

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === Location.PermissionStatus.GRANTED) return true;

    if (bg.status === 'denied' && !bg.canAskAgain) {
      // Hard-deny — user has to flip in Settings. Caller surfaces a
      // Settings prompt via lib/permissionGuard.
      logInfo(
        'locationTracker.ensureBackgroundPermission',
        'background hard-denied — caller should deep-link Settings'
      );
      return false;
    }

    const requested = await Location.requestBackgroundPermissionsAsync();
    const granted = requested.status === Location.PermissionStatus.GRANTED;
    logInfo('locationTracker.ensureBackgroundPermission', 'prompt result', {
      granted,
      status: requested.status,
    });
    return granted;
  } catch (err) {
    logWarn(
      'locationTracker.ensureBackgroundPermission',
      'permission check failed',
      err
    );
    return false;
  }
}

// ── Task body ────────────────────────────────────────────────────────────────

interface TaskData {
  locations: Location.LocationObject[];
}

interface TaskError {
  code?: string;
  message?: string;
}

interface TaskExecutorBody {
  data?: TaskData;
  error?: TaskError | null;
}

/**
 * The headless task body. expo-task-manager calls this in a JS
 * context detached from the React tree; we can't use hooks here.
 * Reach the DB via the headless escape hatch.
 *
 * Idempotency: every insert uses a fresh UUID for `client_id`, so
 * even if expo-task-manager double-fires the callback (rare iOS
 * deferred-updates behaviour) the unique-index dedup at the server
 * keeps the table clean.
 */
TaskManager.defineTask(
  TASK_NAME,
  async ({ data, error }: TaskExecutorBody) => {
    if (error) {
      logWarn('locationTracker.task', 'task fired with error', undefined, {
        code: error.code ?? null,
        message: error.message ?? null,
      });
      return;
    }
    if (!data || !data.locations || data.locations.length === 0) return;

    const ctx = activeEntryContext;
    if (!ctx) {
      // The task fired but we have no entry context — clock-out
      // happened but the OS hadn't yet stopped the task. Drop the
      // sample; the stop call below catches up.
      logInfo('locationTracker.task', 'fire without active entry — dropping');
      return;
    }

    let battery: { level: number; charging: boolean } | null = null;
    try {
      const [level, state] = await Promise.all([
        Battery.getBatteryLevelAsync(),
        Battery.getBatteryStateAsync(),
      ]);
      battery = {
        level: Math.round(level * 100),
        charging:
          state === Battery.BatteryState.CHARGING ||
          state === Battery.BatteryState.FULL,
      };
    } catch (err) {
      logWarn('locationTracker.task', 'battery read failed', err);
    }

    let db;
    try {
      db = await getDatabaseForHeadlessTask();
    } catch (err) {
      // No DB → drop the samples. They're unrecoverable but the
      // failure is loud (Sentry breadcrumb) so we know the next
      // launch is broken.
      logError('locationTracker.task', 'DB unavailable in task', err);
      return;
    }

    for (const loc of data.locations) {
      try {
        await insertPing(db, {
          ctx,
          loc,
          source: 'background',
          battery,
        });
      } catch (err) {
        logError('locationTracker.task', 'insert failed', err, {
          entry_id: ctx.entryId,
        });
      }
    }
  }
);

// ── Insert helper ────────────────────────────────────────────────────────────

interface InsertArgs {
  ctx: ActiveEntryContext;
  loc: Location.LocationObject;
  source: 'foreground' | 'background' | 'clock_in' | 'clock_out';
  battery: { level: number; charging: boolean } | null;
}

async function insertPing(
  db: Awaited<ReturnType<typeof getDatabaseForHeadlessTask>>,
  args: InsertArgs
): Promise<void> {
  const id = randomUUID();
  const clientId = id; // same uuid, semantic alias
  const capturedAt = new Date(args.loc.timestamp).toISOString();
  const nowIso = new Date().toISOString();

  await db.execute(
    `INSERT INTO location_pings (
       id, user_id, user_email, job_time_entry_id,
       lat, lon, accuracy_m, altitude_m, heading, speed_mps,
       battery_pct, is_charging, source,
       captured_at, created_at, client_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      args.ctx.userId,
      args.ctx.userEmail,
      args.ctx.entryId,
      args.loc.coords.latitude,
      args.loc.coords.longitude,
      args.loc.coords.accuracy ?? null,
      args.loc.coords.altitude ?? null,
      args.loc.coords.heading ?? null,
      args.loc.coords.speed ?? null,
      args.battery?.level ?? null,
      args.battery ? (args.battery.charging ? 1 : 0) : null,
      args.source,
      capturedAt,
      nowIso,
      clientId,
    ]
  );
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface StartTrackingArgs {
  entryId: string;
  userId: string;
  userEmail: string;
}

export interface StartTrackingResult {
  /** True when the OS-registered task is now running. */
  ok: boolean;
  /** True when we got the Always permission, false on denial. The
   *  clock-in flow still completes — surveyor just won't get
   *  background pings. */
  hasBackgroundPermission: boolean;
  /** Accuracy tier we ended up using; null when ok=false. */
  tier: AccuracyTier['label'] | null;
}

/**
 * Start the background tracker for the just-opened time entry. Called
 * from useClockIn after the row INSERT succeeds. Best-effort — the
 * caller MUST treat permission denial as non-fatal.
 */
export async function startBackgroundTracking(
  args: StartTrackingArgs
): Promise<StartTrackingResult> {
  activeEntryContext = {
    entryId: args.entryId,
    userId: args.userId,
    userEmail: args.userEmail,
  };

  const granted = await ensureBackgroundPermission();
  if (!granted) {
    // We still write a single 'clock_in' ping via the foreground
    // location module — that happens upstream in useClockIn. Bail.
    logInfo(
      'locationTracker.start',
      'no background permission — tracker disabled',
      { entry_id: args.entryId }
    );
    return { ok: false, hasBackgroundPermission: false, tier: null };
  }

  const tier = await pickTier();
  logInfo('locationTracker.start', 'starting', {
    entry_id: args.entryId,
    tier: tier.label,
    time_interval_ms: tier.timeIntervalMs,
    distance_interval_m: tier.distanceIntervalM,
  });

  try {
    const isAlready = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (isAlready) {
      // Stop and restart with fresh parameters so the new entry's
      // tier (battery may have changed) takes effect.
      await Location.stopLocationUpdatesAsync(TASK_NAME);
    }

    await Location.startLocationUpdatesAsync(TASK_NAME, {
      accuracy: tier.accuracy,
      timeInterval: tier.timeIntervalMs,
      distanceInterval: tier.distanceIntervalM,
      // showsBackgroundLocationIndicator: iOS' blue pill — we want
      // it on so the user knows tracking is active (privacy
      // expectation per plan §5.10.1).
      showsBackgroundLocationIndicator: true,
      // Foreground service notification on Android. Required when
      // the app might be backgrounded; without this Android kills
      // the task within minutes.
      foregroundService: {
        notificationTitle: 'Starr Field — clocked in',
        notificationBody:
          'Tracking your location for accurate timesheets. Tracking stops the moment you clock out.',
        notificationColor: '#1D3095',
      },
      pausesUpdatesAutomatically: false,
      // Fire deferred updates batched up to ~5min on iOS so we don't
      // drain battery; the OS still surfaces the moment-of-stop
      // ping at clock-out via our explicit one-shot.
      deferredUpdatesInterval: tier.timeIntervalMs,
      deferredUpdatesDistance: tier.distanceIntervalM,
    });

    return {
      ok: true,
      hasBackgroundPermission: true,
      tier: tier.label,
    };
  } catch (err) {
    logError('locationTracker.start', 'startLocationUpdatesAsync failed', err, {
      entry_id: args.entryId,
    });
    activeEntryContext = null;
    return {
      ok: false,
      hasBackgroundPermission: true, // permission is fine, the start failed
      tier: null,
    };
  }
}

/**
 * Stop the tracker. Called from useClockOut BEFORE the entry is
 * closed, so the final 'clock_out' ping carries the live entry id.
 * Idempotent — safe to call when nothing is running.
 */
export async function stopBackgroundTracking(): Promise<void> {
  try {
    const isAlready = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (isAlready) {
      await Location.stopLocationUpdatesAsync(TASK_NAME);
      logInfo('locationTracker.stop', 'stopped');
    } else {
      logInfo('locationTracker.stop', 'no-op (not running)');
    }
  } catch (err) {
    logWarn('locationTracker.stop', 'stop failed (continuing)', err);
  } finally {
    activeEntryContext = null;
  }
}

/**
 * Boundary-ping payload shape. Caller passes the lat/lon already
 * captured by lib/location.ts — we don't re-fetch GPS here, otherwise
 * we'd double-prompt the user and stall clock-in by another full
 * fix-window.
 */
export interface BoundaryPingArgs {
  ctx: ActiveEntryContext;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  /** ISO-8601 timestamp the fix was taken. */
  capturedAt: string;
  source: 'clock_in' | 'clock_out';
}

/**
 * Synchronously write a single boundary ping (clock_in or clock_out).
 * Used by useClockIn / useClockOut so the boundary moment always
 * lands in location_pings even if the background task isn't permitted.
 * Best-effort — failures are logged but don't throw.
 */
export async function writeBoundaryPing(args: BoundaryPingArgs): Promise<void> {
  let battery: { level: number; charging: boolean } | null = null;
  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);
    battery = {
      level: Math.round(level * 100),
      charging:
        state === Battery.BatteryState.CHARGING ||
        state === Battery.BatteryState.FULL,
    };
  } catch (err) {
    logWarn('locationTracker.writeBoundary', 'battery read failed', err);
  }

  try {
    const db = await getDatabaseForHeadlessTask();
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    await db.execute(
      `INSERT INTO location_pings (
         id, user_id, user_email, job_time_entry_id,
         lat, lon, accuracy_m, altitude_m, heading, speed_mps,
         battery_pct, is_charging, source,
         captured_at, created_at, client_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        args.ctx.userId,
        args.ctx.userEmail,
        args.ctx.entryId,
        args.lat,
        args.lon,
        args.accuracy_m,
        args.altitude_m,
        null, // heading — boundary fix doesn't supply
        null, // speed
        battery?.level ?? null,
        battery ? (battery.charging ? 1 : 0) : null,
        args.source,
        args.capturedAt,
        nowIso,
        id,
      ]
    );
    logInfo('locationTracker.writeBoundary', 'wrote boundary ping', {
      entry_id: args.ctx.entryId,
      source: args.source,
    });
  } catch (err) {
    // Boundary ping write is best-effort — clock-in / out itself
    // already succeeded by the time we get here.
    logError('locationTracker.writeBoundary', 'insert failed', err, {
      entry_id: args.ctx.entryId,
      source: args.source,
    });
  }
}

/**
 * Mount-once recovery hook. Called from app/_layout.tsx — handles
 * three edge cases:
 *
 *   1. App relaunched after phone-died-while-clocked-in: there's an
 *      open job_time_entries row, but the task isn't running. Restart
 *      it so background pings resume immediately.
 *
 *   2. App relaunched after a clean clock-out: no open entry, but
 *      the task may have orphaned (rare iOS edge case where the OS
 *      kept the task alive past stopLocationUpdatesAsync). Stop it.
 *
 *   3. Permissions revoked while the task was running: the task
 *      will silently no-op until clock-out, which is correct
 *      behaviour. We don't try to re-prompt on launch.
 */
export interface RecoveryArgs {
  /** Open job_time_entries row for the current user, or null. */
  openEntry: { id: string } | null;
  userId: string | null;
  userEmail: string | null;
}

export async function reconcileTrackingOnLaunch(
  args: RecoveryArgs
): Promise<void> {
  let isRunning = false;
  try {
    isRunning = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  } catch (err) {
    logWarn(
      'locationTracker.reconcile',
      'hasStartedLocationUpdatesAsync failed',
      err
    );
  }

  if (args.openEntry && args.userId && args.userEmail) {
    if (isRunning) {
      // Refresh the in-memory context so the task's writes carry the
      // current entry id (a previous launch's context was lost on
      // process kill).
      activeEntryContext = {
        entryId: args.openEntry.id,
        userId: args.userId,
        userEmail: args.userEmail,
      };
      logInfo('locationTracker.reconcile', 'task running — context restored', {
        entry_id: args.openEntry.id,
      });
      return;
    }
    // Open entry but task not running → restart.
    logInfo(
      'locationTracker.reconcile',
      'open entry without task — starting',
      { entry_id: args.openEntry.id }
    );
    await startBackgroundTracking({
      entryId: args.openEntry.id,
      userId: args.userId,
      userEmail: args.userEmail,
    });
    return;
  }

  if (isRunning) {
    logInfo('locationTracker.reconcile', 'no open entry but task running — stopping');
    await stopBackgroundTracking();
  }
}
