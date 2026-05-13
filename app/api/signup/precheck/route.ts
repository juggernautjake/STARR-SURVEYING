// app/api/signup/precheck/route.ts
//
// Phase D-1a: live precheck for the signup wizard step 2 (slug
// uniqueness) and step 3 (email status). Called once per keystroke
// (debounced 300ms client-side) so users see "available" / "taken"
// instantly.
//
// POST /api/signup/precheck
//   body: { slug?: string, email?: string }
//   response: {
//     slug?: { ok: boolean, reason?: string },
//     email?: { status: 'new' | 'existing_user' | 'banned' }
//   }
//
// Rate-limited at the route level (TODO when middleware lands):
// 30 requests per minute per IP to deter slug-enumeration.
//
// Spec: docs/planning/in-progress/MARKETING_SIGNUP_FLOW.md §4 step 2-3 + §5.

import { NextResponse, type NextRequest } from 'next/server';

import { supabaseAdmin } from '@/lib/supabase';
import { validateSlug } from '@/lib/saas/reserved-slugs';

export const runtime = 'nodejs';

interface PrecheckRequest {
  slug?: string;
  email?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PrecheckRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result: {
    slug?: { ok: boolean; reason?: string };
    email?: { status: 'new' | 'existing_user' | 'banned' };
  } = {};

  // ── Slug check ──────────────────────────────────────────────────
  if (typeof body.slug === 'string' && body.slug.length > 0) {
    const normalized = body.slug.trim().toLowerCase();
    const validation = validateSlug(normalized);

    if (!validation.ok) {
      result.slug = { ok: false, reason: validation.reason };
    } else {
      // Confirm uniqueness against the organizations table.
      try {
        const { data, error } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('slug', normalized)
          .limit(1)
          .maybeSingle();
        if (error) {
          console.error('[precheck] organizations query failed', error);
          result.slug = { ok: false, reason: 'db_error' };
        } else if (data) {
          result.slug = { ok: false, reason: 'taken' };
        } else {
          result.slug = { ok: true };
        }
      } catch (err) {
        console.error('[precheck] slug uniqueness check threw', err);
        result.slug = { ok: false, reason: 'db_error' };
      }
    }
  }

  // ── Email check ─────────────────────────────────────────────────
  if (typeof body.email === 'string' && body.email.length > 0) {
    const normalizedEmail = body.email.trim().toLowerCase();
    try {
      const { data, error } = await supabaseAdmin
        .from('registered_users')
        .select('email, is_banned')
        .eq('email', normalizedEmail)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('[precheck] registered_users query failed', error);
        result.email = { status: 'new' };  // fail open — user can still try to signup; complete() will catch real conflicts
      } else if (!data) {
        result.email = { status: 'new' };
      } else if (data.is_banned) {
        result.email = { status: 'banned' };
      } else {
        result.email = { status: 'existing_user' };
      }
    } catch (err) {
      console.error('[precheck] email status check threw', err);
      result.email = { status: 'new' };
    }
  }

  return NextResponse.json(result);
}
