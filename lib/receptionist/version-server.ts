// lib/receptionist/version-server.ts — read and write the live receptionist version (see ./version.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { liveVersionFrom, RECEPTIONIST_SETTINGS_KEY, type ReceptionistVersion } from './version';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface LiveVersionSetting {
  version: ReceptionistVersion;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Which receptionist answers live calls. Any failure answers the answering machine — the safe one. */
export async function readLiveVersion(client: Client): Promise<LiveVersionSetting> {
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('value, updated_by, updated_at')
      .eq('key', RECEPTIONIST_SETTINGS_KEY)
      .maybeSingle();
    if (error || !data) return { version: liveVersionFrom(null), updatedBy: null, updatedAt: null };
    const row = data as { value: unknown; updated_by: string | null; updated_at: string | null };
    return { version: liveVersionFrom(row.value), updatedBy: row.updated_by, updatedAt: row.updated_at };
  } catch {
    return { version: liveVersionFrom(null), updatedBy: null, updatedAt: null };
  }
}

export async function writeLiveVersion(client: Client, version: ReceptionistVersion, by: string): Promise<LiveVersionSetting> {
  const now = new Date().toISOString();
  const { error } = await client
    .from('app_settings')
    .upsert({ key: RECEPTIONIST_SETTINGS_KEY, value: { live_version: version }, updated_by: by, updated_at: now }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return { version, updatedBy: by, updatedAt: now };
}
