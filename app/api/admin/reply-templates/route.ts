// app/api/admin/reply-templates/route.ts
//
// LR4 of lead-reply-expansion-2026-06-18.md — list endpoint for the
// reply templates the lead-detail composer surfaces in its
// "Templates ▾" picker. Read-only for now; custom templates live as
// org-scoped rows in `public.reply_templates` (seed 321).
//
//   GET → { templates: ReplyTemplate[] }
//
// Auth: admin only.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface ReplyTemplate {
  id: string;
  name: string;
  category: string;
  subject_template: string;
  body_html_template: string;
  is_org_default: boolean;
  created_by: string | null;
}

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.roles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('reply_templates')
    .select('id, name, category, subject_template, body_html_template, is_org_default, created_by')
    .order('is_org_default', { ascending: false })
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: (data ?? []) as ReplyTemplate[] });
}, { routeName: 'admin/reply-templates' });
