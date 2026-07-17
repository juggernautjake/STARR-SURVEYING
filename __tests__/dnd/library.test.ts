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

  it('surfaces PF2 backgrounds by name (a gap nothing else in the library filled)', () => {
    const acolyte = searchLibrary('acolyte', 'pathfinder2e').find((h) => h.kind === 'background');
    expect(acolyte).toBeTruthy();
    expect(acolyte!.body).toMatch(/Religion/);
    // Backgrounds are PF2-only — searching a 5e system for a PF2 background name yields no background hit.
    expect(searchLibrary('acolyte', 'dnd5e-2024').some((h) => h.kind === 'background')).toBe(false);
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
