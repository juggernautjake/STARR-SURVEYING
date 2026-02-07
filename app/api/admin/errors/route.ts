// app/api/admin/errors/route.ts — Error reports CRUD
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/* ─── POST: Submit a new error report ─── */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    // Allow submission even without session (for auth errors)
    const userEmail = session?.user?.email || 'anonymous';

    const body = await req.json();

    const {
      error_message,
      error_stack,
      error_type,
      error_code,
      component_name,
      element_selector,
      page_url,
      page_title,
      route_path,
      api_endpoint,
      request_method,
      request_body,
      user_notes,
      user_expected,
      user_cause_guess,
      severity,
      browser_info,
      screen_size,
      viewport_size,
      connection_type,
      memory_usage,
      session_duration_ms,
      console_logs,
      breadcrumbs,
      occurred_at,
    } = body;

    if (!error_message) {
      return NextResponse.json({ error: 'error_message is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('error_reports')
      .insert({
        error_message: String(error_message).slice(0, 2000),
        error_stack: error_stack ? String(error_stack).slice(0, 5000) : null,
        error_type: error_type || 'unknown',
        error_code: error_code || null,
        component_name: component_name || null,
        element_selector: element_selector || null,
        page_url: page_url || '',
        page_title: page_title || null,
        route_path: route_path || null,
        api_endpoint: api_endpoint || null,
        request_method: request_method || null,
        request_body: request_body || null,
        user_email: body.user_email || userEmail,
        user_name: body.user_name || session?.user?.name || null,
        user_role: body.user_role || (session?.user as { role?: string })?.role || null,
        user_notes: user_notes || null,
        user_expected: user_expected || null,
        user_cause_guess: user_cause_guess || null,
        severity: severity || 'medium',
        browser_info: browser_info || null,
        screen_size: screen_size || null,
        viewport_size: viewport_size || null,
        connection_type: connection_type || null,
        memory_usage: memory_usage || null,
        session_duration_ms: session_duration_ms || null,
        console_logs: console_logs || null,
        breadcrumbs: breadcrumbs || null,
        occurred_at: occurred_at || new Date().toISOString(),
        status: 'new',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving error report:', error.message);
      return NextResponse.json({ error: 'Failed to save error report' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id }, { status: 201 });
  } catch (err) {
    console.error('Error in POST /api/admin/errors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ─── GET: Fetch error reports (admin only) ─── */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const adminView = searchParams.get('admin') === 'true';
    const status = searchParams.get('status');
    const errorType = searchParams.get('error_type');
    const severity = searchParams.get('severity');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('error_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Non-admins can only see their own reports
    if (!adminView || !isAdmin(session.user.email)) {
      query = query.eq('user_email', session.user.email);
    }

    if (status && status !== 'all') query = query.eq('status', status);
    if (errorType && errorType !== 'all') query = query.eq('error_type', errorType);
    if (severity && severity !== 'all') query = query.eq('severity', severity);
    if (search) {
      query = query.or(`error_message.ilike.%${search}%,user_notes.ilike.%${search}%,route_path.ilike.%${search}%,component_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      reports: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('Error in GET /api/admin/errors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ─── PUT: Update error report status (admin only) ─── */
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { id, status, assigned_to, resolution_notes } = body;

    if (!id) return NextResponse.json({ error: 'Report ID required' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (resolution_notes !== undefined) updates.resolution_notes = resolution_notes;

    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = session.user.email;
    }

    const { data, error } = await supabaseAdmin
      .from('error_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ report: data });
  } catch (err) {
    console.error('Error in PUT /api/admin/errors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ─── DELETE: Delete an error report (admin only) ─── */
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Report ID required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('error_reports')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error in DELETE /api/admin/errors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
