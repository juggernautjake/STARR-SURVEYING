// lib/dnd/homebrew/assist.ts — "help me with this one field" (P6-15).
//
// The owner's ask: *"I want it so that AI can help with each step of the build process if the user wants it
// to, but also so that the user can fully build everything from scratch, regardless of system."*
//
// Both halves are requirements. The assist is opt-in per field, never runs on its own, and **never
// auto-applies** — it returns a proposal the author accepts or ignores. Everything remains fully buildable
// with the AI switched off, which is why `dndAiConfigured()` being false hides the buttons rather than
// disabling the form.
//
// STATELESS, and that is the design constraint that shapes everything here. Assist is most useful while
// writing the FIRST draft, before a piece exists and therefore before it has an id. So the route takes the
// draft-in-progress in the request rather than loading a row — which also means the prompt has to carry its
// own context (what kind, what system, what the author has written so far) instead of reading it from a
// database.
import { homebrewKindLabel, type HomebrewKind } from './model';
import { fieldsForKind, kindSpec, kindIsMechanicalIn, type FieldSpec } from './kinds';
import { systemLabel, normalizeSystem } from '@/lib/dnd/systems';

/** Fields worth offering help on: the prose ones. A number, a dropdown or a tag list is faster to type than
 *  to review, and an assist button on every field turns a form into a slot machine. */
export function fieldAcceptsAssist(f: FieldSpec): boolean {
  return f.type === 'text' || f.type === 'textarea';
}

/** Can this field be assisted on this kind? Exported so the route and the UI agree, rather than the route
 *  trusting whatever field name a client sends. */
export function isAssistableField(kind: HomebrewKind, fieldKey: string): boolean {
  const f = fieldsForKind(kind).find((x) => x.key === fieldKey);
  return !!f && fieldAcceptsAssist(f);
}

export const ASSIST_SYSTEM_PROMPT = [
  'You help a tabletop RPG player write ONE FIELD of their homebrew content. They are the author; you are',
  'filling in a blank they asked you to fill.',
  '',
  'RULES:',
  '· Write ONLY the requested field. No preamble, no headings, no commentary, no quotes around it.',
  '· Match what they have already written — their tone, their fiction, their power level. If the rest of',
  '  the piece is grim, do not return something whimsical.',
  '· Use only mechanics that genuinely exist in the stated system. If you are unsure a mechanic exists,',
  '  write the effect in plain language instead of naming a rule you are not certain of.',
  '· Be concise. A summary is one sentence. Rules text is as long as it needs to be and no longer.',
  '· If they have written nothing yet, invent something that fits the name and kind — that is what they',
  '  are asking for.',
  '',
  'Return the field text and nothing else.',
].join('\n');

/** The instruction for one field. Pure, so the tests can assert exactly what context is sent. */
export function assistUserPrompt(
  kind: HomebrewKind,
  system: string,
  fieldKey: string,
  values: Record<string, unknown>,
): string {
  const spec = kindSpec(kind);
  const field = fieldsForKind(kind).find((f) => f.key === fieldKey);
  const scope = system === 'any' ? 'any system (write it system-agnostically)' : systemLabel(normalizeSystem(system));

  const lines: string[] = [
    `They are writing a ${homebrewKindLabel(kind).toLowerCase()} — ${spec.blurb}`,
    `System: ${scope}`,
    '',
    `WRITE THIS FIELD: ${field?.label ?? fieldKey}`,
  ];
  if (field?.help) lines.push(`(${field.help})`);

  // What they have already written. This is the whole reason assist is worth having over a blank prompt:
  // a summary written against the rules text they already have is useful; one written against nothing is a
  // fortune cookie. Only prose and the name are sent — numbers and dropdowns would bloat the prompt
  // without changing the answer.
  const context: string[] = [];
  const name = String(values.name ?? '').trim();
  if (name) context.push(`Name: ${name}`);
  for (const f of fieldsForKind(kind)) {
    if (f.key === fieldKey || !fieldAcceptsAssist(f)) continue;
    const v = String(values[f.key] ?? '').trim();
    if (v) context.push(`${f.label}: ${v}`);
  }
  if (context.length) lines.push('', 'What they have written so far:', ...context);
  else lines.push('', 'They have not written anything else yet.');

  if (system !== 'any' && !kindIsMechanicalIn(kind, system)) {
    lines.push('', `NOTE: a ${homebrewKindLabel(kind).toLowerCase()} in ${scope} is rules text on this platform — write the mechanics out in prose, in full, because nothing will compute them.`);
  }
  return lines.join('\n');
}

/** Tidy the model's answer into something that can go straight into a form field.
 *
 *  Models reliably wrap a single field in quotes or open with "Sure! Here's...". Both are stripped, because
 *  the author is going to paste this into a rules document — and an assist that needs cleaning up by hand
 *  is worse than no assist. */
export function cleanAssistText(raw: string, maxLen = 4000): string {
  let s = (raw ?? '').trim();
  s = s.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
  // A conversational opener before the real answer.
  s = s.replace(/^(sure|certainly|here('s| is)|of course)[^\n]*[:\n]\s*/i, '').trim();
  // Wrapping quotes, only when they wrap the WHOLE thing — a quoted phrase inside the text is the
  // author's content and must survive.
  if (s.length > 1 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('“') && s.endsWith('”')))) {
    s = s.slice(1, -1).trim();
  }
  return s.slice(0, maxLen);
}
