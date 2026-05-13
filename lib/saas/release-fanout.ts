// lib/saas/release-fanout.ts
//
// Phase G-3 fanout helper. When a release is published, find every
// org whose active subscription has at least one of the release's
// bundles (or every org if the release has no bundles), and write
// an org-wide `org_notifications` row per matching org so users see
// the banner + bell entry.
//
// Used by /api/platform/releases POST when `publishNow=true`.

import { supabaseAdmin } from '@/lib/supabase';
import { expandBundles, type BundleId } from '@/lib/saas/bundles';

export interface FanoutInput {
  releaseId: string;
  version: string;
  releaseType: 'feature' | 'bugfix' | 'breaking' | 'security';
  bundles: BundleId[];
  required: boolean;
  notesMarkdown: string | null;
}

const SEVERITY_BY_TYPE: Record<FanoutInput['releaseType'], 'info' | 'warning' | 'critical'> = {
  feature:  'info',
  bugfix:   'info',
  breaking: 'warning',
  security: 'critical',
};

export async function fanoutReleasePublished(input: FanoutInput): Promise<{ orgsNotified: number }> {
  // Pull every active or trialing subscription
  const { data: subs, error } = await supabaseAdmin
    .from('subscriptions')
    .select('org_id, bundles, status')
    .in('status', ['active', 'trialing']);
  if (error) {
    console.error('[release-fanout] subscriptions query failed', error);
    return { orgsNotified: 0 };
  }

  const matchingOrgIds: string[] = [];
  for (const s of subs ?? []) {
    const row = s as { org_id: string; bundles: string[] | null };
    if (input.bundles.length === 0) {
      // No bundle filter on the release → every active org sees it
      matchingOrgIds.push(row.org_id);
      continue;
    }
    const orgBundles = expandBundles((row.bundles ?? []) as BundleId[]);
    if (input.bundles.some((b) => orgBundles.includes(b))) {
      matchingOrgIds.push(row.org_id);
    }
  }

  if (matchingOrgIds.length === 0) return { orgsNotified: 0 };

  const title = input.required
    ? `Required update: v${input.version}`
    : `What's new in v${input.version}`;

  const body = input.notesMarkdown
    ? input.notesMarkdown.slice(0, 280) + (input.notesMarkdown.length > 280 ? '…' : '')
    : null;

  const rows = matchingOrgIds.map((orgId) => ({
    org_id: orgId,
    user_email: null, // org-wide
    type: 'release',
    severity: SEVERITY_BY_TYPE[input.releaseType],
    title,
    body,
    action_url: `/admin/announcements?id=${input.releaseId}`,
    action_label: 'View notes',
    payload: {
      release_id: input.releaseId,
      version: input.version,
      release_type: input.releaseType,
      required: input.required,
    },
  }));

  const { error: insertErr } = await supabaseAdmin.from('org_notifications').insert(rows);
  if (insertErr) {
    console.error('[release-fanout] notifications insert failed', insertErr);
    return { orgsNotified: 0 };
  }

  return { orgsNotified: matchingOrgIds.length };
}
