/**
 * PowerSync ↔ Supabase connector.
 *
 * PowerSync calls two methods on this object:
 *
 *   1. fetchCredentials() — every time it needs to (re)connect to the
 *      PowerSync service. We return the configured PowerSync URL and
 *      the user's current Supabase access token; PowerSync uses the
 *      JWT to authorize sync rules server-side.
 *
 *   2. uploadData(database) — whenever there are local mutations in
 *      the upload queue. We replay them as Supabase REST/Postgres
 *      writes, then call `tx.complete()` to acknowledge.
 *
 * The upload model in plan §6.4 lists priority: time entries first
 * (payroll-critical), then receipts, then notes, then media, then
 * location data. PowerSync uses sync rules + bucket priorities for
 * downloads; uploads are FIFO from the local CRUD queue. Today the
 * queue is processed in arrival order — bucket-aware ordering is a
 * Phase F1 polish item.
 */
import type {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/react-native';

import { supabase } from '../supabase';

export class SupabaseConnector implements PowerSyncBackendConnector {
  /**
   * Called by PowerSync to (re)authorize the WebSocket connection.
   *
   * Returns null when:
   *   - EXPO_PUBLIC_POWERSYNC_URL is missing → Phase F0 #3 ships the
   *     wiring without a deployed PowerSync service. Local SQLite
   *     still works; sync just sits idle until the URL is provided.
   *   - The user has no Supabase session → wait for sign-in. PowerSync
   *     will retry fetchCredentials on the next connect attempt.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const endpoint = process.env.EXPO_PUBLIC_POWERSYNC_URL;
    if (!endpoint) return null;

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return null;

    return {
      endpoint,
      token: data.session.access_token,
      // userID hint — purely diagnostic; sync rules read JWT claims
      userID: data.session.user.id,
    };
  }

  /**
   * Replay local CRUD against Supabase. Called automatically whenever
   * the upload queue is non-empty.
   *
   * Each transaction batches one or more ops. We process them in
   * order; on any failure we throw — PowerSync will retry the whole
   * transaction with exponential backoff (the local queue is
   * preserved, no data loss).
   *
   * Op semantics per Supabase row-level:
   *   PUT    → upsert (we use insert-with-conflict-on-id-update
   *            because PowerSync ids are uuids the client picks,
   *            so the row may or may not exist server-side yet)
   *   PATCH  → update by id
   *   DELETE → delete by id
   *
   * Phase F1+: layer in soft-delete semantics for receipts (IRS
   * 7-year retention per §5.11.9 — never hard-delete from mobile),
   * and idempotency keys for time-entry creation so a flaky network
   * retry doesn't double-clock-in.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;

    try {
      for (const op of tx.crud) {
        const tableName = op.table;
        const id = op.id;

        switch (op.op) {
          case 'PUT': {
            // Insert (or upsert if the server already saw a previous
            // op for this id from another device).
            const row = { ...op.opData, id };
            const { error } = await supabase.from(tableName).upsert(row);
            if (error) throw error;
            break;
          }
          case 'PATCH': {
            const { error } = await supabase.from(tableName).update(op.opData ?? {}).eq('id', id);
            if (error) throw error;
            break;
          }
          case 'DELETE': {
            const { error } = await supabase.from(tableName).delete().eq('id', id);
            if (error) throw error;
            break;
          }
          default: {
            // Defensive — should never happen with current PowerSync
            // versions, but if a new UpdateType lands and we haven't
            // updated this switch, the queue would silently drop ops.
            throw new Error(`Unknown PowerSync op type: ${String(op.op)}`);
          }
        }
      }

      await tx.complete();
    } catch (err) {
      // Don't acknowledge; PowerSync will retry the same transaction.
      // Logged here so you see it in Metro / dev tools.
      console.warn('[SupabaseConnector.uploadData] failed, will retry:', err);
      throw err;
    }
  }
}
