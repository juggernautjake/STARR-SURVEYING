// app/api/dnd/library/chat/route.ts — the rules-library chat.
//
// Always FOCUSED on one game system: answers are grounded in that system's authoritative catalog
// (systemGroundingBlock → the deterministic rules block, plus scoped store entries when they
// retrieve), so the chat can never answer a Pathfinder question with D&D rules.
//
// When the question looks like it's really about ANOTHER system (detectOtherSystem), we still
// answer for the focused system and append one clarifying question — never refuse, never silently
// switch. See lib/dnd/system-detect.ts.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { dndComplete, dndAiConfigured, DND_AI_MODEL } from '@/lib/dnd/ai';
import { systemGroundingBlock } from '@/lib/dnd/grounding';
import { detectOtherSystem, crossSystemInstruction } from '@/lib/dnd/system-detect';
import { normalizeSystem, systemLabel, SYSTEM_AMBIGUOUS } from '@/lib/dnd/systems';
import { getCharacterAccess } from '@/lib/dnd/characters';
import { normalizeCharacter } from '@/app/dnd/_sheet/data/blank';
import { characterDigest, adjudicationInstruction } from '@/lib/dnd/character-digest';
import { isIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { igCharacterDigest } from '@/lib/dnd/systems/intuitive-games/digest';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2CharacterDigest } from '@/lib/dnd/systems/pathfinder2e/digest';

export const maxDuration = 60;

const SYSTEM_PROMPT = [
  'You are the rules librarian for a tabletop RPG campaign hub. You help players and GMs FIND and',
  'UNDERSTAND rules, feats, abilities, classes and conditions — and, when you are given a',
  "character's sheet, RULE on how those rules apply to that character in a specific situation.",
  '',
  'Rules of engagement:',
  '· Answer ONLY from the authoritative rules block you are given. It is the source of truth.',
  '· If the block does not cover the question, SAY SO plainly ("the reference here doesn\'t cover X")',
  '  and say what you do know. NEVER invent a rule, a number, or a page reference.',
  '· Where the rules genuinely leave a situation unsettled, say that, give your most defensible',
  '  reading, label it as a reading, and hand the call to the DM. A confident wrong ruling is worse',
  '  than an honest "the rules do not say".',
  '· NEVER borrow mechanics from another game system. Editions differ in ways that look subtle and',
  '  are not (a 5e proficiency bonus is not a Pathfinder 2e level-added proficiency).',
  '· Be concrete: quote the actual numbers, dice and names from the block.',
  '· Be brief. 1–3 short paragraphs, or a tight bulleted list. No preamble, no "great question".',
  '· Plain prose. You may use **bold** for rule names and short bullets starting with "· ".',
].join('\n');

interface ChatTurn {
  role: 'user' | 'ai';
  text: string;
}

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured (missing ANTHROPIC_API_KEY).' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });

  let focus = normalizeSystem(body?.system);
  const history = (Array.isArray(body?.history) ? body.history : []).slice(-6) as ChatTurn[];

  // ── optional character context (adjudication) ───────────────────────────────
  // When a characterId is given, the chat rules on THAT character rather than answering in the
  // abstract. Access is checked exactly like any other read of a sheet — a chat endpoint must not
  // become a way to read a character you can't open. A character you can't see is simply ignored
  // (the question still gets a general answer) rather than erroring, since the id is incidental.
  let digest: string | null = null;
  let characterName: string | null = null;
  const characterId = typeof body?.characterId === 'string' ? body.characterId : null;
  if (characterId) {
    const res = await getCharacterAccess(characterId).catch(() => null);
    if (res?.access) {
      const row = res.access.character;
      const data = normalizeCharacter((row.data as unknown) ?? {});
      // The CHARACTER'S system wins over whatever the client asked to focus on: a ruling for this
      // sheet must use this sheet's rulebook.
      const charSystem = normalizeSystem((row as { system?: string }).system);
      if (charSystem !== SYSTEM_AMBIGUOUS) focus = charSystem;
      characterName = row.name;
      digest = characterDigest(data, focus);
      // A bespoke-sheet character's real numbers live in a system sidecar the general characterDigest
      // doesn't read — the IG state (active stance, conditions + their computed penalty, feats/powers) in
      // data.ig, and the PF2 derived numbers (AC, saves, Class/Spell DC, Strike + skill totals) in
      // data.pf2e. Append the matching one so the librarian rules WITH the character's real state.
      const igData = (row.data as { ig?: unknown } | null)?.ig;
      if (isIGCharacter(igData)) digest = `${digest}\n\n${igCharacterDigest(igData)}`;
      const pf2Data = (row.data as { pf2e?: unknown } | null)?.pf2e;
      if (isPF2Character(pf2Data)) digest = `${digest}\n\n${pf2CharacterDigest(pf2Data)}`;
    }
  }

  const label = systemLabel(focus);

  // Does this look like a question about a DIFFERENT system than the chat is focused on?
  const hint = detectOtherSystem(question, focus);

  try {
    // The grounding block is deterministic — it works with no embeddings key. Scoped store
    // entries top it up when retrieval finds anything.
    const grounding = await systemGroundingBlock(focus === SYSTEM_AMBIGUOUS ? null : focus, question).catch(() => null);

    const system = [
      SYSTEM_PROMPT,
      focus === SYSTEM_AMBIGUOUS
        ? 'The reader has NOT chosen a system. Answer only in edition-neutral terms, and ask them to pick a system for specific numbers.'
        : `The reader's chosen system focus is ${label}. Answer for ${label}.`,
      grounding?.instruction,
      digest && characterName ? adjudicationInstruction(characterName, label) : null,
      hint ? crossSystemInstruction(hint, label) : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const priorTurns = history
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .map((m) => `${m.role === 'user' ? 'Reader' : 'Librarian'}: ${m.text.trim()}`)
      .join('\n');

    const user = [
      grounding?.block || null,
      digest ? `THE CHARACTER'S SHEET (facts — use these numbers, not a generic character's):\n${digest}` : null,
      priorTurns ? `Conversation so far:\n${priorTurns}` : null,
      `Question: ${question}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const reply = await dndComplete({ system, user, maxTokens: 1024, temperature: 0.3 });

    return NextResponse.json({
      reply,
      system: focus,
      systemLabel: label,
      model: DND_AI_MODEL,
      grounded: grounding?.matched ?? 0,
      // Tells the UI whether this answer was adjudicated against a sheet or answered in general.
      character: characterName,
      // Surfaced so the UI can show a "switch focus" affordance next to the answer.
      hint: hint ? { key: hint.key, name: hint.name, matched: hint.matched, reason: hint.reason } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI call failed.' }, { status: 502 });
  }
}
