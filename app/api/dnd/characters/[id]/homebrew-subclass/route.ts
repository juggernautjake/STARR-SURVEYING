// app/api/dnd/characters/[id]/homebrew-subclass/route.ts — AI-assist for the homebrew subclass builder
// (Slice 5). POST { prompt }: the model fills CUSTOM_SUBCLASS_TOOL with a subclass DRAFT (including the
// parent class key it infers from the prose), which flows through parseCustomSubclassInput →
// buildCustomSubclass. Returns the built SubclassDefinition + a light validity note. Propose-only;
// owner/DM only. A subclass has no separate balance reviewer (its parent class carries the ASI/table);
// we surface the obvious gaps (missing parent class / features) so a thin draft is visible.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { requireCharacterWrite } from '@/lib/dnd/characters';
import { dndToolCall, dndAiConfigured } from '@/lib/dnd/ai';
import { parseCustomSubclassInput, CUSTOM_SUBCLASS_TOOL } from '@/lib/dnd/classes/custom-ai';
import { buildCustomSubclass } from '@/lib/dnd/classes/custom';
import { findClass, classesForSystem } from '@/lib/dnd/classes/registry';
import { readHomebrewClasses } from '@/lib/dnd/classes/homebrew-store';
import { normalizeSystem } from '@/lib/dnd/systems';

/**
 * GET — the PARENT-CLASS options this character's system offers, so the designer can be used without the AI.
 *
 * The POST below needs an AI key (503 without one), and every field of its draft used to be read-only, so a
 * player who wanted to write a subclass by hand could not start one at all. A hand-written subclass must name
 * a parent class, and only the server knows which classes exist for this character's system — including any
 * homebrew class saved on the character itself, which the registry alone cannot see. Returning the list is
 * what lets the page offer a real picker instead of asking the player to guess a class KEY.
 *
 * Read-only and access-gated like the POST; it adds no way to change anything.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const homebrew = readHomebrewClasses(character.data);
  const classes = [
    ...classesForSystem(system).map((c) => ({ key: c.key, name: c.name, custom: false })),
    // A homebrew class the player already authored is a legitimate parent, and is invisible to the registry.
    ...homebrew.map((c) => ({ key: c.key, name: c.name, custom: true })),
  ];
  // Its subclass level, so the form can default a feature to the level the parent actually grants one at
  // rather than to a guess. Absent when the class has none.
  const subclassLevels = Object.fromEntries(
    classes.map((c) => [c.key, findClass(system, c.key, homebrew)?.subclassLevel ?? 0]),
  );

  return NextResponse.json({ system, classes, subclassLevels, aiConfigured: dndAiConfigured() });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  const access = await requireCharacterWrite(params.id);
  if (!access.access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { character } = access.access;
  const system = normalizeSystem((character as { system?: string }).system);

  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').trim();
  if (!prompt) return NextResponse.json({ error: 'Describe the subclass you want the AI to draft.' }, { status: 400 });

  let call;
  try {
    call = await dndToolCall<Record<string, unknown>>({
      system: `You design homebrew subclasses for the ${system} tabletop system. Fill the homebrew_subclass tool with a balanced DRAFT. Give the PARENT class key (lowercase, e.g. "barbarian"), a name, and level-by-level features that fit that class's subclass levels.`,
      user: `Draft this subclass: ${prompt}`,
      tools: [CUSTOM_SUBCLASS_TOOL],
      toolChoice: { type: 'tool', name: CUSTOM_SUBCLASS_TOOL.name },
      maxTokens: 2000,
    });
  } catch {
    return NextResponse.json({ error: 'The AI draft failed — please try again.' }, { status: 502 });
  }
  if (!call) return NextResponse.json({ error: 'The AI did not return a subclass draft.' }, { status: 502 });

  const input = parseCustomSubclassInput(call.input, system);
  const subclass = buildCustomSubclass(input);

  // Light validity notes — a subclass has no dedicated balance reviewer.
  const warnings: string[] = [];
  const parent = input.classKey
    ? findClass(system, input.classKey, readHomebrewClasses(character.data))
    : null;
  if (!input.classKey) warnings.push('No parent class was chosen — a subclass must belong to a class.');
  else if (!parent) warnings.push(`No “${input.classKey}” class found in ${system}; the subclass won’t attach until that class exists.`);
  if (!subclass.features.length) warnings.push('This subclass has no features yet.');

  return NextResponse.json({ ok: true, subclass, parentName: parent?.name ?? null, warnings });
}
