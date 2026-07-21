'use client'
// The Codex layout (CX-1 … CX-9) — identity column on the left, a stack of simultaneously-open
// resizable panes on the right.
//
// SHIPS ALONGSIDE THE CLASSIC LAYOUT, never replacing it. Every existing character uses the
// classic sheet, including sheets in live streamed games; swapping the layout under a table
// mid-campaign is not a change anyone asked for. `char.sheetLayout` selects, defaulting to
// 'classic', so nothing changes for anyone who does not pick this.
//
// WHY THE PANE CONTENTS ARE THE EXISTING COMPONENTS, UNCHANGED. Every pane below renders the same
// component the classic tab renders. That is the whole reason this is a layout and not a fork: a
// Codex-specific SpellsPanel would be a second implementation of spell rendering to keep in sync
// with the first, and the two would diverge on the first bug fixed in only one. Panes reflow by
// CSS container queries against their own height (theme.css), which needs no per-component work.
//
// SKINS COME FOR FREE, which is the point of putting the branch here rather than higher up. App
// keeps ownership of the `.dnd-sheet skin-<id> variant-<x>` root and the theme CSS variables;
// this component renders inside it and styles itself entirely from those same `var(--…)` tokens.
// So every skin and every colour theme applies to the Codex without a single skin-specific rule.
import { useMemo } from 'react'
import { useChar } from '../state/store'
import { useSheetConfig } from '../state/sheetConfig'
import IdentityColumn from './IdentityColumn'
import PaneStack, { type PaneDef } from './PaneStack'
import { usePaneStack } from './usePaneStack'
import Abilities from '../components/Abilities'
import SavesSkills from '../components/SavesSkills'
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
import EditReviewPanel from '../components/EditReviewPanel'
import Reactions from '../components/Reactions'
import DiceTray from '../components/DiceTray'
import { md } from '../lib/inline'

/** Skills opens by default, per the owner's ask. */
const DEFAULT_PANE = 'skills'

export default function CodexLayout({ artUrl, ownerName }: { artUrl?: string | null; ownerName?: string | null }) {
  const { char, canWrite, characterId } = useChar()
  const config = useSheetConfig()

  // Availability gating is the SAME test the classic tab bar applies — module registration for
  // module panes, and the data-or-canWrite rule for Spells that stops a martial getting an empty
  // pane while still letting a caster with no spells yet reach the place spells are added.
  const hasSpellcasting =
    (char.spells?.length ?? 0) > 0 ||
    !!char.spellcasting?.ability ||
    Object.keys(char.spellcasting?.slots ?? {}).length > 0

  const defs: PaneDef[] = useMemo(() => {
    const all: (PaneDef & { module?: string; when?: boolean })[] = [
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

  // The canonical order IS the def order — one source, so the rail and the stack cannot disagree
  // about where a pane belongs.
  const order = useMemo(() => defs.map((d) => d.id), [defs])
  // Keyed by character, so a player's layout for one character does not follow them to another.
  const stack = usePaneStack(characterId, order, DEFAULT_PANE)

  return (
    <div className="codex">
      <IdentityColumn artUrl={artUrl} ownerName={ownerName} />
      <div className="codex-main">
        {/* CX-7 — the cross-cutting furniture. Conditions and active effects went INTO the
            identity column (they change the numbers printed above them, so they belong beside
            those numbers). What is left is the review queue, reactions and the dice tray.
            Reactions and the review queue sit above the stack because both are prompts to act
            NOW and must not be buried inside a pane the player may not have open. */}
        <EditReviewPanel />
        <Reactions />
        <PaneStack defs={defs} stack={stack} />
        {/* The dice tray is docked BELOW the stack rather than in the sidebar the classic layout
            gives it: the Codex has already spent the horizontal budget on two columns, and a
            third would leave every one of them too narrow to read. */}
        <div className="codex-tray"><DiceTray /></div>
        <div className="footer">click a stat to roll · double-click to edit · drag a section edge to resize it</div>
      </div>
    </div>
  )
}
