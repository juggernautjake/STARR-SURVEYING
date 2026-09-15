// lib/receptionist/version-server.ts — read and write the live receptionist version (see ./version.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { liveVersionFrom, liveVoiceFrom, RECEPTIONIST_SETTINGS_KEY, type ReceptionistVersion } from './version';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export interface LiveVersionSetting {
  version: ReceptionistVersion;
  /** The voice id live calls speak in (lib/receptionist/voices.ts); null = the default voice. */
  voice: string | null;
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
    if (error || !data) return { version: liveVersionFrom(null), voice: null, updatedBy: null, updatedAt: null };
    const row = data as { value: unknown; updated_by: string | null; updated_at: string | null };
    return { version: liveVersionFrom(row.value), voice: liveVoiceFrom(row.value), updatedBy: row.updated_by, updatedAt: row.updated_at };
  } catch {
    return { version: liveVersionFrom(null), voice: null, updatedBy: null, updatedAt: null };
  }
}

/** Write the version, the voice, or both. What is not given keeps its stored value. */
export async function writeLiveSettings(client: Client, patch: { version?: ReceptionistVersion; voice?: string | null }, by: string): Promise<LiveVersionSetting> {
  const current = await readLiveVersion(client);
  const next = {
    live_version: patch.version ?? current.version,
    voice: patch.voice === undefined ? current.voice : patch.voice,
  };
  const now = new Date().toISOString();
  const { error } = await client
    .from('app_settings')
    .upsert({ key: RECEPTIONIST_SETTINGS_KEY, value: next, updated_by: by, updated_at: now }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  return { version: next.live_version, voice: next.voice, updatedBy: by, updatedAt: now };
}

export async function writeLiveVersion(client: Client, version: ReceptionistVersion, by: string): Promise<LiveVersionSetting> {
  return writeLiveSettings(client, { version }, by);
}
