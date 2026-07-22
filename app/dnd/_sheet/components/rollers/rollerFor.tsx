'use client'
// rollerFor — the roller-template REGISTRY (RO-2): maps a `RollerTemplateId` to its 5e roller node.
//
// The four rollers were previously baked into each sheet layout (Classic→Dice Core, Codex→Sigil Stack,
// Dashboard→Roll Board, Play→Impact). The owner wants the roller template chosen INDEPENDENTLY of the
// sheet template, so the sheet now resolves the chosen id and asks this registry for the matching node
// rather than hardcoding one. All four read the same 5e `activeRoll` store, so any of them renders under
// any layout. (PF2/IG feed their own roller nodes today; unifying those is RO-5.)
import DiceTray from '../DiceTray'
import SigilStack from './SigilStack'
import RollBoard from './RollBoard'
import ImpactRoller from './ImpactRoller'
import RollStage from '../RollStage'
import { SigilStage } from './SigilStack'
import { BoardStage } from './RollBoard'
import { ImpactStage } from './ImpactRoller'
import type { RollerTemplateId } from '@/lib/dnd/roller-templates'

/** The full 5e roller node (STAGE + the 5e controls that read the store) for a template id. Used inside
 *  the 5e sheet. Exhaustive over the four ids; falls back to Dice Core. */
export function rollerFor(id: RollerTemplateId): React.ReactNode {
  switch (id) {
    case 'sigil':
      return <SigilStack />
    case 'board':
      return <RollBoard />
    case 'impact':
      return <ImpactRoller />
    case 'core':
    default:
      return <DiceTray />
  }
}

/** Just the resolution STAGE for a template id — the animated visual (die tumble / sigil cascade / card
 *  deal / number scramble) that reads only the `RollFeed`, with NONE of the 5e store-bound controls. This
 *  is what the bespoke PF2/IG sheets mount (RO-5): they publish their rolls into the feed and pair the
 *  stage with their OWN controls, so the same animations + sounds + template picker work on every system. */
export function rollerStageFor(id: RollerTemplateId): React.ReactNode {
  switch (id) {
    case 'sigil':
      return <SigilStage />
    case 'board':
      return <BoardStage />
    case 'impact':
      return <ImpactStage />
    case 'core':
    default:
      return <RollStage />
  }
}
