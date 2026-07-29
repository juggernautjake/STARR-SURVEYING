// lib/dnd/homebrew/transpose.ts — carry a piece of homebrew into another system (P6-18).
//
// The owner's ask: *"a system translator that when prompted, could look at a feat, creature, class, etc, and
// transpose it into another system and create a variant of the homebrewed thing. The user could review it
// and approve it or deny it or tell the AI to try again, along with a few notes on what they want
// different. The AI would then try again to generate the thing to be different but still correct according
// to the original thing and true to the new system mechanics, as well as considering any notes the user
// gave. The user can continue this process until satisfied, or they can choose to edit the AI generated
// thing to make it exactly what they want if it is close."*
//
// THE REVIEW LOOP IS THE FEATURE, not the generation. A one-shot translation is a party trick; a translation
// you can reject with a sentence of explanation and have re-attempted is a tool. So the shape here is:
// generate into a real, editable DRAFT the author owns → they approve, discard, retry with notes, or open it
// in the builder and finish it by hand.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
//  1. **A transposed piece is never silently authoritative.** It carries `origin_id` and is created as a
//     private draft, so it cannot appear in a library or on someone's sheet until a human has looked at it.
//     The one thing worse than a bad translation is a bad translation nobody knows is a translation.
//
//  2. **It is a NEW piece, not an edit of the original.** Retrying rewrites the same draft rather than
//     spawning another, so a fussy author ends up with one variant they like instead of nine they rejected.
import { homebrewKindLabel, type HomebrewContent } from './model';
import { kindSpec, kindIsMechanicalIn } from './kinds';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

/** What the model is asked to produce — the same field vocabulary the builder uses, so a transposed draft
 *  opens in the form with no translation layer. */
export interface TransposedDraft {
  name: string;
  summary: string;
  description: string;
  /** The mechanical shape for the TARGET system, when that kind carries one there. */
  payload?: unknown;
  /** The model's own account of what it changed and why. Shown in the review, because "what did it decide
   *  to do differently" is the question a reviewer actually has. */
  rationale?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Defensively read the model's output. Returns null when there is not enough to review — an empty draft
 *  presented as a translation wastes the author's attention worse than an error does. */
export function normalizeTransposed(raw: unknown): TransposedDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  const description = str(r.description);
  if (!name || !description) return null;
  return {
    name,
    summary: str(r.summary),
    description,
    ...(r.payload !== undefined ? { payload: r.payload } : {}),
    ...(str(r.rationale) ? { rationale: str(r.rationale) } : {}),
  };
}

export const TRANSPOSE_SYSTEM_PROMPT = [
  'You translate tabletop RPG homebrew from one game system into another.',
  '',
  'Your job is to preserve what the content IS — its fiction, its role at the table, the feeling of using',
  'it — while expressing it in the target system\'s own mechanics. A faithful translation is not a literal',
  'one: if the source uses a mechanic the target system does not have, find the target\'s nearest genuine',
  'equivalent rather than importing the foreign mechanic or inventing a new one.',
  '',
  'HARD RULES:',
  '· Use ONLY mechanics that genuinely exist in the target system. Never import the source system\'s',
  '  vocabulary, and never invent a subsystem the target does not have.',
  '· If something in the source has no honest equivalent, say so in "rationale" and adapt it — do not',
  '  fabricate a mechanic to carry it across.',
  '· Match the target system\'s power level and idiom, not the source\'s numbers. A +2 in one system is not',
  '  a +2 in another.',
  '· Keep the name unless the name itself is system-specific.',
  '',
  'Respond with ONLY a JSON object:',
  '{',
  '  "name": "...",',
  '  "summary": "one line",',
  '  "description": "the full rules text, written in the target system\'s voice",',
  '  "rationale": "what you changed and why, in two or three sentences"',
  '}',
].join('\n');

/** The instruction for one attempt. `notes` is the author's steer on a retry — the part that turns this
 *  from a one-shot into a conversation. */
export function transposeUserPrompt(
  source: HomebrewContent,
  targetSystem: string,
  opts: { notes?: string; previous?: TransposedDraft | null } = {},
): string {
  const spec = kindSpec(source.kind);
  const from = source.system === 'any' ? 'a system-agnostic description' : systemLabel(normalizeSystem(source.system));
  const to = systemLabel(normalizeSystem(targetSystem));

  const lines: string[] = [
    `Translate this ${homebrewKindLabel(source.kind).toLowerCase()} from ${from} into ${to}.`,
    '',
    `Kind: ${homebrewKindLabel(source.kind)} — ${spec.blurb}`,
    `Name: ${source.name}`,
  ];
  if (source.summary) lines.push(`Summary: ${source.summary}`);
  if (source.description) lines.push('', 'Rules text:', source.description);
  if (source.payload && typeof source.payload === 'object') {
    lines.push('', 'Mechanical payload (JSON):', JSON.stringify(source.payload, null, 2).slice(0, 6000));
  }

  // Whether the TARGET can carry mechanics at all. Without this the model invents a payload for a system
  // that has no bridge to consume it, and the author reviews numbers that would never resolve.
  if (!kindIsMechanicalIn(source.kind, targetSystem)) {
    lines.push('', `NOTE: a ${homebrewKindLabel(source.kind).toLowerCase()} in ${to} is written as rules text on this platform — describe the mechanics fully in prose and do not attempt a structured payload.`);
  }

  // The retry. Showing the PREVIOUS attempt matters as much as the notes: without it the model cannot tell
  // what the author is reacting to, and reliably reproduces the thing they just rejected.
  if (opts.previous) {
    lines.push(
      '',
      'YOUR PREVIOUS ATTEMPT (the author was not satisfied with this):',
      JSON.stringify({ name: opts.previous.name, summary: opts.previous.summary, description: opts.previous.description }, null, 2).slice(0, 4000),
    );
  }
  if (opts.notes?.trim()) {
    lines.push('', 'WHAT THE AUTHOR WANTS DIFFERENT:', opts.notes.trim(), '', 'Address this specifically. Everything they did not mention should stay as it was.');
  }
  return lines.join('\n');
}

/** The line shown on a transposed piece so nobody mistakes it for hand-authored work. Stored in the
 *  description rather than only in the UI, because the description is what travels — into the library, into
 *  an export, into the AI grounding. A provenance note that only exists in one component is not provenance. */
export function transposeCredit(source: HomebrewContent, sourceSystem: string): string {
  const from = sourceSystem === 'any' ? 'a system-agnostic original' : systemLabel(normalizeSystem(sourceSystem));
  return `_AI-translated from “${source.name}” (${from}), and not yet checked by a human._`;
}
