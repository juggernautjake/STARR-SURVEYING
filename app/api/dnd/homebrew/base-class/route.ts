// app/api/dnd/homebrew/base-class/route.ts — "start from Fighter and modify" (P6-12).
//
// The owner's ask: *"homebrewed classes can have another class they are based off of that the user
// modifies, or they can be totally new."*
//
// GET ?system=…&key=… returns an official class flattened into the Content Studio's DRAFT field shape, so
// the builder can populate its form and the author edits from there. No `key` → the list of classes the
// system offers, for the "Based on" picker.
//
// WHY A ROUTE RATHER THAN SHIPPING THE DATA. `classesForSystem('dnd5e-2024')` is thirteen classes with
// every feature's full rules text at all twenty levels — hundreds of kilobytes. Sending that to the browser
// so a picker can populate one form would be the same mistake the library search route documents about
// resolving hrefs client-side. One class, on demand, once.
//
// The response is DRAFT-SHAPED, not ClassDefinition-shaped: keys match the `class` kind's field schema in
// `kinds.ts`, so the builder can spread it into its values with no translation layer that could drift.
import { NextRequest, NextResponse } from 'next/server';
import { getDndSession } from '@/lib/dnd/auth';
import { classesForSystem, findClass } from '@/lib/dnd/classes/registry';
import { isSharedEngineSystem, normalizeSystem } from '@/lib/dnd/systems';

export async function GET(req: NextRequest) {
  // Authoring is account-gated everywhere else in the Studio; this is an authoring aid, so it matches.
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const system = normalizeSystem(req.nextUrl.searchParams.get('system'));
  const key = (req.nextUrl.searchParams.get('key') ?? '').trim();

  // Only the shared-engine systems have `ClassDefinition` data to derive from. Returning an empty list for
  // the others is the honest answer — the same reason the designers are gated in `HomebrewDesignerLinks`.
  if (!isSharedEngineSystem(system)) return NextResponse.json({ classes: [] });

  if (!key) {
    return NextResponse.json({
      classes: classesForSystem(system).map((c) => ({
        key: c.key,
        name: c.name,
        // Flag homebrew so an author can tell "Fighter" from someone's custom class in the picker.
        custom: !!c.custom,
      })),
    });
  }

  const def = findClass(system, key);
  if (!def) return NextResponse.json({ error: 'No such class in that system.' }, { status: 404 });

  return NextResponse.json({
    draft: {
      basedOn: def.key,
      hitDie: String(def.hitDie),
      primaryAbility: def.primaryAbility,
      savingThrows: def.savingThrows,
      skillCount: def.skillChoices.count,
      skillChoices: def.skillChoices.from,
      armorProficiencies: def.armorProficiencies,
      weaponProficiencies: def.weaponProficiencies,
      startingEquipment: def.startingEquipment ?? [],
      subclassLevel: def.subclassLevel,
      subclassLabel: def.subclassLabel,
      caster: def.spellcasting?.kind ?? 'none',
      casterAbility: def.spellcasting?.ability ? [def.spellcasting.ability] : [],
      // `asiLevels` is a `tags` field in the schema, which stores strings.
      asiLevels: def.asiLevels.map(String),
      resources: (def.resources ?? []).map((r) => ({
        name: r.name,
        resetOn: r.resetOn,
        // The schema's `perLevel` is a comma-separated string. Index 0 is unused in `ClassResource`, so it
        // is dropped here rather than emitted as a leading "0," the author would have to delete.
        perLevel: r.perLevel.slice(1).join(','),
        note: r.note ?? '',
      })),
      // SUBCLASS features are excluded. They belong to a subclass, not to the class being derived — copying
      // them in would produce a class that grants one subclass's features to every character who takes it.
      levels: def.features
        .filter((f) => !f.subclass)
        .map((f) => ({ level: f.level, name: f.name, body: f.body, choice: f.choice ?? '' })),
      // Not the description: a derived class is a NEW class, and inheriting "The Fighter is a master of
      // martial combat…" would have every homebrew read as the thing it was derived from.
    },
  });
}
