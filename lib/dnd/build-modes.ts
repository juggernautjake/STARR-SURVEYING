// lib/dnd/build-modes.ts — the three character-creation modes (Phase V, Slice 4). The chosen mode
// drives how the AI builder behaves; it's persisted on the character (dnd_characters.build_mode).
export type BuildMode = 'ruthless' | 'questioning' | 'stepbystep';

export const BUILD_MODES: { key: BuildMode; name: string; blurb: string }[] = [
  { key: 'ruthless', name: 'Ruthless', blurb: 'Builds the whole character now — no questions. Makes the best call on anything missing.' },
  { key: 'questioning', name: 'Questioning', blurb: 'Builds what’s clear, then asks you about anything missing, confusing, or conflicting.' },
  { key: 'stepbystep', name: 'Step-by-step', blurb: 'You define every stat, feature, ability and mechanic (native or custom), guided one step at a time.' },
];

export function normalizeBuildMode(value: unknown): BuildMode {
  const v = String(value ?? '').trim().toLowerCase();
  return v === 'ruthless' || v === 'stepbystep' ? v : 'questioning';
}

/** The instruction appended to the builder's system prompt for the chosen mode. It never overrides
 *  the system grounding (no cross-system / no invented rules) — it only changes how gaps are handled. */
export function buildModeInstruction(mode: BuildMode): string {
  switch (mode) {
    case 'ruthless':
      return (
        'BUILD MODE: RUTHLESS. Build the ENTIRE character now with no questions. Make the best decision ' +
        'you can for anything missing, unclear or conflicting, and leave no gaps — fill every field. Still ' +
        'obey the system grounding (only the chosen system, never invent cross-system rules); when you must ' +
        'choose, pick the most standard option for the system and note that choice in `unmapped`.'
      );
    case 'stepbystep':
      return (
        'BUILD MODE: STEP-BY-STEP. Do NOT auto-fill the sheet. Apply only edits the user has explicitly ' +
        'provided. Your job is to guide the user through defining each stat, feature, ability and mechanic ' +
        '(native to the system or custom) one at a time — list the next step(s) and any needed questions in ' +
        '`unmapped` (each phrased as a question for the user); make no assumptions.'
      );
    case 'questioning':
    default:
      return (
        'BUILD MODE: QUESTIONING. Build everything that is clearly supported by the sources. For anything ' +
        'missing, ambiguous, or conflicting, do NOT guess — list it in `unmapped` phrased as a specific ' +
        'question for the user to resolve. Only fill fields you are confident about.'
      );
  }
}
