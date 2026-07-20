'use client';
// GiveEntryButton — the per-entry "give this to a character" control in the library.
//
// The library page is a server component and renders every content type through one generic
// accordion, so this client wrapper carries both the button and the dialog, and works out what
// KIND of grant a section represents.
//
// The mapping is deliberately conservative. A section only gets a button when we can deliver
// something REAL: a spell resolves against the spell catalog, an item/feature carries its own
// library text. Sections we cannot faithfully deliver as sheet mechanics — classes, species,
// backgrounds — get no button rather than a misleading one that drops a name on a sheet and
// calls it done (Ground Rule 2: never invented).
import { useState } from 'react';
import GiveToCharacter, { type GiveKind } from './GiveToCharacter';

/** What a library section can be granted AS, or null when it cannot be granted faithfully. */
export function grantKindForSection(sectionId: string, system: string): GiveKind | null {
  switch (sectionId) {
    case 'spells':
      // A real SpellDef catalog backs 2024, so those grant as proper spells with structured
      // mechanics. Other systems' spells have effect TEXT but no catalog, so they land as
      // features carrying that text — the same honest treatment IG powers get. Better than no
      // button (the reader could see the spell but hand it to nobody) and better than a
      // 'spell' grant the server would reject for want of a catalogue entry.
      return system === 'dnd5e-2024' ? 'spell' : 'feature';
    // Intuitive Games powers have full effect text but no structured spell catalog, so they
    // land as FEATURES carrying that text — honest, and immediately readable on the sheet.
    case 'powers':
    case 'defensive-powers':
    case 'feats':
    case 'stances':
      return 'feature';
    case 'weapons':
      return 'weapon';
    case 'armor':
    case 'shields':
      return 'armor';
    case 'equipment':
    case 'magical-items':
      return 'item';
    case 'conditions':
      return 'condition';
    default:
      return null; // classes, species, backgrounds, glossary prose…
  }
}

/** What a GLOSSARY entry can be granted as, by its `kind`. Conditions apply directly;
 *  features and class abilities land as features carrying their article text. Mechanics,
 *  terms, stats and actions describe how the game WORKS rather than something you can be
 *  given — "Advantage" is not an item — so they get no button. */
export function grantKindForGlossary(kind: string): GiveKind | null {
  switch (kind) {
    case 'condition': return 'condition';
    case 'feature':
    case 'class': return 'feature';
    default: return null; // mechanic, term, stat, action
  }
}

export default function GiveEntryButton({
  sectionId, name, system, detail, kind: kindOverride,
}: {
  sectionId?: string;
  name: string;
  system: string;
  /** The entry's library text — becomes the feature/item note so the grant carries its rules. */
  detail?: string;
  /** Pass the resolved kind directly when the caller isn't a library SECTION (the glossary). */
  kind?: GiveKind | null;
}) {
  const [open, setOpen] = useState(false);
  const kind = kindOverride ?? (sectionId ? grantKindForSection(sectionId, system) : null);
  if (!kind) return null;

  return (
    <>
      <button
        type="button" onClick={() => setOpen(true)}
        title={`Give ${name} to one of your characters`}
        style={{
          marginTop: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 999,
          background: 'transparent', border: '1px solid var(--hx-teal, #0ac8b9)', color: 'var(--hx-teal, #0ac8b9)',
        }}
      >
        ✚ Give to a character
      </button>
      {open && (
        <GiveToCharacter
          kind={kind}
          name={name}
          system={system}
          // Strip the markdown-lite bullets the library uses so the note reads cleanly on a sheet.
          defaultNote={detail ? detail.replace(/^[·•]\s*/gm, '').slice(0, 900) : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
