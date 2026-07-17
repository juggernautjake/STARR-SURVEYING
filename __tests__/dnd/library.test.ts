// __tests__/dnd/library.test.ts — the rules library's page model + search.
// Both are pure and DB-free on purpose: the library must be fully readable and searchable with
// no embeddings key and no seeded dnd_system_entries rows (which is the current live state).
import { describe, it, expect } from 'vitest';
import { libraryPageFor, allLibraryPages, searchLibrary, taglineFor } from '@/lib/dnd/library';
import { GAME_SYSTEMS } from '@/lib/dnd/systems';
import { rulesForSystem } from '@/lib/dnd/system-rules';

describe('library pages', () => {
  it('builds a page for every registered system', () => {
    const pages = allLibraryPages();
    expect(pages.length).toBe(GAME_SYSTEMS.length);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const p of pages) {
      expect(p.name, `${p.key} name`).toBeTruthy();
      expect(p.source, `${p.key} source`).toBeTruthy();
      expect(p.sections.length, `${p.key} sections`).toBeGreaterThanOrEqual(6);
      // Every section must actually carry content — no empty shells.
      for (const s of p.sections) {
        const filled = !!(s.body?.length || s.facts?.length || s.chips?.length || s.table?.rows.length);
        expect(filled, `${p.key} → ${s.title} has content`).toBe(true);
      }
    }
  });

  it('returns null for an unknown system', () => {
    expect(libraryPageFor('not-a-system')).toBeNull();
  });

  it('uses each system’s OWN nouns rather than calling everything a class', () => {
    const titles = (k: string) => libraryPageFor(k)!.sections.map((s) => s.title);
    expect(titles('blades')).toContain('Playbooks');
    expect(titles('blades')).toContain('Heritages');
    expect(titles('cyberpunk-red')).toContain('Roles');
    expect(titles('shadowrun6e')).toContain('Archetypes');
    expect(titles('shadowrun6e')).toContain('Metatypes');
    expect(titles('coc7e')).toContain('Occupations');
    expect(titles('pathfinder2e')).toContain('Ancestries');
    expect(titles('pathfinder2e')).toContain('Backgrounds'); // PF2-only section
    expect(titles('pathfinder2e')).toContain('Armor');
    expect(titles('pathfinder2e')).toContain('Weapons');
    expect(titles('pathfinder2e')).toContain('Spells');
    expect(titles('dnd5e-2024')).toContain('Classes');
    // Backgrounds/Armor/Weapons are PF2-only library sections today — they must NOT leak into 5e pages.
    expect(titles('dnd5e-2024')).not.toContain('Backgrounds');
    expect(titles('dnd5e-2024')).not.toContain('Weapons');
  });

  it('states plainly when a system has no levels', () => {
    const adv = (k: string) => libraryPageFor(k)!.sections.find((s) => s.id === 'advancement')!.facts!.find((f) => f.label === 'Levels')!.value;
    expect(adv('coc7e')).toMatch(/NO character levels/);
    expect(adv('blades')).toMatch(/NO character levels/);
    expect(adv('dnd5e-2024')).toMatch(/Levels 1–20/);
  });

  it('taglines characterise the core maths honestly', () => {
    expect(taglineFor(rulesForSystem('coc7e')!)).toMatch(/d100 roll-under/);
    expect(taglineFor(rulesForSystem('coc7e')!)).toMatch(/no levels/);
    expect(taglineFor(rulesForSystem('blades')!)).toMatch(/highest die/);
    expect(taglineFor(rulesForSystem('shadowrun6e')!)).toMatch(/count hits/);
    expect(taglineFor(rulesForSystem('cyberpunk-red')!)).toMatch(/1d10/);
    expect(taglineFor(rulesForSystem('dnd5e-2014')!)).toMatch(/levels 1–20/);
  });

  it('the class table shows a hit die for 5e and flat HP for PF2', () => {
    const t = (k: string) => libraryPageFor(k)!.sections.find((s) => s.id === 'classes')!.table!;
    expect(t('dnd5e-2014').headers).toContain('Hit die');
    expect(t('dnd5e-2014').rows.find((r) => r[0] === 'Barbarian')![2]).toBe('d12');
    expect(t('pathfinder2e').headers).toContain('HP / level');
    expect(t('pathfinder2e').rows.find((r) => r[0] === 'Barbarian')![2]).toBe('12');
  });
});

describe('searchLibrary', () => {
  it('finds a rule by keyword within one system', () => {
    const hits = searchLibrary('sanity', 'coc7e');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.system === 'coc7e')).toBe(true);
  });

  it('scoped search NEVER leaks another system', () => {
    for (const key of GAME_SYSTEMS.map((s) => s.key)) {
      const hits = searchLibrary('attack', key);
      expect(hits.every((h) => h.system === key), `${key} scoped`).toBe(true);
    }
  });

  it('cross-system search reports which system each hit came from', () => {
    const hits = searchLibrary('barbarian');
    expect(hits.length).toBeGreaterThan(0);
    const systems = new Set(hits.map((h) => h.system));
    // Barbarian exists in both 5e editions and both Pathfinders.
    expect(systems.size).toBeGreaterThan(1);
    for (const h of hits) expect(h.systemName).toBeTruthy();
  });

  it('requires every word to match (AND, not OR)', () => {
    const hits = searchLibrary('zzzznotaword sanity', 'coc7e');
    expect(hits).toEqual([]);
  });

  it('ranks an exact name match first', () => {
    const hits = searchLibrary('stealth', 'dnd5e-2014');
    expect(hits[0].name.toLowerCase()).toBe('stealth');
    expect(hits[0].kind).toBe('skill');
  });

  it('finds classes, skills, species, conditions and feats by kind', () => {
    expect(searchLibrary('wizard', 'dnd5e-2014').some((h) => h.kind === 'class')).toBe(true);
    expect(searchLibrary('acrobatics', 'dnd5e-2014').some((h) => h.kind === 'skill')).toBe(true);
    expect(searchLibrary('tiefling', 'dnd5e-2014').some((h) => h.kind === 'species')).toBe(true);
    expect(searchLibrary('poisoned', 'dnd5e-2014').some((h) => h.kind === 'condition')).toBe(true);
    expect(searchLibrary('lucky', 'dnd5e-2014').some((h) => h.kind === 'feat')).toBe(true);
  });

  it('surfaces backgrounds by name, scoped per system (PF2 AND 5e 2024)', () => {
    const pf2Acolyte = searchLibrary('acolyte', 'pathfinder2e').find((h) => h.kind === 'background');
    expect(pf2Acolyte).toBeTruthy();
    expect(pf2Acolyte!.body).toMatch(/Religion/);
    // 2024 5e backgrounds are now first-class rules content (they carry the ability increases + Origin
    // feat) and searchable too — each system returns its OWN Acolyte, never the other's.
    const dndAcolyte = searchLibrary('acolyte', 'dnd5e-2024').find((h) => h.kind === 'background');
    expect(dndAcolyte).toBeTruthy();
    expect(dndAcolyte!.body).toMatch(/Origin feat/i); // the 2024-shaped body, not the PF2 one
  });

  it('surfaces individual PF2 subclass options by name (draconic bloodline, thief racket)', () => {
    const draconic = searchLibrary('draconic', 'pathfinder2e').find((h) => h.kind === 'subclass');
    expect(draconic).toBeTruthy();
    expect(draconic!.body).toMatch(/Sorcerer/);
    expect(searchLibrary('thief', 'pathfinder2e').some((h) => h.kind === 'subclass' && /Rogue/.test(h.body))).toBe(true);
    // System-scoped: a PF2 bloodline name yields no subclass hit under a 5e system.
    expect(searchLibrary('draconic', 'dnd5e-2024').some((h) => h.kind === 'subclass')).toBe(false);
  });

  it('surfaces PF2 spells by name with rank + tradition, system-scoped', () => {
    const fireball = searchLibrary('fireball', 'pathfinder2e').find((h) => h.kind === 'spell');
    expect(fireball).toBeTruthy();
    expect(fireball!.body).toMatch(/rank 3/);
    expect(fireball!.body).toMatch(/arcane/);
    // A cantrip reads as such.
    const shield = searchLibrary('shield', 'pathfinder2e').find((h) => h.kind === 'spell');
    expect(shield!.body).toMatch(/cantrip/);
    // PF2-only in the library — searching a 5e system for a PF2 spell name yields no PF2 spell hit here.
    expect(searchLibrary('force barrage', 'dnd5e-2024').some((h) => h.kind === 'spell')).toBe(false);
  });

  it('surfaces PF2 armor and weapons by name, system-scoped', () => {
    const plate = searchLibrary('full plate', 'pathfinder2e').find((h) => h.kind === 'armor');
    expect(plate).toBeTruthy();
    expect(plate!.body).toMatch(/\+6 AC/);
    const longsword = searchLibrary('longsword', 'pathfinder2e').find((h) => h.kind === 'weapon');
    expect(longsword).toBeTruthy();
    expect(longsword!.body).toMatch(/1d8 slashing/);
    // Gear is PF2-only in the library — a PF2 weapon name yields no weapon hit under a 5e system.
    expect(searchLibrary('longsword', 'dnd5e-2024').some((h) => h.kind === 'weapon')).toBe(false);
  });

  it('finds the non-d20 systems’ own vocabulary', () => {
    expect(searchLibrary('moxie', 'coc7e')).toEqual([]); // not a CoC concept
    expect(searchLibrary('trauma', 'blades').length).toBeGreaterThan(0);
    expect(searchLibrary('cyberpsychosis', 'cyberpunk-red').length).toBeGreaterThan(0);
    expect(searchLibrary('essence', 'shadowrun6e').length).toBeGreaterThan(0);
  });

  it('is empty for a blank query', () => {
    expect(searchLibrary('   ')).toEqual([]);
    expect(searchLibrary('')).toEqual([]);
  });
});

// The point of the glossary: a DM mid-session searches a term and gets the actual rule, not a
// one-line stub. These lock that in.
describe('searchLibrary returns full EXPLANATIONS, not stubs', () => {
  it('a condition lookup returns its real mechanical effect', () => {
    const hit = searchLibrary('blinded', 'dnd5e-2024')[0];
    expect(hit.name).toBe('Blinded');
    expect(hit.body.length).toBeGreaterThan(150);
    expect(hit.body).toMatch(/disadvantage/i);
    expect(hit.body).toMatch(/advantage/i);
  });

  it('a lookup gives the EDITION-correct answer', () => {
    const a = searchLibrary('exhaustion', 'dnd5e-2014')[0];
    const b = searchLibrary('exhaustion', 'dnd5e-2024')[0];
    expect(a.body).toMatch(/Hit point maximum halved|Speed halved/i);
    expect(b.body).toMatch(/−2|-2/);
    expect(a.body).not.toBe(b.body);
  });

  it('the glossary article outranks the thin catalog line for the same term', () => {
    const hits = searchLibrary('sanity', 'coc7e');
    expect(hits[0].body.length).toBeGreaterThan(150);
    // The bare "Conditions" list must not be what a reader gets first.
    expect(hits[0].name.toLowerCase()).toContain('sanity');
  });

  it('finds a class FEATURE by name, with its level and rules text', () => {
    const hits = searchLibrary('action surge', 'dnd5e-2024');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].name).toMatch(/Action Surge/i);
    expect(hits[0].body).toMatch(/level 2/i);
  });

  it('finds Sneak Attack and Rage with real numbers', () => {
    expect(searchLibrary('sneak attack', 'dnd5e-2024')[0].body).toMatch(/d6/i);
    expect(searchLibrary('rage', 'dnd5e-2024').length).toBeGreaterThan(0);
  });

  it('a non-d20 system’s own vocabulary is fully explained', () => {
    const stress = searchLibrary('stress', 'blades')[0];
    expect(stress.body.length).toBeGreaterThan(150);
    expect(searchLibrary('humanity', 'cyberpunk-red')[0].body.length).toBeGreaterThan(150);
    expect(searchLibrary('essence', 'shadowrun6e')[0].body.length).toBeGreaterThan(150);
  });

  it('still never leaks across systems once the glossary is in the mix', () => {
    for (const key of GAME_SYSTEMS.map((s) => s.key)) {
      for (const h of searchLibrary('damage', key)) expect(h.system, key).toBe(key);
    }
  });
});

describe('full class data projects into library search (Slice 8b)', () => {
  it('surfaces class FEATURES by name + level for systems with full class data', () => {
    // 2024 (built earlier) and 2014 (built this session) both expose their class features to search.
    expect(searchLibrary('action surge', 'dnd5e-2024').some((h) => h.name === 'Action Surge' && h.kind === 'feature')).toBe(true);
    expect(searchLibrary('brutal critical', 'dnd5e-2014').some((h) => h.name === 'Brutal Critical' && h.kind === 'feature')).toBe(true);
    expect(searchLibrary('sneak attack', 'dnd5e-2014').some((h) => h.name === 'Sneak Attack')).toBe(true);
  });

  it('a class feature never leaks across systems (2014 Brutal Critical is not a 2024 result)', () => {
    // 2024 Barbarian has Brutal STRIKE, not Brutal Critical — the 2014 feature must not appear under 2024.
    expect(searchLibrary('brutal critical', 'dnd5e-2024').some((h) => h.name === 'Brutal Critical')).toBe(false);
  });
});

describe('full 2024 feats project into library search (Slice 8b)', () => {
  it('surfaces a 2024 feat with its real benefit text + category, not a stub', () => {
    const alert = searchLibrary('alert', 'dnd5e-2024').find((h) => h.kind === 'feat' && h.name === 'Alert');
    expect(alert).toBeTruthy();
    expect(alert!.body).toMatch(/origin feat/i);      // carries the category
    expect(alert!.body.length).toBeGreaterThan(60);   // full text, not "Alert — a feat in D&D 5e"
  });

  it('a fighting-style feat resolves with its rules text', () => {
    const archery = searchLibrary('archery', 'dnd5e-2024').find((h) => h.kind === 'feat');
    expect(archery?.name).toBe('Archery');
    expect(archery!.body).toMatch(/\+2/); // Archery gives +2 to ranged attack rolls
  });
});

describe('Intuitive Games feats carry full rules text (IG buildout A7 + A8)', () => {
  it('renders feats as a Feat/Prerequisites/Effect table (the whole General + Combat list, not a sample)', () => {
    const page = libraryPageFor('intuitive-games')!;
    const feats = page.sections.find((s) => s.id === 'feats')!;
    expect(feats.table).toBeTruthy();
    expect(feats.chips).toBeUndefined();
    expect(feats.table!.headers).toEqual(['Feat', 'Prerequisites', 'Effect']);
    expect(feats.table!.rows.length).toBeGreaterThanOrEqual(150); // 83 General + 68 Combat
    expect(feats.lead).toMatch(/from intuitivegames\.net/i);
    expect(feats.lead).toMatch(/Combat/); // the lead now notes Combat coverage too
    const alert = feats.table!.rows.find((r) => r[0] === 'Alert');
    expect(alert?.[1]).toMatch(/Perception/); // prerequisite column
    expect(alert?.[2]).toMatch(/flat-footed/i); // effect column
  });

  it('a general feat is searchable with its prerequisites + effect', () => {
    const toughness = searchLibrary('toughness', 'intuitive-games').find((h) => h.kind === 'feat');
    expect(toughness?.name).toBe('Toughness');
    expect(toughness!.body).toMatch(/5 extra hit points/i);
    const quick = searchLibrary('quick caster', 'intuitive-games').find((h) => h.kind === 'feat');
    expect(quick!.body).toMatch(/one fewer action/i);
  });

  it('a combat feat — including a Mythic Stance and a Style — resolves with real IG rules', () => {
    const cleave = searchLibrary('cleave', 'intuitive-games').find((h) => h.kind === 'feat');
    expect(cleave!.body).toMatch(/3-action activity/i);
    const dragon = searchLibrary('dragon stance', 'intuitive-games').find((h) => h.kind === 'feat');
    expect(dragon!.body).toMatch(/additional 1d10/i);
    const power = searchLibrary('power attack', 'intuitive-games').find((h) => h.kind === 'feat');
    expect(power!.body).toMatch(/extra damage equal to your level/i);
  });

  it('does not surface the old sample-feat stub for IG (the real feats replace it)', () => {
    const alert = searchLibrary('alert', 'intuitive-games').find((h) => h.kind === 'feat' && h.name === 'Alert');
    expect(alert!.body.length).toBeGreaterThan(40); // real effect text, not "Alert — a feat in ..."
  });
});

describe('Intuitive Games library is complete (IG buildout A17 completeness guard)', () => {
  it('surfaces every major section of intuitivegames.net (no silent regression)', () => {
    const page = libraryPageFor('intuitive-games')!;
    const ids = new Set(page.sections.map((s) => s.id));
    // Every page of the site is represented as a library section.
    const required = [
      'core', 'abilities', 'advancement', 'character-building', 'damage', 'classes', 'skills', 'combat-skills',
      'species', 'backgrounds', 'stances', 'conditions', 'feats', 'powers', 'defensive-powers', 'actions',
      'redistribution', 'companions', 'weapons', 'weapon-properties', 'armor', 'shields', 'equipment',
      'tools', 'magical-items',
    ];
    for (const id of required) expect(ids.has(id), `IG library is missing the "${id}" section`).toBe(true);
    // Every section carries real content (no empty shells).
    for (const s of page.sections) {
      const filled = !!(s.body?.length || s.facts?.length || s.chips?.length || s.table?.rows.length);
      expect(filled, `IG section "${s.title}" has content`).toBe(true);
    }
  });
});

describe('Intuitive Games damage/cover/movement mechanics surface (IG buildout A1)', () => {
  it('renders a Damage/cover/movement section with the damage Fortitude save + damage types', () => {
    const page = libraryPageFor('intuitive-games')!;
    const dmg = page.sections.find((s) => s.id === 'damage')!;
    expect(dmg.lead).toMatch(/Fortitude save.*DC equals the total HP lost/i);
    expect(dmg.table!.rows.some((r) => /Bleed/.test(r[0]))).toBe(true);
    expect(dmg.body!.some((b) => /Impassable/.test(b))).toBe(true); // cover
    expect(dmg.body!.some((b) => /Hustle/.test(b))).toBe(true); // movement
  });

  it('a damage type and a cover type are searchable', () => {
    expect(searchLibrary('bleed', 'intuitive-games').some((h) => h.kind === 'damage-type')).toBe(true);
    expect(searchLibrary('partial coverage', 'intuitive-games').some((h) => h.kind === 'cover')).toBe(true);
  });

  it('the IG core mechanics resolve in search (redistribution, damage save, skills)', () => {
    expect(searchLibrary('redistribution', 'intuitive-games').some((h) => h.name === 'Redistribution')).toBe(true);
    const dmg = searchLibrary('fortitude save damage', 'intuitive-games').find((h) => /Taking damage/.test(h.name));
    expect(dmg?.body).toMatch(/DC equals the total HP lost/i);
    expect(searchLibrary('take 10', 'intuitive-games').some((h) => h.name === 'Skill checks')).toBe(true);
  });
});

describe('Intuitive Games character-building order surfaces on the library (IG buildout A2)', () => {
  it('lists the level-1 build steps + the progression note', () => {
    const page = libraryPageFor('intuitive-games')!;
    const build = page.sections.find((s) => s.id === 'character-building')!;
    expect(build.body!.length).toBeGreaterThanOrEqual(9); // 8 steps + progression, at least
    expect(build.body!.some((b) => /8 Ability Score Boosts/.test(b))).toBe(true);
    expect(build.body!.some((b) => /Combat Feat and one General Feat/.test(b))).toBe(true);
    expect(build.body!.some((b) => /Specializations begin at Level 4/.test(b))).toBe(true);
  });
});

describe('Intuitive Games skills carry the system rules + combat skills (IG buildout A3)', () => {
  it('the skills section leads with how skill checks work, and a Combat Skills section is added', () => {
    const page = libraryPageFor('intuitive-games')!;
    const skills = page.sections.find((s) => s.id === 'skills')!;
    expect(skills.lead).toMatch(/ranks .* proficiency .* ability modifier/i);
    expect(skills.lead).toMatch(/Take 10|Take 20/);
    const combat = page.sections.find((s) => s.id === 'combat-skills')!;
    expect(combat.lead).toMatch(/opposed .* Reflex save|Reflex save/i);
    expect(combat.chips).toEqual(expect.arrayContaining(['Dirty Trick', 'Grapple', 'Sunder']));
  });

  it('a combat skill is searchable', () => {
    const trip = searchLibrary('trip', 'intuitive-games').find((h) => h.kind === 'combat-skill');
    expect(trip?.name).toBe('Trip');
  });

  it('combat skills do not leak into another system', () => {
    expect(libraryPageFor('dnd5e-2024')!.sections.some((s) => s.id === 'combat-skills')).toBe(false);
  });
});

describe('Intuitive Games gear surfaces on the library (IG buildout A13/A14)', () => {
  it('renders Weapons (with the WIP note), Weapon Properties, Armor (DR), and Shields sections', () => {
    const page = libraryPageFor('intuitive-games')!;
    const ids = page.sections.map((s) => s.id);
    for (const id of ['weapons', 'weapon-properties', 'armor', 'shields']) expect(ids).toContain(id);
    const weapons = page.sections.find((s) => s.id === 'weapons')!;
    expect(weapons.lead).toMatch(/WORK IN PROGRESS/i); // no named roster yet — recorded, not fabricated
    expect(weapons.table!.rows.find((r) => r[0] === 'Light')?.[3]).toMatch(/Throwing/);
    const armor = page.sections.find((s) => s.id === 'armor')!;
    expect(armor.lead).toMatch(/Damage Reduction/i);
    expect(armor.table!.rows.find((r) => r[0] === 'Metal Armor')?.[2]).toBe('8'); // DR
  });

  it('armor and shields are searchable with their stats', () => {
    const metal = searchLibrary('metal armor', 'intuitive-games').find((h) => h.kind === 'armor');
    expect(metal!.body).toMatch(/DR 8/);
    const buckler = searchLibrary('buckler', 'intuitive-games').find((h) => h.kind === 'shield');
    expect(buckler).toBeTruthy();
  });

  it('IG gear does not leak into another system', () => {
    expect(libraryPageFor('dnd5e-2024')!.sections.some((s) => s.id === 'weapon-properties')).toBe(false);
  });

  it('renders Equipment (packs, WIP note), Tools (WIP), and Magical Items (12 enchantments)', () => {
    const page = libraryPageFor('intuitive-games')!;
    const equip = page.sections.find((s) => s.id === 'equipment')!;
    expect(equip.lead).toMatch(/work in progress/i); // the empty item tables are recorded as WIP
    expect(equip.table!.rows.find((r) => /Adventurer/.test(r[0]))?.[1]).toBe('8 Solidas');
    const tools = page.sections.find((s) => s.id === 'tools')!;
    expect(tools.body?.[0]).toMatch(/WORK IN PROGRESS/i); // tools page has no roster
    const magic = page.sections.find((s) => s.id === 'magical-items')!;
    expect(magic.lead).toMatch(/Eldritch Jewels/);
    expect(magic.table!.rows).toHaveLength(12);
    expect(magic.table!.rows.find((r) => r[0] === 'Healing')?.[1]).toMatch(/20 HP/);
  });

  it('an enchantment is searchable', () => {
    const heal = searchLibrary('healing', 'intuitive-games').find((h) => h.kind === 'magic-item');
    expect(heal!.body).toMatch(/Eldritch Jewel/);
  });
});

describe('Intuitive Games classes surface fully on the library (IG buildout A10)', () => {
  it('renders all 13 classes grouped into 4 groups with the class-system overview', () => {
    const page = libraryPageFor('intuitive-games')!;
    const classes = page.sections.find((s) => s.id === 'classes')!;
    expect(classes.table!.headers).toEqual(['Group', 'Classes']);
    expect(classes.table!.rows).toHaveLength(4); // 4 groups
    const totalClasses = classes.table!.rows.reduce((n, r) => n + r[1].split(', ').length, 0);
    expect(totalClasses).toBe(13);
    expect(classes.lead).toMatch(/13 classes in 4 groups/);
    expect(classes.lead).toMatch(/Subclasses.*Arcanist/); // subclasses noted, distinct from classes
    const combat = classes.table!.rows.find((r) => r[0] === 'Combat');
    expect(combat?.[1]).toMatch(/Fighter/);
  });

  it('every IG class is still searchable (via classNames)', () => {
    expect(searchLibrary('sohei', 'intuitive-games').some((h) => h.kind === 'class')).toBe(true);
    expect(searchLibrary('conduit', 'intuitive-games').some((h) => h.kind === 'class')).toBe(true);
  });

  it('the classes section carries per-class detail (granted stance, defensive power, powers) + the taxonomy note', () => {
    const classes = libraryPageFor('intuitive-games')!.sections.find((s) => s.id === 'classes')!;
    // Taxonomy finding surfaced for ALL FOUR parent classes.
    expect(classes.body!.some((b) => /Archon →.*Conduit →.*Fighter →.*Wizard →/.test(b))).toBe(true);
    const sohei = classes.body!.find((b) => b.startsWith('Sohei'));
    expect(sohei).toMatch(/Precise stance/);
    expect(sohei).toMatch(/Counterattack defensive power/);
    expect(sohei).toMatch(/Flurry/); // a listed power
    // Magic group: Wizard is a class with a starting power; Arcanist a subclass; Magician/Shaman flagged WIP.
    const wizard = classes.body!.find((b) => b.startsWith('Wizard'));
    expect(wizard).toMatch(/Elemental Blast/);
    expect(classes.body!.find((b) => b.startsWith('Arcanist'))).toMatch(/subclass of Wizard/);
    expect(classes.body!.find((b) => b.startsWith('Magician'))).toMatch(/work in progress|not captured/i);
  });
});

describe('Intuitive Games backgrounds surface on the library (IG buildout A6)', () => {
  it('renders a Backgrounds table with HP, boosts, proficiencies, and the granted Stance', () => {
    const page = libraryPageFor('intuitive-games')!;
    const bg = page.sections.find((s) => s.id === 'backgrounds')!;
    expect(bg).toBeTruthy();
    expect(bg.table!.headers).toEqual(['Background', 'HP', 'Ability boosts', 'Proficiencies', 'Stance']);
    expect(bg.table!.rows).toHaveLength(10);
    const soldier = bg.table!.rows.find((r) => r[0] === 'Soldier');
    expect(soldier?.[1]).toBe('12'); // HP
    expect(soldier?.[4]).toBe('Menacing'); // stance
  });

  it('a background is searchable with its grants', () => {
    const hunter = searchLibrary('hunter', 'intuitive-games').find((h) => h.kind === 'background');
    expect(hunter!.body).toMatch(/Offensive Stance/);
    expect(hunter!.body).toMatch(/Nature/);
  });

  it('IG backgrounds are system-scoped (its Academic ≠ a PF2 background search)', () => {
    // "cosmopolitan" is an IG-only background name; it must not resolve under PF2.
    expect(searchLibrary('cosmopolitan', 'pathfinder2e').some((h) => h.kind === 'background')).toBe(false);
  });
});

describe('Intuitive Games Redistribution surfaces on the library (site scrub /redistribution)', () => {
  it('renders a Redistribution section with the full Conduit mechanic', () => {
    const page = libraryPageFor('intuitive-games')!;
    const redis = page.sections.find((s) => s.id === 'redistribution')!;
    expect(redis.body![0]).toMatch(/two-action activity/i);
    expect(redis.body![0]).toMatch(/Fine Particles, Fluids, Gems, Metal, Stone, Oozes, and Organic Matter/);
    expect(redis.body![0]).toMatch(/Launch Material.*1d4/);
  });

  it('does not leak into another system', () => {
    expect(libraryPageFor('dnd5e-2024')!.sections.some((s) => s.id === 'redistribution')).toBe(false);
  });
});

describe('Intuitive Games companion creatures surface on the library (IG buildout A12)', () => {
  it('renders a Companion Creatures section with the 4 types + advancement rules, and marks combat rules absent', () => {
    const page = libraryPageFor('intuitive-games')!;
    const comp = page.sections.find((s) => s.id === 'companions')!;
    expect(comp).toBeTruthy();
    expect(comp.table!.rows).toHaveLength(4);
    expect(comp.table!.rows.map((r) => r[0])).toEqual(['Beast Companion', 'Elemental', 'Familiar', 'Swarm']);
    // The site does not define combat direction — recorded as such, not fabricated (Ground Rule 2).
    expect(comp.lead).toMatch(/not yet published/i);
    const swarm = comp.table!.rows.find((r) => r[0] === 'Swarm');
    expect(swarm?.[1]).toBe('Packmaster');
    expect(swarm?.[2]).toMatch(/Swarming stance/i);
  });

  it('a companion type is searchable', () => {
    const familiar = searchLibrary('familiar', 'intuitive-games').find((h) => h.kind === 'companion');
    expect(familiar!.body).toMatch(/Eldritch Binder/);
  });
});

describe('Intuitive Games powers, defensive powers, and actions surface on the library (IG buildout A11)', () => {
  it('renders Powers & Spells, Defensive Powers, and Actions sections', () => {
    const page = libraryPageFor('intuitive-games')!;
    const ids = page.sections.map((s) => s.id);
    expect(ids).toContain('powers');
    expect(ids).toContain('defensive-powers');
    expect(ids).toContain('actions');
    const powers = page.sections.find((s) => s.id === 'powers')!;
    expect(powers.table!.headers).toEqual(['Power', 'School', 'Effect']);
    const blast = powers.table!.rows.find((r) => r[0] === 'Elemental Blast');
    expect(blast?.[1]).toBe('Evocation');
    expect(blast?.[2]).toMatch(/ranged elemental attack/i);
    const actions = page.sections.find((s) => s.id === 'actions')!;
    expect(actions.table!.rows.find((r) => /Stride/.test(r[0]))?.[1]).toBe('1 action');
  });

  it('lists the complete site spell roster + flags spells still awaiting effect text', () => {
    const powers = libraryPageFor('intuitive-games')!.sections.find((s) => s.id === 'powers')!;
    expect(powers.body!.some((b) => /Complete spell roster/i.test(b))).toBe(true);
    expect(powers.body!.some((b) => /Evocation:.*Wave Crash/.test(b))).toBe(true);
    expect(powers.body!.some((b) => /Awaiting verbatim effect text/i.test(b))).toBe(true);
  });

  it('a power and a defensive power are searchable with effect text', () => {
    const blast = searchLibrary('elemental blast', 'intuitive-games').find((h) => h.kind === 'power');
    expect(blast!.body).toMatch(/damage = level \+ Int mod/i);
    const sidestep = searchLibrary('sidestep', 'intuitive-games').find((h) => h.kind === 'defensive-power');
    expect(sidestep!.body).toMatch(/5-foot step/i);
  });

  it('powers do not leak into a system without the mechanic', () => {
    expect(libraryPageFor('dnd5e-2024')!.sections.some((s) => s.id === 'powers')).toBe(false);
  });
});

describe('Intuitive Games ancestries carry full trait text (IG buildout A5)', () => {
  it('renders the ancestries as a full-trait-text table with the trait-system rules', () => {
    const page = libraryPageFor('intuitive-games')!;
    const species = page.sections.find((s) => s.id === 'species')!;
    expect(species.table).toBeTruthy();
    expect(species.chips).toBeUndefined();
    expect(species.lead).toMatch(/cannot be retrained/i);
    expect(species.table!.rows).toHaveLength(10);
    const dwarf = species.table!.rows.find((r) => r[0] === 'Dwarf');
    expect(dwarf?.[1]).toMatch(/Cave Vision/);
    expect(dwarf?.[1]).toMatch(/darkvision out to a range of 30 feet/i);
  });

  it('includes Brendan\'s ancestry art as a gallery (the 8 the site publishes), credited', () => {
    const species = libraryPageFor('intuitive-games')!.sections.find((s) => s.id === 'species')!;
    expect(species.images).toBeTruthy();
    expect(species.images!.gallery.length).toBe(8); // Human + Sprite have no site art
    expect(species.images!.gallery.find((g) => g.caption === 'Dwarf')?.src).toBe('/dnd/intuitive-games/ancestries/dwarf.png');
    expect(species.images!.credit).toMatch(/Brendan/);
    // Non-IG systems get no image gallery.
    expect(libraryPageFor('dnd5e-2024')!.sections.find((s) => s.id === 'species')?.images).toBeUndefined();
  });

  it('an ancestry and its individual traits are searchable', () => {
    const barkskin = searchLibrary('barkskin', 'intuitive-games').find((h) => h.kind === 'trait');
    expect(barkskin?.name).toBe('Barkskin');
    expect(barkskin!.body).toMatch(/DR 2/);
    const dwarf = searchLibrary('dwarf', 'intuitive-games').find((h) => h.kind === 'species');
    expect(dwarf!.body).toMatch(/Robust/);
  });

  it('IG ancestry traits do not leak into another system', () => {
    expect(searchLibrary('barkskin', 'dnd5e-2024').some((h) => h.kind === 'trait')).toBe(false);
  });
});

describe('Intuitive Games stances surface on the library page (IG buildout A9)', () => {
  it('renders a Stances section with the general rules + a Basic/Advanced table for all 10', () => {
    const page = libraryPageFor('intuitive-games')!;
    const stances = page.sections.find((s) => s.id === 'stances')!;
    expect(stances).toBeTruthy();
    expect(stances.lead).toMatch(/Only one stance can be active/i);
    expect(stances.table!.headers).toEqual(['Stance', 'Basic (below Lv 5)', 'Advanced (Lv 5+)']);
    expect(stances.table!.rows).toHaveLength(10);
    const defensive = stances.table!.rows.find((r) => r[0] === 'Defensive');
    expect(defensive?.[2]).toMatch(/Damage Reduction/i);
  });

  it('a stance is searchable by name with both tiers of text', () => {
    const hit = searchLibrary('defensive stance', 'intuitive-games').find((h) => h.kind === 'stance');
    expect(hit?.name).toBe('Defensive Stance');
    expect(hit!.body).toMatch(/advantage on all Reflex saves/i);
    expect(hit!.body).toMatch(/Damage Reduction/i);
  });

  it('stances do not leak into a system without the mechanic', () => {
    expect(libraryPageFor('dnd5e-2024')!.sections.some((s) => s.id === 'stances')).toBe(false);
    expect(searchLibrary('offensive stance', 'dnd5e-2024').some((h) => h.kind === 'stance')).toBe(false);
  });
});

describe('Intuitive Games conditions carry full rules text (IG buildout A4)', () => {
  it('renders the conditions section as a full-text table, not name chips', () => {
    const page = libraryPageFor('intuitive-games')!;
    const cond = page.sections.find((s) => s.id === 'conditions')!;
    expect(cond.table).toBeTruthy();
    expect(cond.chips).toBeUndefined();
    expect(cond.table!.headers).toEqual(['Condition', 'Effect']);
    expect(cond.table!.rows).toHaveLength(18);
    const grappled = cond.table!.rows.find((r) => r[0] === 'Grappled');
    expect(grappled?.[1]).toMatch(/flat-footed/i);
  });

  it('search returns the real mechanical effect, not a one-line stub', () => {
    const grappled = searchLibrary('grappled', 'intuitive-games').find((h) => h.kind === 'condition');
    expect(grappled?.name).toBe('Grappled');
    expect(grappled!.body).toMatch(/two hands/i);
    expect(grappled!.body.length).toBeGreaterThan(60);
    // "flat-footed" resolves to its own full condition text too.
    const flat = searchLibrary('flat-footed', 'intuitive-games').find((h) => h.kind === 'condition');
    expect(flat!.body).toMatch(/until they take an action in combat/i);
  });

  it('IG condition text does not leak into another system', () => {
    // "heatstroke" is an IG condition; a 5e search must not surface it as a condition.
    expect(searchLibrary('heatstroke', 'dnd5e-2024').some((h) => h.kind === 'condition')).toBe(false);
  });
});
