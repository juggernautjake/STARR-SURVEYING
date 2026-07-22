'use client'
// fivePanels — the 5e system's PANEL SET (T-2), shared by every format shell.
//
// The multi-format architecture (see the planning doc) is "FORMAT = shell, SYSTEM = panels": a
// system exposes an ordered list of named content blocks, and each format (Classic tabs, Codex
// panes, Dashboard cards, Play) merely ARRANGES that one list. This hook is the 5e panel set —
// the single source both the Codex and the Dashboard read, so they cannot drift about which
// sections exist, in what order, gated how. It is exactly the `defs[]` the Codex used to build
// inline, lifted out so a second format did not have to copy it.
import { useMemo } from 'react'
import { useChar } from '../state/store'
import { useSheetConfig } from '../state/sheetConfig'
import SavesSkills from '../components/SavesSkills'
import Abilities from '../components/Abilities'
import CombatPanel from '../components/CombatPanel'
import Resources from '../components/Resources'
import Attacks from '../components/Attacks'
import SpellsPanel from '../components/SpellsPanel'
import Forms from '../components/Forms'
import FormAbilities from '../components/FormAbilities'
import Features from '../components/Features'
import Balance from '../components/Balance'
import Progression from '../components/Progression'
import Inventory from '../components/Inventory'
import Bio from '../components/Bio'
import DescriptionsPanel from '../components/DescriptionsPanel'
import CharacterGallery from '../components/CharacterGallery'
import MlmPanel from '../components/MlmPanel'
import CustomSectionView from '../components/CustomSectionView'
import { normalizeCustomSections } from '@/lib/dnd/custom-sections'
import { md } from '../lib/inline'

/** One content block a format can place. `render` draws the section with the 5e components against
 *  the live character; `count` is an optional badge ("Skills · 18"); the shell decides placement. */
export interface SheetPanel {
  id: string
  label: string
  emoji: string
  render: () => React.ReactNode
  count?: number
}

/**
 * The 5e panels available to THIS character, module- and data-gated exactly as the classic tab bar
 * and the Codex rail are — so every format shows the same set. Canonical order is the array order;
 * a format that wants a different order sorts by it, but the SET is one source.
 */
export function useFivePanels(): SheetPanel[] {
  const { char, canWrite, setChar } = useChar()
  const config = useSheetConfig()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the raw blob is the stable input; the normalized
  // array is derived, so keying the memo on it (not its new-every-render output) is correct.
  const customSections = useMemo(() => normalizeCustomSections(char.customSections), [char.customSections])

  // Section RELEVANCE (D-12): a section only appears when it makes sense for THIS character's data — not
  // for every editor. A Spellcaster (an ability/slots) OR anyone who actually HAS spells gets Spells; a
  // Barbarian/Rogue with none does not (spells are added via the Build Kit / library / AI, which sets the
  // data and makes the section appear). This is what keeps the sheet free of empty, class-irrelevant tabs.
  const hasSpellcasting =
    (char.spells?.length ?? 0) > 0 ||
    !!char.spellcasting?.ability ||
    Object.keys(char.spellcasting?.slots ?? {}).length > 0
  const hasForms = (char.forms?.length ?? 0) > 0

  return useMemo(() => {
    const all: (SheetPanel & { module?: string; when?: boolean })[] = [
      { id: 'skills', label: 'Skills', emoji: '◇', render: () => <SavesSkills />, count: Object.keys(char.skills ?? {}).length },
      { id: 'abilities', label: 'Abilities', emoji: '⬡', render: () => <Abilities /> },
      { id: 'combat', label: 'Combat', emoji: '❤', render: () => <><CombatPanel /><Resources /></> },
      { id: 'attacks', label: 'Attacks', emoji: '✦', render: () => <Attacks />, count: char.attacks?.length },
      { id: 'spells', label: 'Spells', emoji: '✨', render: () => <SpellsPanel />, count: char.spells?.length, when: hasSpellcasting },
      // Forms is now DATA-gated, not skin-module-gated: a character shows the shapeshift Forms section only
      // if it actually HAS forms (so a Rogue on a forms-enabled skin like 'lazzuh' no longer inherits it).
      { id: 'forms', label: 'Forms', emoji: '⇡', render: () => <><FormAbilities /><Forms /></>, when: hasForms },
      { id: 'features', label: 'Features', emoji: '✧', render: () => <><Features /><Balance /><Progression /></>, count: char.features?.length },
      { id: 'business', label: 'Business', emoji: '💎', render: () => <MlmPanel />, module: 'mlm' },
      { id: 'gear', label: 'Gear', emoji: '❖', render: () => <Inventory />, count: char.inventory?.length },
      { id: 'story', label: 'Story', emoji: '❯', render: () => <><Bio /><DescriptionsPanel /></> },
      {
        id: 'overview',
        label: 'Dossier',
        emoji: '◎',
        render: () => (
          <>
            <section>
              <div className="card">
                <h3>Dossier</h3>
                {char.bio.intro.map((p, i) => (
                  <p key={i}>{md(p)}</p>
                ))}
              </div>
            </section>
            <Resources />
          </>
        ),
      },
      { id: 'gallery', label: 'Gallery', emoji: '◲', render: () => <CharacterGallery /> },
      // Player-authored custom sections (D-13) — one panel each, editable inline by owners. They persist on
      // `data.customSections`, so a section added on any template appears (and edits) on every template.
      ...customSections.map((s) => ({
        id: `custom:${s.id}`,
        label: s.title,
        emoji: s.icon || '✚',
        count: s.blocks.length || undefined,
        render: () => (
          <section>
            <div className="card">
              <h3>{s.title}</h3>
              <CustomSectionView
                section={s}
                editable={canWrite}
                onChange={(next) =>
                  setChar((ch) => ({
                    ...ch,
                    customSections: normalizeCustomSections(ch.customSections).map((x) => (x.id === next.id ? next : x)),
                  }))
                }
                onDelete={() =>
                  setChar((ch) => ({
                    ...ch,
                    customSections: normalizeCustomSections(ch.customSections).filter((x) => x.id !== s.id),
                  }))
                }
              />
            </div>
          </section>
        ),
      })),
    ]
    return all
      .filter((d) => (!d.module || config.modules.includes(d.module as never)) && d.when !== false)
      .map(({ module: _m, when: _w, ...def }) => def)
  }, [char, config.modules, hasSpellcasting, hasForms, customSections, canWrite, setChar])
}
