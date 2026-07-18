// lib/dnd/homebrew/projection.ts — project shareable homebrew (Area H) into the surfaces that consume it:
// a per-system library SECTION (H2 browse) and an AI GROUNDING block (so the adjudicating AI can explain +
// use a campaign's homebrew). Pure: the caller supplies the catalog list; this shapes it. Keeps the homebrew
// model decoupled from the library types by importing the shared LibrarySection shape here at the edge.
import type { LibrarySection, LibraryEntry } from '@/lib/dnd/library';
import { browseHomebrew, homebrewKindLabel, type HomebrewContent } from './model';

/** The stable id/title of the per-system "Custom / Homebrew" library section. */
export const HOMEBREW_SECTION_ID = 'homebrew';

/**
 * Build the "Custom / Homebrew · Extras" library section for a system from the catalog (H2). Lists the
 * published, in-system pieces as individually-collapsible entries — name + a "Kind · by Creator" brief, and
 * the full rules text on expand. Returns null when the system has no homebrew (so the page omits the section
 * rather than showing an empty one).
 */
export function homebrewLibrarySection(
  list: readonly HomebrewContent[],
  system: string,
  opts: { query?: string } = {},
): LibrarySection | null {
  const pieces = browseHomebrew(list, { system, query: opts.query });
  if (!pieces.length) return null;
  const entries: LibraryEntry[] = pieces.map((c) => ({
    name: c.name,
    brief: `${homebrewKindLabel(c.kind)} · by ${c.creator.name}`,
    detail: [c.summary, c.description].filter(Boolean).join('\n\n') || 'No description provided.',
  }));
  return {
    id: HOMEBREW_SECTION_ID,
    title: 'Custom / Homebrew · Extras',
    lead: 'Community-made content for this system, attributed to its creators. A DM chooses which pieces are legal in their campaign.',
    entries,
  };
}

/**
 * An AI-grounding projection of a system's homebrew (H2). One compact block the grounding can append so the
 * adjudicating AI knows a campaign's homebrew exists, what each piece does, and who made it — without
 * inventing anything. Empty string when there's nothing to ground.
 */
export function homebrewGrounding(list: readonly HomebrewContent[], system: string): string {
  const pieces = browseHomebrew(list, { system });
  if (!pieces.length) return '';
  const lines = pieces.map(
    (c) => `- ${c.name} (${homebrewKindLabel(c.kind)}, by ${c.creator.name}): ${c.summary ?? c.description ?? ''}`.trim(),
  );
  return ['Homebrew content available in this system (use only if the DM has allowed it for the campaign):', ...lines].join('\n');
}
