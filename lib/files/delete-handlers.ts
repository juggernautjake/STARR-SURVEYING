// lib/files/delete-handlers.ts — one delete (and, where possible, restore) per kind of stored file.
//
// Used by the bulk API (app/api/admin/files/bulk-delete, …/bulk-restore) AND by the older
// single-item DELETE routes, so the permission check for a kind exists exactly once. See
// lib/files/bulk-delete.ts for the orchestration.
//
// ── PERMISSIONS (server-side; hiding a button is not a permission) ─────────────────────────────
//
//   file_node          edit access on the node (accessForNode → canEdit); system folders never.
//   job_file           a role that works on jobs: admin, developer, field_crew, drawer, researcher.
//                      (Before 2026-09-27 the job-file DELETE route let ANY signed-in account delete
//                      any job file.)
//   research_document  a research role (canAccessResearch). Same gap closed.
//   user_file          its owner only — My Files is personal.
//   vehicle_photo      admin, as before.
//   equipment_photo    admin or equipment_manager (who may upload it). id = the equipment row.
//   lead_attachment    admin (the lead pages are admin-only). id = leadAttachmentId().
//
// Org scope: `supabaseAdmin` adds the org filter for every table on ORG_SCOPED_TABLES, so a row in
// another firm is simply "not found". `vehicle_photos` is not on that list, so its handler proves
// the photo's VEHICLE (which is) is visible first.
//
// ── SOFT OR HARD ───────────────────────────────────────────────────────────────────────────────
//
// File Explorer nodes and job files are soft-deleted (a timestamp / flag) and can be restored — the
// Undo toast and the bin. The other three tables have no deleted column, and adding one to three
// tables to back an Undo is a migration this change does not take on; they are deleted for good,
// behind a confirmation that says so. For those the ROW goes first and then the object: if the
// object removal then fails, what is left is an unreferenced object (logged for cleanup) rather
// than a row pointing at nothing, which the UI would show as a broken file.

import { supabaseAdmin, RESEARCH_DOCUMENTS_BUCKET } from '@/lib/supabase';
import { fireAndForget } from '@/lib/apiErrorHandler';
import { hasAnyRole, canAccessResearch, type UserRole } from '@/lib/auth';
import { softDeleteNode, restoreNode } from './node-delete';
import { leadAttachmentKey, type DeleteActor, type HandlerOutcome, type Handlers } from './bulk-delete';

const USER_FILES_BUCKET = 'user-files';
const EQUIPMENT_PHOTOS_BUCKET = 'starr-field-equipment-photos';
const LEAD_ATTACHMENTS_BUCKET = 'lead-attachments';
const VEHICLE_PHOTOS_BUCKET = 'vehicle-photos';

const JOB_FILE_ROLES: UserRole[] = ['admin', 'developer', 'field_crew', 'drawer', 'researcher'];

const roles = (a: DeleteActor) => a.roles as UserRole[];
const denied = (error: string, name?: string): HandlerOutcome => ({ ok: false, status: 403, error, name });
const missing = (): HandlerOutcome => ({ ok: false, status: 404, error: 'Not found (already deleted?).' });
const broke = (error: string, name?: string): HandlerOutcome => ({ ok: false, status: 500, error, name });

async function audit(actor: DeleteActor, action: string, entityType: string, entityId: string | null, metadata: Record<string, unknown>) {
  await fireAndForget(supabaseAdmin.from('activity_log').insert({
    user_email: actor.email,
    action_type: action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  }));
}

/** Remove one object; report (never throw) a failure so the caller can log it. */
async function removeObject(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
    return error ? error.message : null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// ── file_node ────────────────────────────────────────────────────────────────────────────────

const fileNode = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    const r = await softDeleteNode(id, { email: actor.email, roles: actor.roles }, actor.admin);
    return r.ok ? { ok: true, name: r.name } : { ok: false, status: r.status, error: r.error };
  },
  async restore(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    const r = await restoreNode(id, { email: actor.email, roles: actor.roles }, actor.admin);
    return r.ok ? { ok: true, name: r.restoredAs ?? r.name } : { ok: false, status: r.status, error: r.error };
  },
};

// ── job_file ─────────────────────────────────────────────────────────────────────────────────

type JobFileRow = { id: string; job_id: string | null; file_name: string | null; name: string | null; section: string | null; is_deleted: boolean | null };

async function loadJobFile(id: string): Promise<JobFileRow | null> {
  const { data } = await supabaseAdmin
    .from('job_files')
    .select('id, job_id, file_name, name, section, is_deleted')
    .eq('id', id)
    .maybeSingle();
  return (data as JobFileRow | null) ?? null;
}

async function setJobFileDeleted(id: string, deleted: boolean): Promise<string | null> {
  const a = await supabaseAdmin.from('job_files').update({ is_deleted: deleted }).eq('id', id);
  if (a.error) return a.error.message;
  // Its backup copy follows it either way, as the original route did.
  const b = await supabaseAdmin.from('job_files').update({ is_deleted: deleted }).eq('backup_of', id);
  return b.error ? b.error.message : null;
}

const jobFile = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!hasAnyRole(roles(actor), JOB_FILE_ROLES)) return denied('Your role cannot delete job files.');
    const row = await loadJobFile(id);
    if (!row || row.is_deleted) return missing();
    const name = row.file_name ?? row.name ?? undefined;
    const err = await setJobFileDeleted(id, true);
    if (err) return broke(err, name);
    if (row.job_id) {
      await audit(actor, 'job_file_deleted', 'job', row.job_id, { file_id: id, file_name: name, section: row.section });
    }
    return { ok: true, name };
  },
  async restore(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!hasAnyRole(roles(actor), JOB_FILE_ROLES)) return denied('Your role cannot restore job files.');
    const row = await loadJobFile(id);
    if (!row) return missing();
    const name = row.file_name ?? row.name ?? undefined;
    if (!row.is_deleted) return { ok: true, name };
    const err = await setJobFileDeleted(id, false);
    if (err) return broke(err, name);
    if (row.job_id) {
      await audit(actor, 'job_file_restored', 'job', row.job_id, { file_id: id, file_name: name, section: row.section });
    }
    return { ok: true, name };
  },
};

// ── research_document ────────────────────────────────────────────────────────────────────────

const researchDocument = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!canAccessResearch(roles(actor))) return denied('Your role cannot delete research documents.');
    const { data } = await supabaseAdmin
      .from('research_documents')
      .select('id, research_project_id, storage_path, original_filename, document_label')
      .eq('id', id)
      .maybeSingle();
    const doc = data as { research_project_id: string | null; storage_path: string | null; original_filename: string | null; document_label: string | null } | null;
    if (!doc) return missing();
    const name = doc.document_label ?? doc.original_filename ?? undefined;
    // Its extracted facts first — the older detail route did this explicitly rather than trusting a
    // cascade, so the shared handler does too. Then the row, then the object (see the header).
    await supabaseAdmin.from('extracted_data_points').delete().eq('document_id', id);
    const { error } = await supabaseAdmin.from('research_documents').delete().eq('id', id);
    if (error) return broke(error.message, name);
    const storageError = await removeObject(RESEARCH_DOCUMENTS_BUCKET, doc.storage_path);
    await audit(actor, 'research_document_deleted', 'research_project', doc.research_project_id, {
      document_id: id, name, storage_path: doc.storage_path, ...(storageError ? { storage_error: storageError } : {}),
    });
    return { ok: true, name };
  },
};

// ── user_file (My Files) ─────────────────────────────────────────────────────────────────────

const userFile = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    const { data } = await supabaseAdmin
      .from('user_files')
      .select('id, storage_path, user_email, file_name')
      .eq('id', id)
      .maybeSingle();
    const row = data as { storage_path: string; user_email: string; file_name: string | null } | null;
    if (!row) return missing();
    const name = row.file_name ?? undefined;
    if (row.user_email !== actor.email) return denied('Only the owner can delete a file in My Files.', name);
    const { error } = await supabaseAdmin.from('user_files').delete().eq('id', id);
    if (error) return broke(error.message, name);
    const storageError = await removeObject(USER_FILES_BUCKET, row.storage_path);
    await audit(actor, 'user_file_deleted', 'user_file', id, {
      name, storage_path: row.storage_path, ...(storageError ? { storage_error: storageError } : {}),
    });
    return { ok: true, name };
  },
};

// ── vehicle_photo ────────────────────────────────────────────────────────────────────────────

const vehiclePhoto = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!actor.admin) return denied('Only an admin can delete vehicle photos.');
    const { data } = await supabaseAdmin
      .from('vehicle_photos')
      .select('id, vehicle_id, photo_path, caption')
      .eq('id', id)
      .maybeSingle();
    const photo = data as { vehicle_id: string; photo_path: string; caption: string | null } | null;
    if (!photo) return missing();
    const name = photo.caption ?? photo.photo_path.split('/').pop() ?? undefined;
    // vehicle_photos carries no org_id; the vehicle does. Not visible → not yours.
    const { data: vehicle } = await supabaseAdmin
      .from('vehicles')
      .select('id, primary_photo_path')
      .eq('id', photo.vehicle_id)
      .maybeSingle();
    if (!vehicle) return missing();

    const { error } = await supabaseAdmin.from('vehicle_photos').delete().eq('id', id);
    if (error) return broke(error.message, name);
    // Never leave the vehicle's thumbnail pointing at a photo that is gone.
    if ((vehicle as { primary_photo_path: string | null }).primary_photo_path === photo.photo_path) {
      await supabaseAdmin.from('vehicles').update({ primary_photo_path: null, updated_at: new Date().toISOString() }).eq('id', photo.vehicle_id);
    }
    const storageError = await removeObject(VEHICLE_PHOTOS_BUCKET, photo.photo_path);
    await audit(actor, 'vehicle_photo_deleted', 'vehicle', photo.vehicle_id, {
      photo_id: id, name, storage_path: photo.photo_path, ...(storageError ? { storage_error: storageError } : {}),
    });
    return { ok: true, name };
  },
};

// ── equipment_photo ──────────────────────────────────────────────────────────────────────────

const equipmentPhoto = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!actor.admin && !actor.roles.includes('equipment_manager')) return denied('Only an admin or equipment manager can remove equipment photos.');
    const { data } = await supabaseAdmin.from('equipment_inventory').select('id, name, photo_url').eq('id', id).maybeSingle();
    const row = data as { name: string | null; photo_url: string | null } | null;
    if (!row || !row.photo_url) return missing();
    const path = row.photo_url;
    const name = `Photo of ${row.name ?? 'equipment'}`;
    const { error } = await supabaseAdmin.from('equipment_inventory').update({ photo_url: null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return broke(error.message, name);
    const storageError = await removeObject(EQUIPMENT_PHOTOS_BUCKET, path);
    await audit(actor, 'equipment_photo_deleted', 'equipment', id, {
      name, storage_path: path, ...(storageError ? { storage_error: storageError } : {}),
    });
    return { ok: true, name };
  },
};

// ── lead_attachment ──────────────────────────────────────────────────────────────────────────

type LeadAttachment = { name: string; size: number; storage_path?: string };

const leadAttachment = {
  async delete(id: string, actor: DeleteActor): Promise<HandlerOutcome> {
    if (!actor.admin) return denied('Only an admin can delete lead attachments.');
    const cut = id.lastIndexOf('_');
    const leadId = cut > 0 ? id.slice(0, cut) : '';
    const key = cut > 0 ? id.slice(cut + 1) : '';
    if (!leadId || !/^[0-9a-f]{8}$/.test(key)) return { ok: false, status: 400, error: 'Bad attachment id.' };
    const { data } = await supabaseAdmin.from('leads').select('id, attachments').eq('id', leadId).maybeSingle();
    const lead = data as { attachments: LeadAttachment[] | null } | null;
    if (!lead) return missing();
    const list = Array.isArray(lead.attachments) ? lead.attachments : [];
    const at = list.findIndex((a) => leadAttachmentKey(a) === key);
    if (at < 0) return missing();
    const gone = list[at]!;
    const next = list.filter((_, i) => i !== at);
    // The row first: the lead must never list a file whose bytes are gone.
    const { error } = await supabaseAdmin.from('leads').update({ attachments: next }).eq('id', leadId);
    if (error) return broke(error.message, gone.name);
    const storageError = await removeObject(LEAD_ATTACHMENTS_BUCKET, gone.storage_path);
    await audit(actor, 'lead_attachment_deleted', 'lead', leadId, {
      name: gone.name, size: gone.size, storage_path: gone.storage_path ?? null, ...(storageError ? { storage_error: storageError } : {}),
    });
    return { ok: true, name: gone.name };
  },
};

export const DELETE_HANDLERS: Handlers = {
  file_node: fileNode,
  job_file: jobFile,
  research_document: researchDocument,
  user_file: userFile,
  vehicle_photo: vehiclePhoto,
  equipment_photo: equipmentPhoto,
  lead_attachment: leadAttachment,
};

