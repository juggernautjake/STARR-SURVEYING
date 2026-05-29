// lib/learn/moduleCredentialBonus.ts
//
// Server-side lookup: given a module id, return the credential it awards
// (if any) and the per-hour pay bump that credential carries. Used by
// the pay-impact callout on `/admin/learn/modules/[id]` and by the
// module-completion handler when calling `triggerCredential`.
//
// PAY_PROGRESSION_OVERHAUL.md P-25/P-26 deferred item — shipped 2026-05-28.

import { supabaseAdmin } from '@/lib/supabase';

export interface ModuleCredentialBonus {
  moduleId: string;
  credentialKey: string;
  credentialLabel: string;
  bonusPerHour: number;
  credentialType?: string | null;
  description?: string | null;
}

/**
 * Resolve a module's linked credential + its hourly bonus.
 * Returns null when the module is not linked or the credential is missing
 * from `credential_bonuses` (e.g. operator misconfiguration). Callers can
 * treat null as "no callout to show".
 */
export async function getModuleCredentialBonus(
  moduleId: string,
): Promise<ModuleCredentialBonus | null> {
  if (!moduleId) return null;

  const { data: mod, error: modErr } = await supabaseAdmin
    .from('learning_modules')
    .select('id, credential_key')
    .eq('id', moduleId)
    .maybeSingle();

  if (modErr || !mod || !mod.credential_key) return null;

  const { data: cred, error: credErr } = await supabaseAdmin
    .from('credential_bonuses')
    .select('credential_key, label, bonus_per_hour, credential_type, description')
    .eq('credential_key', mod.credential_key)
    .maybeSingle();

  if (credErr || !cred) return null;

  return {
    moduleId: mod.id,
    credentialKey: cred.credential_key,
    credentialLabel: cred.label,
    bonusPerHour: Number(cred.bonus_per_hour ?? 0),
    credentialType: cred.credential_type ?? null,
    description: cred.description ?? null,
  };
}

interface ModuleRow { id: string; credential_key: string | null; }
interface CredentialRow {
  credential_key: string;
  label: string;
  bonus_per_hour: number;
  credential_type: string | null;
  description: string | null;
}

/** Convenience: bulk-resolve credential bonuses for a list of module ids. */
export async function getModuleCredentialBonuses(
  moduleIds: string[],
): Promise<Record<string, ModuleCredentialBonus>> {
  if (!moduleIds.length) return {};

  const { data: modsRaw } = await supabaseAdmin
    .from('learning_modules')
    .select('id, credential_key')
    .in('id', moduleIds);

  const mods = (modsRaw ?? []) as ModuleRow[];
  if (!mods.length) return {};

  const credKeys = Array.from(
    new Set(mods.map((m) => m.credential_key).filter((k): k is string => !!k)),
  );
  if (!credKeys.length) return {};

  const { data: credsRaw } = await supabaseAdmin
    .from('credential_bonuses')
    .select('credential_key, label, bonus_per_hour, credential_type, description')
    .in('credential_key', credKeys);

  const creds = (credsRaw ?? []) as CredentialRow[];
  const byKey = new Map<string, CredentialRow>(creds.map((c) => [c.credential_key, c]));

  const out: Record<string, ModuleCredentialBonus> = {};
  for (const m of mods) {
    if (!m.credential_key) continue;
    const c = byKey.get(m.credential_key);
    if (!c) continue;
    out[m.id] = {
      moduleId: m.id,
      credentialKey: c.credential_key,
      credentialLabel: c.label,
      bonusPerHour: Number(c.bonus_per_hour ?? 0),
      credentialType: c.credential_type,
      description: c.description,
    };
  }
  return out;
}
