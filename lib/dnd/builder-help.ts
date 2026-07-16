// lib/dnd/builder-help.ts — the character-builder help copy (Phase V, Slice 9).
//
// One place for the "what does this mean / what happens to my info" text used across the
// builder surfaces (new-character form, build kit, style browser, edit chat). Keeping it
// here lets the UI stay tidy (short `<InfoTip>`s pull from these) and lets a test assert
// the key surfaces actually have help.
export interface HelpEntry {
  /** Short label for the field/function. */
  title: string;
  /** The explanation shown in the tip. */
  body: string;
}

export const BUILDER_HELP = {
  name: {
    title: 'Character Name',
    body: 'The character’s display name across the site. You can rename any time — from this field, the sheet header, or the AI edit chat.',
  },
  system: {
    title: 'Game System',
    body: 'The ruleset the AI grounds your build in. It will use ONLY that system’s rules, feats, spells, weapons and numbers — never another system’s, never invented. Choose “system-ambiguous” to stay edition-neutral (generic mechanics only). You can also transpose a finished character into another system later.',
  },
  buildMode: {
    title: 'Build Mode',
    body: 'How the AI handles gaps. Ruthless: builds the whole character now, no questions, best-effort. Questioning: builds what’s clear, then asks you about anything missing, ambiguous, or where two uploads conflict. Step-by-step: nothing is auto-filled — the AI guides you through each stat, feature, ability and mechanic one at a time.',
  },
  sources: {
    title: 'Source Files',
    body: 'Your existing character in any form — a D&D Beyond PDF, a Word/Excel sheet, a CSV, notes, or screenshots. The AI reads these to fill the sheet. They’re stored privately with your character; anything it can’t map onto a field is saved in the notes so nothing is lost.',
  },
  notes: {
    title: 'Notes',
    body: 'Free text for anything the files don’t cover — backstory, homebrew rules, how a signature ability works, personality. The AI treats these as authoritative context alongside your files.',
  },
  art: {
    title: 'Reference Art',
    body: 'Character art and style references. These are saved with your character and used for its portrait/token and as inspiration when you build a custom-styled sheet — they don’t change any game mechanics.',
  },
  style: {
    title: 'Style & Mechanics',
    body: 'Describe the vibe you want and any special mechanics (transformations, unique resources, signature moves). Mechanics feed the grounded build; style feeds the look of a custom sheet.',
  },
  uploadsFate: {
    title: 'What happens to what I upload?',
    body: 'Files and notes are stored privately with your character and read by the AI to build the sheet. What maps onto a field becomes sheet data; what doesn’t is kept in the character’s notes so you can resolve it later. Nothing is shared with other players unless you make the character visible.',
  },
  aiBuild: {
    title: 'AI Build',
    body: 'The AI reads your sources + notes and fills the sheet, staying strictly inside your chosen system. It can only ever edit THIS character — never other characters, pages, or anything else. Re-run it any time after adding more sources.',
  },
  buildQuestions: {
    title: 'Open Questions',
    body: 'When the AI hits a gap, an ambiguity, or two uploads that disagree, it asks here instead of guessing. Your answers become the source of truth and the sheet rebuilds around them.',
  },
  sheetStyle: {
    title: 'Sheet Style',
    body: 'The visual skin of the sheet. Every style works with every game system, and you can switch any time. Pick a ready-made look here, or let the AI compose a fully custom one.',
  },
  editChat: {
    title: 'Edit with AI',
    body: 'Ask for any change in plain language — new feats, abilities, mechanics, transformations, spells, or stat tweaks — and it applies live to this sheet. The assistant is scoped to this one character and stays within your chosen system.',
  },
} satisfies Record<string, HelpEntry>;

export type BuilderHelpKey = keyof typeof BUILDER_HELP;
