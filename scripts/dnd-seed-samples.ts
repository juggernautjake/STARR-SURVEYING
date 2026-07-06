// scripts/dnd-seed-samples.ts — build the demo's sample player characters (Phase L5)
// with the same AI sheet-builder the app uses (I2/G2), then write the full data onto
// the seeded rows. Gives Vera Kade / Sprocket / Nova Vex complete, playable sheets.
// Run: `npx tsx scripts/dnd-seed-samples.ts`. Needs ANTHROPIC_API_KEY + SUPABASE_DB_URL.
import { readFileSync } from 'node:fs';
// @ts-expect-error - no type declarations for 'pg'
import pg from 'pg';
import { dndToolCall } from '../lib/dnd/ai';
import { applySheetEdits, SHEET_EDIT_TOOL } from '../lib/dnd/sheet-edits';
import { blankCharacter } from '../app/dnd/_sheet/data/blank';
import { DEMO_PLAYERS } from '../lib/dnd/constants';

function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const SYSTEM =
  'You are a D&D 5e character architect. Call edit_sheet with the minimal, valid, complete set of edits to ' +
  'build the described character: name, level, all six ability scores (raw), AC/HP/speed, save proficiencies, ' +
  'skills, attacks, class/species features, resources, and notable inventory. Ability scores are raw values, not modifiers.';

const BUILDS: Record<string, string> = {
  'Vera Kade':
    'Build a level 5 human Battle Master Fighter named Vera Kade — a grizzled mercenary captain. STR 16, DEX 14, CON 15, WIS 12. AC 18 (plate). Greatsword (2d6 slashing) and a heavy crossbow (1d10 piercing). Features: Second Wind, Action Surge, Extra Attack, and Battle Master maneuvers (Riposte, Trip Attack, Menacing Attack). A resource for 4 superiority dice (d8, short rest). Proficient STR + CON saves; Athletics, Intimidation, Perception. Feat: Great Weapon Master. Inventory: plate armor, potion of healing x2, a captain’s signet.',
  Sprocket:
    'Build a level 5 rock gnome Artificer (Battle Smith) named Sprocket — a tinkerer with a mechanical wolf. INT 16, CON 14, DEX 13, WIS 12. AC 16. A repeating hand crossbow attack (1d6 piercing, dex). Features: Magical Tinkering, Infuse Item, Steel Defender (mechanical wolf companion), Battle Ready, Extra Attack. Spells known: Cure Wounds, Faerie Fire, Magic Missile, Shield (add these as features noting they are spells). A resource for spell slots. Proficient CON + INT saves; Arcana, Investigation, Medicine, Perception. Inventory: tinker’s tools, potion of healing, spare parts, a hand crossbow.',
  'Nova Vex':
    'Build a level 5 half-elf Bard (College of Glamour) named Nova Vex — a dazzling arcane streamer/performer. CHA 17, DEX 14, CON 13, INT 12. AC 15. A rapier (1d8 piercing, dex). Features: Bardic Inspiration, Jack of All Trades, Song of Rest, Mantle of Inspiration, Enthralling Performance, Expertise. Spells (add as features noting they are spells): Vicious Mockery, Healing Word, Faerie Fire, Hypnotic Pattern, Dissonant Whispers. Resources: Bardic Inspiration (d8) uses, spell slots. Proficient DEX + CHA saves; Performance, Persuasion, Deception, Acrobatics. Inventory: a rapier, a fine lute, a stylish outfit.',
};

async function main() {
  loadEnv();
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const p of DEMO_PLAYERS) {
      const instruction = BUILDS[p.characterName];
      if (!instruction) continue; // Lazzuh has its own full data
      const res = await dndToolCall<{ edits: unknown[] }>({
        system: SYSTEM,
        user: instruction,
        tools: [SHEET_EDIT_TOOL],
        toolChoice: { type: 'tool', name: 'edit_sheet' },
        maxTokens: 4096,
        temperature: 0.4,
      });
      const edits = Array.isArray(res?.input?.edits) ? res!.input.edits : [];
      const data = applySheetEdits(blankCharacter(p.characterName), edits as never);
      await client.query('UPDATE dnd_characters SET data = $1::jsonb, name = $2, updated_at = now() WHERE id = $3', [JSON.stringify(data), data.meta.name || p.characterName, p.characterId]);
      console.log(`✓ ${p.characterName}: ${edits.length} edits — L${data.meta.level}, AC ${data.combat.ac}, ${data.combat.maxHp} HP, ${data.attacks.length} attacks, ${data.features.length} features`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('Sample build failed:', e instanceof Error ? e.message : e); process.exit(1); });
