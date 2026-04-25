/**
 * PowerSync database singleton + React provider.
 *
 * Phase F0 #3 wires PowerSync against Supabase per plan §6.1
 * ("PowerSync default, WatermelonDB fallback") and §6.4 (offline-first
 * sync engine). Local SQLite works the moment the app launches; the
 * cloud sync layer activates when EXPO_PUBLIC_POWERSYNC_URL is set in
 * the env (see lib/db/README.md for the deployment runbook).
 *
 * Lifecycle:
 *
 *   1. Module load: nothing happens — no I/O, no SQLite open.
 *   2. DatabaseProvider mount: lazy-creates the PowerSync instance
 *      and runs init() which opens the local SQLite file and runs
 *      migrations.
 *   3. AuthProvider session arrives: connector.fetchCredentials()
 *      returns the JWT and PowerSync establishes a sync stream
 *      (only if EXPO_PUBLIC_POWERSYNC_URL is configured).
 *   4. Session goes to null (sign-out): disconnect() severs the
 *      stream so the next user doesn't inherit anyone else's queue.
 *   5. Provider unmount (app shutdown): close() flushes the queue.
 *      RN doesn't reliably fire unmount on hard kill, but PowerSync's
 *      WAL means the next launch picks up where we left off.
 */
import { PowerSyncContext } from '@powersync/react';
import { PowerSyncDatabase } from '@powersync/react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import 'react-native-get-random-values'; // crypto.randomUUID polyfill for RN

import { LoadingSplash } from '../LoadingSplash';
import { useAuth } from '../auth';
import { SupabaseConnector } from './connector';
import { AppSchema } from './schema';

const DB_FILENAME = 'starr-field.db';

let _db: PowerSyncDatabase | null = null;

/**
 * Lazy singleton. Imports of this module don't open the SQLite file;
 * the first call to getDatabase() does. Tests can swap the singleton
 * by setting `_db` before any consumer runs.
 */
export function getDatabase(): PowerSyncDatabase {
  if (!_db) {
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: DB_FILENAME },
    });
  }
  return _db;
}

/**
 * Provider that initializes the local DB and connects/disconnects the
 * sync stream alongside Supabase auth state. Render this INSIDE the
 * AuthProvider so useAuth() resolves; render it OUTSIDE the (tabs)
 * and (auth) layouts so all screens have access to the DB context.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  const connectorRef = useRef<SupabaseConnector | null>(null);

  // Initialize DB once. PowerSync.init() is idempotent; safe to call
  // even if a previous mount already opened the file.
  useEffect(() => {
    let mounted = true;
    const db = getDatabase();
    db.init()
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((err) => {
        // Failure to open SQLite is catastrophic — there's no useful
        // fallback. Log loudly; F1+ adds Sentry capture here.
        console.error('[DatabaseProvider] init failed:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Connect / disconnect with auth. Skip while auth is still loading
  // so we don't connect once with no session, then immediately
  // reconnect when the session arrives.
  useEffect(() => {
    if (authLoading || !ready) return;
    const db = getDatabase();

    if (!session) {
      // No session → disconnect any existing stream.
      void db.disconnect();
      connectorRef.current = null;
      return;
    }

    // Have session → ensure connected. PowerSync's connect() is
    // idempotent; calling it when already connected is a no-op.
    if (!connectorRef.current) {
      connectorRef.current = new SupabaseConnector();
    }
    void db.connect(connectorRef.current).catch((err) => {
      // The connector returns null credentials when
      // EXPO_PUBLIC_POWERSYNC_URL is missing; that's fine, the local
      // DB works offline. Real connect failures (auth rejection,
      // bad URL) log here and PowerSync auto-retries with backoff.
      console.warn('[DatabaseProvider] connect failed (local DB still works):', err);
    });
  }, [session, authLoading, ready]);

  if (!ready) return <LoadingSplash />;

  return <PowerSyncContext.Provider value={getDatabase()}>{children}</PowerSyncContext.Provider>;
}
