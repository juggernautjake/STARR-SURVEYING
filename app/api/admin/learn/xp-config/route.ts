// app/api/admin/learn/xp-config/route.ts
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';

/* GET — List all module XP configs, optionally merged with module info */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const moduleType = searchParams.get('module_type'); // 'learning_module', 'fs_module'

  // Get all XP configs
  let query = supabaseAdmin.from('module_xp_config').select('*').order('created_at');
  if (moduleType) query = query.eq('module_type', moduleType);
  const { data: configs } = await query;

  // Get all learning modules for display
  const { data: modules } = await supabaseAdmin.from('learning_modules')
    .select('id, title, difficulty, order_index, status').order('order_index');

  // Get FS modules if they exist
  const { data: fsModules } = await supabaseAdmin.from('fs_study_modules')
    .select('id, title, module_number').order('module_number').catch(() => ({ data: null }));

  // Build a merged view: each module with its XP config (or the default)
  const configMap = new Map<string, { xp_value: number; expiry_months: number; difficulty_rating: number; id: string; is_active: boolean }>();
  let defaultLearning = { xp_value: 500, expiry_months: 18, difficulty_rating: 3, id: '', is_active: true };
  let defaultFS = { xp_value: 500, expiry_months: 24, difficulty_rating: 4, id: '', is_active: true };

  (configs || []).forEach((c: { id: string; module_type: string; module_id: string | null; xp_value: number; expiry_months: number; difficulty_rating: number; is_active: boolean }) => {
    if (!c.module_id && c.module_type === 'learning_module') defaultLearning = c;
    else if (!c.module_id && c.module_type === 'fs_module') defaultFS = c;
    else if (c.module_id) configMap.set(c.module_id, c);
  });

  const learningModulesWithXP = (modules || []).map((m: { id: string; title: string; difficulty: string; order_index: number; status: string }) => {
    const config = configMap.get(m.id);
    return {
      ...m,
      module_type: 'learning_module',
      xp_value: config?.xp_value ?? defaultLearning.xp_value,
      expiry_months: config?.expiry_months ?? defaultLearning.expiry_months,
      difficulty_rating: config?.difficulty_rating ?? defaultLearning.difficulty_rating,
      has_custom_xp: !!config,
      config_id: config?.id || null,
    };
  });

  const fsModulesWithXP = (fsModules || []).map((m: { id: string; title: string; module_number: number }) => {
    const config = configMap.get(m.id);
    return {
      ...m,
      module_type: 'fs_module',
      xp_value: config?.xp_value ?? defaultFS.xp_value,
      expiry_months: config?.expiry_months ?? defaultFS.expiry_months,
      difficulty_rating: config?.difficulty_rating ?? defaultFS.difficulty_rating,
      has_custom_xp: !!config,
      config_id: config?.id || null,
    };
  });

  return NextResponse.json({
    configs: configs || [],
    learning_modules: learningModulesWithXP,
    fs_modules: fsModulesWithXP,
    defaults: { learning_module: defaultLearning, fs_module: defaultFS },
  });
}, { routeName: 'learn/xp-config' });

/* POST — Create or update XP config for a specific module */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { module_type, module_id, xp_value, expiry_months, difficulty_rating } = body;

  if (!module_type) {
    return NextResponse.json({ error: 'module_type required' }, { status: 400 });
  }

  const configData: Record<string, unknown> = {
    module_type,
    module_id: module_id || null,
    xp_value: xp_value ?? 500,
    expiry_months: expiry_months ?? 18,
    difficulty_rating: difficulty_rating ?? 3,
    is_active: true,
  };

  // Check if a config already exists for this module
  let existing = null;
  if (module_id) {
    const { data } = await supabaseAdmin.from('module_xp_config')
      .select('id').eq('module_type', module_type).eq('module_id', module_id).maybeSingle();
    existing = data;
  } else {
    const { data } = await supabaseAdmin.from('module_xp_config')
      .select('id').eq('module_type', module_type).is('module_id', null).maybeSingle();
    existing = data;
  }

  if (existing) {
    // Update existing
    const { data, error } = await supabaseAdmin.from('module_xp_config')
      .update(configData).eq('id', existing.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data, action: 'updated' });
  } else {
    // Insert new
    const { data, error } = await supabaseAdmin.from('module_xp_config')
      .insert(configData).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ config: data, action: 'created' });
  }
}, { routeName: 'learn/xp-config' });

/* PUT — Bulk update multiple module XP configs */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { updates } = body; // Array of { module_type, module_id, xp_value, expiry_months, difficulty_rating }

  if (!updates || !Array.isArray(updates)) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 });
  }

  const results = [];
  for (const update of updates) {
    const { module_type, module_id, xp_value, expiry_months, difficulty_rating } = update;

    const configData: Record<string, unknown> = {
      module_type,
      module_id: module_id || null,
      xp_value: xp_value ?? 500,
      expiry_months: expiry_months ?? 18,
      difficulty_rating: difficulty_rating ?? 3,
      is_active: true,
    };

    // Upsert: check if exists
    let existing = null;
    if (module_id) {
      const { data } = await supabaseAdmin.from('module_xp_config')
        .select('id').eq('module_type', module_type).eq('module_id', module_id).maybeSingle();
      existing = data;
    }

    if (existing) {
      await supabaseAdmin.from('module_xp_config')
        .update(configData).eq('id', existing.id);
      results.push({ module_id, action: 'updated' });
    } else {
      await supabaseAdmin.from('module_xp_config').insert(configData);
      results.push({ module_id, action: 'created' });
    }
  }

  return NextResponse.json({ results, count: results.length });
}, { routeName: 'learn/xp-config' });
