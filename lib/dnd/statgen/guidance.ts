// statgen/guidance — per-system ability-generation + completeness guidance for the AI build modes (AM-1/2).
//
// The ruthless and questioning modes run through one AI ingest; making them produce good, rules-legal,
// level-appropriate results on EVERY system means telling the model the exact stat-generation method for the
// chosen system (they differ sharply — 5e rolls/point-buy + increases, PF2 staged boosts, IG's eight-boost
// method) and that the character must be built COMPLETE for its level. This is the single source of that
// guidance, injected into the grounding instruction, and unit-tested so it can't drift from the same rules
// the manual builder's engines enforce.

/** The exact ability-score generation method for a system, phrased as an instruction to the build AI. */
export function abilityGenerationGuidance(system: string): string {
  switch (system) {
    case 'dnd5e-2014':
      return 'ABILITY SCORES (2014): generate with the standard array (15, 14, 13, 12, 10, 8), point buy ' +
        '(27 points; each score 8–15), OR 4d6-drop-lowest, then ADD the race/subrace ability score increases. ' +
        'Creation cap 20.';
    case 'dnd5e-2024':
      return 'ABILITY SCORES (2024): generate with the standard array (15, 14, 13, 12, 10, 8), point buy ' +
        '(27 points; each score 8–15), OR 4d6-drop-lowest. Ability increases come from the BACKGROUND ' +
        '(+2 and +1, or +1/+1/+1, among the background\'s three abilities) — NOT the species. Creation cap 20.';
    case 'pathfinder2e':
      return 'ATTRIBUTES (Pathfinder 2e): every attribute starts at +0; apply ancestry boosts (plus the ' +
        'ancestry flaw, OR take two free boosts and no flaw), the background (one boost from its pair + one ' +
        'free), the class key attribute, and four free boosts. Each boost within one set targets a DIFFERENT ' +
        'attribute; a boost at +4 or higher is partial (two = +1). Store MODIFIERS, not scores.';
    case 'intuitive-games':
      return 'ABILITY SCORES (Intuitive Games): every ability starts at 10; apply EIGHT +2 boosts at creation, ' +
        'at most two per ability (creation cap 14). Do NOT use point-buy 8–15 or PF2-style boosts. ' +
        'Modifier = floor((score − 10) / 2).';
    default:
      return '';
  }
}

/** The completeness bar the ruthless/questioning modes must hit: a level-appropriate, fully-built character. */
export function buildCompletenessGuidance(levelLabel = 'its level'): string {
  return `Build the character COMPLETE and level-appropriate for ${levelLabel}: every class feature, ` +
    'subclass choice, proficiency, hit points, and level-up selection a character of that level and system ' +
    'would have — not a level-1 stub. Where a legal choice is required and the sources do not state it, make ' +
    'a sensible, rules-legal pick (ruthless) or ask (questioning) rather than leaving it blank.';
}

/** The two joined, for injection into the grounding instruction. Empty systems yield just the completeness bar. */
export function statGenGuidanceFor(system: string): string {
  const gen = abilityGenerationGuidance(system);
  return `${buildCompletenessGuidance()}${gen ? ` ${gen}` : ''}`;
}
