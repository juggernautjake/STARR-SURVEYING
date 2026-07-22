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
  const { char, canWrite } = useChar()
  const config = useSheetConfig()

  // Same Spells gate as the classic tabs / Codex: a martial with no spells gets no empty pane, but
  // a caster with none YET (or any editor) still reaches the place spells are added.
  const hasSpellcasting =
    (char.spells?.length ?? 0) > 0 ||
    !!char.spellcasting?.ability ||
    Object.keys(char.spellcasting?.slots ?? {}).length > 0

  return useMemo(() => {
    const all: (SheetPanel & { module?: string; when?: boolean })[] = [
      { id: 'skills', label: 'Skills', emoji: '◇', render: () => <SavesSkills />, count: Object.keys(char.skills ?? {}).length },
      { id: 'abilities', label: 'Abilities', emoji: '⬡', render: () => <Abilities /> },
      { id: 'combat', label: 'Combat', emoji: '❤', render: () => <><CombatPanel /><Resources /></> },
      { id: 'attacks', label: 'Attacks', emoji: '✦', render: () => <Attacks />, count: char.attacks?.length },
      { id: 'spells', label: 'Spells', emoji: '✨', render: () => <SpellsPanel />, count: char.spells?.length, when: hasSpellcasting || canWrite },
      { id: 'forms', label: 'Forms', emoji: '⇡', render: () => <><FormAbilities /><Forms /></>, module: 'forms' },
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
    ]
    return all
      .filter((d) => (!d.module || config.modules.includes(d.module as never)) && d.when !== false)
      .map(({ module: _m, when: _w, ...def }) => def)
  }, [char, config.modules, hasSpellcasting, canWrite])
}
