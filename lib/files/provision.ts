// lib/files/provision.ts
//
// F8 of FILE_EXPLORER_2026-06-25 — idempotently provision the system roots and
// the current user's personal folder. Seed 385 backfills everyone already on
// the roster; this covers users who join later (called lazily when the explorer
// root is listed). All operations are best-effort and safe to repeat.

import { supabaseAdmin } from '@/lib/supabase';
import { sanitizeName, nextAvailableName } from './tree';
import type { FileUser } from './permissions';

const SHARED = 'Shared';
const PERSONAL = 'Personal';

async function findTopFolder(name: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('file_nodes')
    .select('id')
    .is('parent_id', null)
    .is('deleted_at', null)
    .eq('node_type', 'folder')
    .ilike('name', name)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function ensureTopFolder(name: string, everyoneLevel: 'view' | 'edit'): Promise<string | null> {
  const existing = await findTopFolder(name);
  if (existing) return existing;
  const { data, error } = await supabaseAdmin
    .from('file_nodes')
    .insert({ name, node_type: 'folder', is_system: true, permission_mode: 'custom', created_by: 'system' })
    .select('id')
    .single();
  if (error || !data) return await findTopFolder(name); // lost a race → re-read
  await supabaseAdmin
    .from('file_permissions')
    .insert({ node_id: data.id, grantee_type: 'everyone', grantee_value: null, access_level: everyoneLevel, created_by: 'system' });
  return data.id;
}

/** Ensure the Shared + Personal system roots exist; returns their ids. */
export async function ensureSystemRoots(): Promise<{ sharedId: string | null; personalId: string | null }> {
  const sharedId = await ensureTopFolder(SHARED, 'edit');
  const personalId = await ensureTopFolder(PERSONAL, 'view');
  return { sharedId, personalId };
}

/** Ensure this user has a personal root under the Personal container. */
export async function ensurePersonalRoot(personalId: string, user: FileUser, displayName?: string | null): Promise<void> {
  const email = user.email.trim().toLowerCase();
  if (!email) return;
  const { data: existing } = await supabaseAdmin
    .from('file_nodes')
    .select('id')
    .eq('parent_id', personalId)
    .eq('is_personal_root', true)
    .ilike('owner_email', email)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) return;

  const base = sanitizeName(displayName || email.split('@')[0]) || email.split('@')[0];
  const { data: sibs } = await supabaseAdmin
    .from('file_nodes')
    .select('name')
    .eq('parent_id', personalId)
    .eq('node_type', 'folder')
    .is('deleted_at', null);
  const name = nextAvailableName(base, ((sibs ?? []) as Array<{ name: string }>).map((s) => s.name));

  await supabaseAdmin.from('file_nodes').insert({
    parent_id: personalId,
    name,
    node_type: 'folder',
    owner_email: email,
    is_personal_root: true,
    permission_mode: 'custom',
    created_by: 'system',
  });
}

/** Best-effort: ensure the roots + this user's personal folder exist. */
export async function provisionForUser(user: FileUser, displayName?: string | null): Promise<void> {
  try {
    const { personalId } = await ensureSystemRoots();
    if (personalId) await ensurePersonalRoot(personalId, user, displayName);
  } catch {
    /* provisioning is best-effort; never block a listing */
  }
}
