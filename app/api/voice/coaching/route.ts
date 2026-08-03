// app/api/voice/coaching/route.ts — packages and students.
//
// One route for both because they are edited together: a student is always attached to a package, and
// changing a price is a thing Andrew does while looking at who is on which one.
//
// ── PRICES ARE NOT VERSIONED, AND THAT IS DELIBERATE ────────────────────────────────────────────
//
// Editing a package changes what NEW students see. It does not touch what an existing student agreed
// to, because what they agreed to lives on their signed contract and their paid invoice — both of
// which store their own amounts. A price-history table would add real complexity to answer a question
// the contract already answers.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getVoiceSession } from '@/lib/voice/auth';

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
}

const STUDENT_STATUSES = ['prospective', 'active', 'paused', 'completed'] as const;

export async function POST(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  // ── A PACKAGE ──
  if (body.kind === 'package') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Give the package a name.' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('va_coaching_packages')
      .insert({
        name: name.slice(0, 120),
        blurb: body.blurb ? String(body.blurb).slice(0, 400) : null,
        inclusions: Array.isArray(body.inclusions)
          ? body.inclusions.filter((i) => typeof i === 'string').map((i) => (i as string).slice(0, 200)).slice(0, 12)
          : [],
        session_count: Math.max(1, Math.round(Number(body.sessionCount) || 1)),
        session_minutes: Math.max(15, Math.round(Number(body.sessionMinutes) || 45)),
        price_cents: Math.max(0, Math.round(Number(body.priceCents) || 0)),
        highlighted: body.highlighted === true,
        sort_order: Math.round(Number(body.sortOrder) || 0),
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ package: data });
  }

  // ── A STUDENT ──
  if (body.kind === 'student') {
    if (!body.clientId) return NextResponse.json({ error: 'Choose a client first.' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('va_coaching_students')
      .insert({
        client_id: String(body.clientId),
        package_id: body.packageId ? String(body.packageId) : null,
        goals: body.goals ? String(body.goals).slice(0, 2000) : null,
        voice_type: body.voiceType ? String(body.voiceType).slice(0, 60) : null,
        sessions_purchased: Math.max(0, Math.round(Number(body.sessionsPurchased) || 0)),
        sessions_used: 0,
        status: 'active',
        started_on: new Date().toISOString().slice(0, 10),
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ student: data });
  }

  return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  if (body.kind === 'package') {
    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
    if (typeof body.blurb === 'string') patch.blurb = body.blurb.slice(0, 400) || null;
    if (Number.isFinite(Number(body.priceCents))) patch.price_cents = Math.max(0, Math.round(Number(body.priceCents)));
    if (Number.isFinite(Number(body.sessionCount))) patch.session_count = Math.max(1, Math.round(Number(body.sessionCount)));
    if (Number.isFinite(Number(body.sessionMinutes))) patch.session_minutes = Math.max(15, Math.round(Number(body.sessionMinutes)));
    if (typeof body.highlighted === 'boolean') patch.highlighted = body.highlighted;
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (Array.isArray(body.inclusions)) {
      patch.inclusions = body.inclusions
        .filter((i) => typeof i === 'string' && (i as string).trim())
        .map((i) => (i as string).slice(0, 200))
        .slice(0, 12);
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

    // Exactly one package should be highlighted, or the "most popular" badge means nothing. Clearing
    // the others here rather than trusting the caller keeps that true however it was set.
    if (patch.highlighted === true) {
      await supabaseAdmin.from('va_coaching_packages').update({ highlighted: false }).neq('id', id);
    }

    const { error } = await supabaseAdmin.from('va_coaching_packages').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.kind === 'student') {
    const patch: Record<string, unknown> = {};
    if (typeof body.goals === 'string') patch.goals = body.goals.slice(0, 2000) || null;
    if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 4000) || null;
    if (typeof body.voiceType === 'string') patch.voice_type = body.voiceType.slice(0, 60) || null;
    if ((STUDENT_STATUSES as readonly string[]).includes(String(body.status))) patch.status = String(body.status);
    if (Number.isFinite(Number(body.sessionsPurchased))) {
      patch.sessions_purchased = Math.max(0, Math.round(Number(body.sessionsPurchased)));
    }
    // Logging a lesson is the most frequent write here, so it gets its own flag rather than making
    // Andrew type the new number.
    if (body.logSession === true) {
      const { data: student } = await supabaseAdmin
        .from('va_coaching_students')
        .select('sessions_used')
        .eq('id', id)
        .maybeSingle();
      patch.sessions_used = (student?.sessions_used ?? 0) + 1;
    }
    if (body.unlogSession === true) {
      const { data: student } = await supabaseAdmin
        .from('va_coaching_students')
        .select('sessions_used')
        .eq('id', id)
        .maybeSingle();
      patch.sessions_used = Math.max(0, (student?.sessions_used ?? 0) - 1);
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

    const { error } = await supabaseAdmin.from('va_coaching_students').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!getVoiceSession()) return unauthorized();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const kind = searchParams.get('kind');
  if (!id || !kind) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  // A package with students on it is DEACTIVATED rather than deleted: the students reference it, and
  // deleting would null their package_id and lose what they signed up for.
  if (kind === 'package') {
    const { count } = await supabaseAdmin
      .from('va_coaching_students')
      .select('id', { count: 'exact', head: true })
      .eq('package_id', id);

    if ((count ?? 0) > 0) {
      const { error } = await supabaseAdmin.from('va_coaching_packages').update({ active: false }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deactivated: true });
    }

    const { error } = await supabaseAdmin.from('va_coaching_packages').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin.from('va_coaching_students').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
